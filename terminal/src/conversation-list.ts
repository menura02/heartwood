export interface Conversation { room: string; peer: string; verified: boolean | undefined }
interface NumberedConversation extends Conversation { number: number }

export class ConversationList {
  private current = new Map<number, NumberedConversation>();
  private next = 1;

  replace(conversations: Conversation[]): NumberedConversation[] {
    const previous = new Map([...this.current.values()].map(item => [item.room, item]));
    const sorted = [...conversations].sort((a, b) => a.peer.localeCompare(b.peer) || a.room.localeCompare(b.room));
    const numbered = sorted.map(conversation => {
      const prior = previous.get(conversation.room);
      const number = prior?.peer === conversation.peer ? prior.number : this.next++;
      return {...conversation, number};
    });
    this.current = new Map(numbered.map(item => [item.number, item]));
    return numbered;
  }

  select(value: string): NumberedConversation {
    const conversation = /^[1-9][0-9]*$/.test(value) ? this.current.get(Number(value)) : undefined;
    if (!conversation) throw new Error('Geçersiz seçim. /sohbetler ile listeyi aç.');
    return conversation;
  }
}
