export interface ChatLine { id: string; sender: string; body?: string }

export class ChatFeed {
  private readonly seen = new Map<string, boolean>();

  update(lines: ChatLine[]): ChatLine[] {
    return lines.filter(line => {
      const readable = line.body !== undefined;
      const previous = this.seen.get(line.id);
      if (previous === true || previous === readable) return false;
      this.seen.set(line.id, readable);
      return true;
    });
  }
}
