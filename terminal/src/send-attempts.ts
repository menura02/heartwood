import { HeartwoodError } from './failures.ts';
import { MatrixFailure } from './matrix.ts';

export type SendResult = {status: 'accepted'; eventId: string} | {status: 'uncertain'};
export type PendingSendStatus = 'none' | 'busy' | 'uncertain' | 'retrying';
type Submit<T> = (prepared: T) => Promise<string>;

export class SendAttempts<T> {
  private readonly rooms = new Map<string, {busy: boolean; prepared?: T}>();

  pendingRooms(): string[] {
    return [...this.rooms].filter(([, slot]) => slot.prepared !== undefined).map(([room]) => room);
  }

  status(room: string): PendingSendStatus {
    const slot = this.rooms.get(room);
    if (!slot) return 'none';
    if (slot.prepared === undefined) return 'busy';
    return slot.busy ? 'retrying' : 'uncertain';
  }

  assertCanStart(room: string): void {
    const slot = this.rooms.get(room);
    if (slot?.busy) throw new HeartwoodError('sendInProgress');
    if (slot) throw new HeartwoodError('pendingSendExists');
    if (this.rooms.size >= 32) throw new HeartwoodError('pendingSendLimit');
  }

  prepareDiscard(room: string): () => void {
    const slot = this.rooms.get(room);
    if (slot?.busy) throw new HeartwoodError('sendInProgress');
    if (!slot || slot.prepared === undefined) throw new HeartwoodError('noPendingSend');
    return () => {
      if (this.rooms.get(room) !== slot) throw new HeartwoodError('pendingSendChanged');
      if (slot.busy) throw new HeartwoodError('sendInProgress');
      this.rooms.delete(room);
    };
  }

  async start(room: string, prepare: () => Promise<T>, submit: Submit<T>): Promise<SendResult> {
    this.assertCanStart(room);
    const slot: {busy: boolean; prepared?: T} = {busy: true};
    this.rooms.set(room, slot);
    try {
      const prepared = await prepare();
      const result = await this.submit(prepared, submit, false);
      if (result.status === 'uncertain') slot.prepared = prepared;
      return result;
    } finally {
      slot.busy = false;
      if (slot.prepared === undefined) this.rooms.delete(room);
    }
  }

  async retry(room: string, authorize: (prepared: T) => Promise<void>, submit: Submit<T>): Promise<SendResult> {
    const slot = this.rooms.get(room);
    if (slot?.busy) throw new HeartwoodError('sendInProgress');
    if (!slot || slot.prepared === undefined) throw new HeartwoodError('noPendingSend');
    slot.busy = true;
    try {
      await authorize(slot.prepared);
      const result = await this.submit(slot.prepared, submit, true);
      if (result.status === 'accepted') this.rooms.delete(room);
      return result;
    } finally {
      slot.busy = false;
    }
  }

  private async submit(prepared: T, submit: Submit<T>, retry: boolean): Promise<SendResult> {
    try {
      const eventId = await submit(prepared);
      if (typeof eventId !== 'string' || !eventId.startsWith('$')) return {status: 'uncertain'};
      return {status: 'accepted', eventId};
    } catch (error) {
      if (!retry && error instanceof MatrixFailure && error.status >= 400 && error.status < 500 &&
          error.status !== 408 && error.code !== 'UNKNOWN') throw error;
      return {status: 'uncertain'};
    }
  }
}
