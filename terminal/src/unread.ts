type TimelineEvent = {event_id?: string; sender?: string; type: string; state_key?: string;
  content?: Record<string, unknown>; unsigned?: {prev_content?: {membership?: string}}};
export type JoinedRooms = Record<string, {timeline?: {events?: TimelineEvent[]}; state?: {events?: TimelineEvent[]}}>;

export class SessionUnread {
  private readonly rooms = new Map<string, Map<string, string>>();
  private readonly seen = new Set<string>();

  observe(rooms: JoinedRooms, self: string, baseline: boolean): void {
    for (const [room, update] of Object.entries(rooms)) {
      const events = Array.isArray(update?.timeline?.events) ? update.timeline.events : [];
      const state = Array.isArray(update?.state?.events) ? update.state.events : [];
      const joined = [...state, ...events].some(event =>
        event?.type === 'm.room.member' && event.state_key === self && event.content?.membership === 'join' &&
        event.unsigned?.prev_content?.membership !== 'join');
      for (const event of events) {
        const id = event?.event_id;
        if (event?.type !== 'm.room.encrypted' || typeof id !== 'string' || !id || id.length > 1024 ||
            typeof event.sender !== 'string' || !event.sender || event.sender.length > 255 ||
            event.sender === self || this.seen.has(id)) continue;
        this.remember(id);
        if (baseline || joined) continue;
        const pending = this.rooms.get(room) ?? new Map<string, string>();
        pending.set(id, event.sender);
        if (pending.size > 256) pending.delete(pending.keys().next().value!);
        this.rooms.set(room, pending);
        if (this.rooms.size > 128) this.rooms.delete(this.rooms.keys().next().value!);
      }
    }
  }

  displayed(room: string, lines: readonly {id: string; body?: string}[]): void {
    const pending = this.rooms.get(room);
    for (const line of lines) {
      if (line.body === undefined) continue;
      this.remember(line.id);
      pending?.delete(line.id);
    }
    if (pending?.size === 0) this.rooms.delete(room);
  }

  has(room: string, peer: string): boolean {
    return [...(this.rooms.get(room)?.values() ?? [])].includes(peer);
  }
  forget(room: string): void { this.rooms.delete(room); }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value!);
  }
}
