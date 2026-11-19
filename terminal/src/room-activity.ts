const roomLimit = 256;

// Records which rooms sync reported since a reader last looked. A mark changes whenever a room may have
// new timeline or membership events, or when to-device events may have delivered missing room keys.
export class RoomActivity {
  private tick = 0;
  private keys = 0;
  private evicted = 0;
  private readonly rooms = new Map<string, number>();

  observe(rooms: Iterable<string>, toDevice: boolean): void {
    for (const room of rooms) {
      this.rooms.delete(room);
      this.rooms.set(room, ++this.tick);
      if (this.rooms.size > roomLimit) {
        this.rooms.delete(this.rooms.keys().next().value!);
        this.evicted++;
      }
    }
    if (toDevice) this.keys = ++this.tick;
  }

  mark(room: string): string {
    // An evicted room cannot prove it was idle, so eviction changes the mark of every untracked room.
    return `${this.rooms.get(room) ?? `evicted-${this.evicted}`}:${this.keys}`;
  }
}
