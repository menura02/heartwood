import { HeartwoodError } from './failures.ts';
import { part } from './matrix.ts';
import type { ChatLine } from './chat-feed.ts';

export interface HistoryEvent {
  type: string;
  event_id?: string;
  sender?: string;
  content: Record<string, unknown>;
}

export interface RawHistoryPage { events: HistoryEvent[]; next?: string }
export interface HistoryPage { lines: ChatLine[]; next?: string }
export type HistoryRequest = (path: string) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  return isRecord(value) && isToken(value.type) && isRecord(value.content) &&
    (value.event_id === undefined || isToken(value.event_id)) &&
    (value.sender === undefined || isToken(value.sender));
}

export async function readHistoryPage(request: HistoryRequest, room: string, before?: string): Promise<RawHistoryPage> {
  const query = new URLSearchParams({dir: 'b', limit: '50'});
  if (before !== undefined) query.set('from', before);
  const page = await readPage(request, room, query);
  return {events: page.events.reverse(), next: page.next};
}

export async function readForwardPage(request: HistoryRequest, room: string, from: string, to: string): Promise<RawHistoryPage> {
  if (from === to) return {events: []};
  const page = await readPage(request, room, new URLSearchParams({dir: 'f', limit: '50', from, to}));
  return {events: page.events, next: page.next ?? to};
}

async function readPage(request: HistoryRequest, room: string, query: URLSearchParams): Promise<RawHistoryPage> {
  const response = await request(`rooms/${part(room)}/messages?${query}`);
  if (!isRecord(response) || !Array.isArray(response.chunk) || !isToken(response.start) ||
      (response.end !== undefined && !isToken(response.end)) || !response.chunk.every(isHistoryEvent)) {
    throw new HeartwoodError('invalidHistoryPage');
  }
  if (response.end !== undefined && response.end === query.get('from')) {
    throw new HeartwoodError('historyCursorStalled');
  }
  return {events: [...response.chunk], next: response.end};
}
