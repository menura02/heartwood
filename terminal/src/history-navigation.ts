import { HeartwoodError } from './failures.ts';
import type { ChatLine } from './chat-feed.ts';
import type { HistoryPage } from './history.ts';

export type HistoryPageReader = (room: string, before?: string, signal?: AbortSignal) => Promise<HistoryPage>;
export interface HistoryResult { lines: ChatLine[]; hasMore: boolean; page: number }

export class HistoryNavigator {
  private readonly read: HistoryPageReader;
  private readonly rooms = new Map<string, {next?: string; page: number; cursors: Set<string>}>();
  private readonly pending = new Set<string>();

  constructor(read: HistoryPageReader) { this.read = read; }

  async latest(room: string, signal?: AbortSignal): Promise<HistoryResult> {
    return this.load(room, 1, undefined, signal);
  }

  async older(room: string, signal?: AbortSignal): Promise<HistoryResult> {
    this.assertIdle(room);
    const state = this.rooms.get(room);
    if (!state) throw new HeartwoodError('historyNotOpen');
    if (state.next === undefined) throw new HeartwoodError('noOlderEvents');
    return this.load(room, state.page + 1, state.next, signal);
  }

  private assertIdle(room: string): void {
    if (this.pending.has(room)) throw new HeartwoodError('historyReadPending');
  }

  private async load(room: string, page: number, before?: string, signal?: AbortSignal): Promise<HistoryResult> {
    this.assertIdle(room);
    this.pending.add(room);
    try {
      const cursors = before === undefined ? new Set<string>() : this.rooms.get(room)!.cursors;
      signal?.throwIfAborted();
      const {lines, next} = await this.read(room, before, signal);
      signal?.throwIfAborted();
      if (next !== undefined) {
        if (next === before || cursors.has(next)) throw new HeartwoodError('historyCursorStalled');
        cursors.add(next);
        if (cursors.size > 128) cursors.delete(cursors.values().next().value!);
      }
      this.rooms.delete(room);
      this.rooms.set(room, {next, page, cursors});
      if (this.rooms.size > 128) this.rooms.delete(this.rooms.keys().next().value!);
      return {lines, hasMore: next !== undefined, page};
    } finally {
      this.pending.delete(room);
    }
  }
}
