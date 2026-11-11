import { HeartwoodError } from './failures.ts';
import type { ChatLine } from './chat-feed.ts';
import type { HistoryPage } from './history.ts';

export type HistoryPageReader = (room: string, before?: string) => Promise<HistoryPage>;
export interface HistoryResult { lines: ChatLine[]; hasMore: boolean; page: number }

export class HistoryNavigator {
  private readonly read: HistoryPageReader;
  private readonly rooms = new Map<string, {next?: string; page: number}>();
  private readonly pending = new Set<string>();

  constructor(read: HistoryPageReader) { this.read = read; }

  async latest(room: string): Promise<HistoryResult> {
    return this.load(room, 1);
  }

  async older(room: string): Promise<HistoryResult> {
    this.assertIdle(room);
    const state = this.rooms.get(room);
    if (!state) throw new HeartwoodError('historyNotOpen');
    if (state.next === undefined) throw new HeartwoodError('noOlderEvents');
    return this.load(room, state.page + 1, state.next);
  }

  private assertIdle(room: string): void {
    if (this.pending.has(room)) throw new HeartwoodError('historyReadPending');
  }

  private async load(room: string, page: number, before?: string): Promise<HistoryResult> {
    this.assertIdle(room);
    this.pending.add(room);
    try {
      const {lines, next} = await this.read(room, before);
      this.rooms.set(room, {next, page});
      return {lines, hasMore: next !== undefined, page};
    } finally {
      this.pending.delete(room);
    }
  }
}
