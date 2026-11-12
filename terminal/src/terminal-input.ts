import { StringDecoder } from 'node:string_decoder';
import { Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';

const start = '\x1b[200~';
const end = '\x1b[201~';

function partialMarker(text: string, marker: string): number {
  for (let length = Math.min(text.length, marker.length - 1); length > 0; length--) {
    if (text.endsWith(marker.slice(0, length))) return length;
  }
  return 0;
}

export class TerminalInput extends Transform {
  readonly isTTY = true;
  private readonly decoder = new StringDecoder('utf8');
  private readonly interrupt: () => void;
  private readonly rejectPaste: () => void;
  private pending = '';
  private paste?: string;
  private oversized = false;
  complete?: () => void;

  constructor(interrupt: () => void, rejectPaste: () => void) {
    super();
    this.interrupt = interrupt;
    this.rejectPaste = rejectPaste;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    if (chunk.length === 1 && chunk[0] === 3) {
      this.pending = '';
      this.paste = undefined;
      this.interrupt();
      done();
      return;
    }
    this.pending += this.decoder.write(chunk);
    this.consume();
    done();
  }

  override _flush(done: TransformCallback): void {
    this.pending += this.decoder.end();
    this.consume();
    if (this.paste === undefined) this.forwardPending();
    done();
  }

  private forward(text: string): void {
    const interrupt = text.indexOf('\x03');
    const input = interrupt === -1 ? text : text.slice(0, interrupt);
    if (this.complete && input.includes('\t')) {
      const parts = input.split('\t');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) this.complete?.();
        if (parts[i]) this.push(parts[i]);
      }
    } else if (input) {
      this.push(input);
    }
    if (interrupt !== -1) this.interrupt();
  }

  private forwardPending(): void {
    const text = this.pending;
    this.pending = '';
    this.forward(text);
  }

  private appendPaste(text: string): void {
    if (this.oversized) return;
    if (this.paste!.length + text.length > 8192) this.oversized = true;
    else this.paste += text;
  }

  private consume(): void {
    while (this.pending) {
      const pasting = this.paste !== undefined;
      const marker = pasting ? end : start;
      const index = this.pending.indexOf(marker);
      if (index < 0) {
        const split = this.pending.length - partialMarker(this.pending, marker);
        const text = this.pending.slice(0, split);
        this.pending = this.pending.slice(split);
        if (pasting) this.appendPaste(text);
        else this.forward(text);
        return;
      }
      const text = this.pending.slice(0, index);
      this.pending = this.pending.slice(index + marker.length);
      if (!pasting) {
        this.forward(text);
        this.paste = '';
        this.oversized = false;
        continue;
      }
      this.appendPaste(text);
      const value = this.paste!;
      this.paste = undefined;
      if (this.oversized || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) this.rejectPaste();
      else this.push(value);
    }
  }
}
