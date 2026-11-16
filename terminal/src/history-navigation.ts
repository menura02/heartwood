import { HeartwoodError } from './failures.ts';
import type { ChatLine } from './chat-feed.ts';
import { isHistoryCursor } from './history.ts';
import type { HistoryPage } from './history.ts';

export type HistoryPageReader = (room: string, before?: string, signal?: AbortSignal, expectedPeer?: string) => Promise<HistoryPage>;
export interface HistoryResult { lines: ChatLine[]; hasMore: boolean; page: number }

const cursorBudget = 256 * 1024;
interface RoomHistory { next?: string; page: number; cursors: Set<string>; peer?: string; bytes: number }

export class HistoryNavigator {
  private readonly read: HistoryPageReader;
  private readonly rooms = new Map<string, RoomHistory>();
  private readonly pending = new Set<string>();
  private retainedBytes = 0;

  constructor(read: HistoryPageReader) { this.read = read; }

  async latest(room: string, signal?: AbortSignal, expectedPeer?: string): Promise<HistoryResult> {
    return this.load(room, 1, undefined, signal, expectedPeer);
  }

  async older(room: string, signal?: AbortSignal, expectedPeer?: string): Promise<HistoryResult> {
    this.assertIdle(room);
    const state = this.rooms.get(room);
    if (!state || (expectedPeer !== undefined && state.peer !== undefined && state.peer !== expectedPeer)) {
      throw new HeartwoodError('historyNotOpen');
    }
    if (state.next === undefined) throw new HeartwoodError('noOlderEvents');
    return this.load(room, state.page + 1, state.next, signal, expectedPeer);
  }

  private assertIdle(room: string): void {
    if (this.pending.has(room)) throw new HeartwoodError('historyReadPending');
  }

  private forget(room: string): void {
    this.retainedBytes -= this.rooms.get(room)?.bytes ?? 0;
    this.rooms.delete(room);
  }

  private async load(room: string, page: number, before?: string, signal?: AbortSignal,
    expectedPeer?: string): Promise<HistoryResult> {
    this.assertIdle(room);
    this.pending.add(room);
    try {
      const previous = before === undefined ? undefined : this.rooms.get(room);
      signal?.throwIfAborted();
      const {lines, next} = await this.read(room, before, signal, expectedPeer);
      signal?.throwIfAborted();
      const cursors = new Set(previous?.cursors);
      let bytes = previous?.bytes ?? 0;
      if (next !== undefined) {
        if (!isHistoryCursor(next)) throw new HeartwoodError('invalidHistoryPage');
        if (next === before || cursors.has(next)) throw new HeartwoodError('historyCursorStalled');
        cursors.add(next);
        bytes += Buffer.byteLength(next, 'utf8');
        if (cursors.size > 128) {
          const oldest = cursors.values().next().value!;
          cursors.delete(oldest);
          bytes -= Buffer.byteLength(oldest, 'utf8');
        }
      }
      this.forget(room);
      this.rooms.set(room, {next, page, cursors, peer: expectedPeer, bytes});
      this.retainedBytes += bytes;
      // Evict whole rooms so that a retained cursor always keeps its cycle history.
      while (this.rooms.size > 128 || this.retainedBytes > cursorBudget) this.forget(this.rooms.keys().next().value!);
      return {lines, hasMore: next !== undefined, page};
    } finally {
      this.pending.delete(room);
    }
  }
}
