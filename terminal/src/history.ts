import { HeartwoodError } from './failures.ts';
import { part } from './matrix.ts';
import { isEvent, isRecord, isToken } from './matrix-response.ts';
import type { MatrixEvent } from './matrix-response.ts';
import type { ChatLine } from './chat-feed.ts';

export type HistoryEvent = MatrixEvent;

export interface RawHistoryPage { events: HistoryEvent[]; next?: string }
export interface HistoryPage { lines: ChatLine[]; next?: string }
export type HistoryRequest = (path: string) => Promise<unknown>;

export function isHistoryCursor(value: unknown): value is string {
  // Bound the URL and retained bytes while keeping a valid token opaque.
  return isToken(value) && value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= 1024;
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  return isEvent(value) && (value.type !== 'm.room.encrypted' ||
    (value.event_id !== undefined && value.sender !== undefined));
}

export async function readHistoryPage(request: HistoryRequest, room: string, before?: string): Promise<RawHistoryPage> {
  if (before !== undefined && !isHistoryCursor(before)) throw new HeartwoodError('invalidHistoryPage');
  const query = new URLSearchParams({dir: 'b', limit: '50'});
  if (before !== undefined) query.set('from', before);
  const page = await readPage(request, room, query);
  return {events: page.events.reverse(), next: page.next};
}

export async function readForwardPage(request: HistoryRequest, room: string, from: string, to: string): Promise<RawHistoryPage> {
  if (!isHistoryCursor(from) || !isHistoryCursor(to)) throw new HeartwoodError('invalidHistoryPage');
  if (from === to) return {events: []};
  const page = await readPage(request, room, new URLSearchParams({dir: 'f', limit: '50', from, to}));
  return {events: page.events, next: page.next ?? to};
}

async function readPage(request: HistoryRequest, room: string, query: URLSearchParams): Promise<RawHistoryPage> {
  const response = await request(`rooms/${part(room)}/messages?${query}`);
  if (!isRecord(response) || !Array.isArray(response.chunk) || response.chunk.length > 50 ||
      !isHistoryCursor(response.start) || (response.end !== undefined && !isHistoryCursor(response.end)) ||
      !response.chunk.every(isHistoryEvent)) {
    throw new HeartwoodError('invalidHistoryPage');
  }
  if (response.end !== undefined && response.end === query.get('from')) {
    throw new HeartwoodError('historyCursorStalled');
  }
  return {events: [...response.chunk], next: response.end};
}
