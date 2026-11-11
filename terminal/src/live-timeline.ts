import { ChatFeed } from './chat-feed.ts';
import type { ChatLine } from './chat-feed.ts';
import type { HistoryEvent, RawHistoryPage } from './history.ts';

type Decode = (event: HistoryEvent) => Promise<ChatLine | undefined>;

export class LiveTimeline {
  private cursor: string;
  private readonly feed = new ChatFeed();
  private readonly unresolved = new Map<string, HistoryEvent>();
  private readonly recentCursors = new Set<string>();
  private reading = false;

  constructor(cursor: string) {
    this.cursor = cursor;
    this.recentCursors.add(cursor);
  }

  async initial(events: HistoryEvent[], decode: Decode): Promise<ChatLine[]> {
    return this.show(events, decode);
  }

  async poll(read: (cursor: string) => Promise<RawHistoryPage>, decode: Decode): Promise<ChatLine[]> {
    if (this.reading) throw new Error('Canlı sohbet okuması sürüyor.');
    this.reading = true;
    try {
      const {events, next} = await read(this.cursor);
      if (next !== undefined && this.recentCursors.has(next)) throw new Error('Canlı sohbet imleci ilerlemedi.');
      const lines = await this.show([...this.unresolved.values(), ...events], decode);
      if (next !== undefined) {
        this.cursor = next;
        this.recentCursors.add(next);
        if (this.recentCursors.size > 64) this.recentCursors.delete(this.recentCursors.values().next().value!);
      }
      return lines;
    } finally {
      this.reading = false;
    }
  }

  private async show(events: HistoryEvent[], decode: Decode): Promise<ChatLine[]> {
    const lines: ChatLine[] = [];
    for (const event of events) {
      const line = await decode(event);
      if (!line) continue;
      if (line.body !== undefined) this.unresolved.delete(line.id);
      else {
        if (this.unresolved.has(line.id)) continue;
        this.unresolved.set(line.id, event);
      }
      lines.push(line);
    }
    while (this.unresolved.size > 50) this.unresolved.delete(this.unresolved.keys().next().value!);
    return this.feed.update(lines);
  }
}
