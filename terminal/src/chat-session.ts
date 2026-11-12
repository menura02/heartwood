import type { ChatLine } from './chat-feed.ts';

const messageLimit = 200;
const eventLimit = 2048;
const pageSize = 10;

export class ChatSession {
  private readonly displayed = new Map<string, boolean>();
  private readonly messages = new Map<string, ChatLine>();
  private matches?: string[];
  private page = 0;

  display(lines: ChatLine[]): ChatLine[] {
    return lines.filter(line => {
      const readable = line.body !== undefined;
      const previous = this.displayed.get(line.id);
      if (previous === true || previous === readable) return false;
      this.displayed.set(line.id, readable);
      if (this.displayed.size > eventLimit) this.displayed.delete(this.displayed.keys().next().value!);
      if (line.body !== undefined && Buffer.byteLength(line.body) <= 4000) {
        this.messages.set(line.id, line);
        if (this.messages.size > messageLimit) this.messages.delete(this.messages.keys().next().value!);
      }
      return true;
    });
  }

  search(query: string, locale: 'en' | 'tr'): void {
    const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase(locale);
    const target = fold(query);
    this.matches = [...this.messages.values()].filter(line => fold(line.body!).includes(target))
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0)).map(line => line.id);
    this.page = 0;
  }

  results(move = 0): {lines: ChatLine[]; page: number; pages: number; expired: number} | undefined {
    if (!this.matches) return undefined;
    const pages = Math.ceil(this.matches.length / pageSize);
    this.page = Math.max(0, Math.min(this.page + move, pages - 1));
    const ids = this.matches.slice(this.page * pageSize, (this.page + 1) * pageSize);
    const lines = ids.flatMap(id => {
      const line = this.messages.get(id);
      return line ? [line] : [];
    });
    return {lines, page: this.page + 1, pages, expired: ids.length - lines.length};
  }

  clear(): void {
    this.displayed.clear();
    this.messages.clear();
    this.matches = undefined;
  }
}
