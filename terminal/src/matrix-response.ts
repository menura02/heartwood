import { isIP } from 'node:net';
import { HeartwoodError } from './failures.ts';
import type { FailureCode } from './failures.ts';
import type { StateEvent } from './policy.ts';
import type { JoinedRooms } from './unread.ts';

type JsonObject = Record<string, unknown>;
type Check<T> = (value: unknown) => value is T;

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.isWellFormed() && !/[\p{Cc}]/u.test(value);
}

function isServerName(value: string): boolean {
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(value);
  if (!match || (match[2] !== undefined && Number(match[2]) > 65535)) return false;
  return !match[1].startsWith('[') || isIP(match[1].slice(1, -1)) === 6;
}

function namespacedId(value: string, separator: number, emptyLocalpart = false): boolean {
  if (separator < (emptyLocalpart ? 1 : 2)) return false;
  return !/[\u0000\p{Cs}]/u.test(value.slice(1, separator)) && isServerName(value.slice(separator + 1));
}

export function isUserId(value: unknown): value is string {
  // Historic IDs can contain spaces, controls other than NUL, or an empty localpart.
  return typeof value === 'string' && value.startsWith('@') && Buffer.byteLength(value) <= 255 &&
    namespacedId(value, value.indexOf(':'), true);
}

function isOpaqueId(value: unknown, sigil: string): value is string {
  if (typeof value !== 'string' || !value.startsWith(sigil) || Buffer.byteLength(value) > 255) return false;
  const separator = value.indexOf(':');
  return separator === -1 ? /^[A-Za-z0-9+/_-]+$/.test(value.slice(1)) : namespacedId(value, separator);
}

export function isRoomId(value: unknown): value is string {
  return isOpaqueId(value, '!');
}

export function isEventId(value: unknown): value is string {
  return isOpaqueId(value, '$');
}

export function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}

function arrayOf<T>(check: Check<T>): Check<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(check);
}

function mapOf<T>(check: Check<T>, key: Check<string> = isToken): Check<Record<string, T>> {
  return (value): value is Record<string, T> => isRecord(value) &&
    Object.entries(value).every(([name, item]) => key(name) && check(item));
}

function optional<T>(value: unknown, check: Check<T>): value is T | undefined {
  return value === undefined || check(value);
}

export function validated<T>(value: unknown, check: Check<T>, failure: FailureCode): T {
  if (!check(value)) throw new HeartwoodError(failure);
  return value;
}

const tokens = arrayOf(isToken);
const users = arrayOf(isUserId);
const counts = mapOf((value): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

export interface MatrixEvent {
  type: string;
  content: JsonObject;
  event_id?: string;
  sender?: string;
  state_key?: string;
  origin_server_ts?: number;
}

export function isEvent(value: unknown): value is MatrixEvent {
  return isRecord(value) && isToken(value.type) && isRecord(value.content) &&
    optional(value.event_id, isEventId) && optional(value.sender, isUserId) &&
    optional(value.origin_server_ts, isTimestamp) &&
    (value.state_key === undefined || typeof value.state_key === 'string');
}

const policyStateFields = new Map<string, [string, 'string' | 'number' | 'boolean']>([
  ['com.heartwood.direct', ['version', 'number']],
  ['m.room.encryption', ['algorithm', 'string']],
  ['m.room.join_rules', ['join_rule', 'string']],
  ['m.room.history_visibility', ['history_visibility', 'string']],
  ['m.room.create', ['m.federate', 'boolean']],
]);

function isMembership(value: unknown): value is string {
  return typeof value === 'string' && ['join', 'invite', 'knock', 'leave', 'ban'].includes(value);
}

function isStateEvent(value: unknown): value is StateEvent {
  if (!isEvent(value) || typeof value.state_key !== 'string') return false;
  if (value.type === 'm.room.member') {
    return isUserId(value.state_key) && isMembership(value.content.membership);
  }
  const field = value.state_key === '' ? policyStateFields.get(value.type) : undefined;
  if (!field) return true;
  const [name, type] = field;
  // Redacted or unsupported policy events remain visible to the room policy, which rejects them.
  return value.content[name] === undefined || typeof value.content[name] === type;
}

export function isRoomState(value: unknown): value is StateEvent[] {
  if (!arrayOf(isStateEvent)(value)) return false;
  const keys = new Set<string>();
  for (const event of value) {
    if (event.type !== 'm.room.member' && !(event.state_key === '' && policyStateFields.has(event.type))) continue;
    const key = `${event.type}:${event.state_key}`;
    if (keys.has(key)) return false;
    keys.add(key);
  }
  return true;
}

type TimelineEvent = NonNullable<NonNullable<JoinedRooms[string]['timeline']>['events']>[number];

function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!isEvent(value)) return false;
  if (value.type === 'm.room.encrypted' && (!value.event_id || !value.sender)) return false;
  if (value.type !== 'm.room.member') return true;
  if (!isUserId(value.state_key) || !isMembership(value.content.membership)) return false;
  if (!('unsigned' in value) || value.unsigned === undefined) return true;
  if (!isRecord(value.unsigned)) return false;
  const previous = value.unsigned.prev_content;
  return previous === undefined || (isRecord(previous) && optional(previous.membership, isMembership));
}

function isToDeviceEvent(value: unknown): value is MatrixEvent {
  return isEvent(value) && isUserId(value.sender);
}

function isJoinedRoom(value: unknown): value is JoinedRooms[string] {
  const validEvents = (section: unknown) => section === undefined ||
    (isRecord(section) && optional(section.events, arrayOf(isTimelineEvent)));
  return isRecord(value) && validEvents(value.timeline) && validEvents(value.state);
}

function isInvite(value: unknown): value is {invite_state: {events: StateEvent[]}} {
  return isRecord(value) && isRecord(value.invite_state) && isRoomState(value.invite_state.events);
}

export interface SyncResponse {
  next_batch: string;
  device_lists?: {changed?: string[]; left?: string[]};
  device_one_time_keys_count?: Record<string, number>;
  device_unused_fallback_key_types?: string[];
  to_device?: {events?: MatrixEvent[]};
  rooms?: {invite?: Record<string, {invite_state: {events: StateEvent[]}}>;
    leave?: Record<string, unknown>; join?: JoinedRooms};
}

export function isSyncResponse(value: unknown): value is SyncResponse {
  if (!isRecord(value) || !isToken(value.next_batch) ||
      !optional(value.device_one_time_keys_count, counts) || !optional(value.device_unused_fallback_key_types, tokens)) {
    return false;
  }
  const {device_lists, to_device, rooms} = value;
  return (device_lists === undefined ||
    (isRecord(device_lists) && optional(device_lists.changed, users) && optional(device_lists.left, users))) &&
    (to_device === undefined || (isRecord(to_device) && optional(to_device.events, arrayOf(isToDeviceEvent)))) &&
    (rooms === undefined || (isRecord(rooms) && optional(rooms.invite, mapOf(isInvite, isRoomId)) &&
      optional(rooms.leave, mapOf(isRecord, isRoomId)) && optional(rooms.join, mapOf(isJoinedRoom, isRoomId))));
}

interface DeviceKeys {
  user_id: string;
  device_id: string;
  keys: Record<string, string>;
}

export interface KeyQueryResponse {device_keys?: Record<string, Record<string, DeviceKeys>>}

const signatures = mapOf(mapOf(isToken), isUserId);
const publicKey = /^[A-Za-z0-9+/]{43}$/;

function isDeviceKey(value: unknown): value is DeviceKeys {
  return isRecord(value) && isUserId(value.user_id) && isToken(value.device_id) &&
    tokens(value.algorithms) && mapOf(isToken)(value.keys) && signatures(value.signatures) &&
    publicKey.test(value.keys[`ed25519:${value.device_id}`] ?? '') &&
    publicKey.test(value.keys[`curve25519:${value.device_id}`] ?? '');
}

function isCrossSigningKey(value: unknown): value is {user_id: string} {
  return isRecord(value) && isUserId(value.user_id) && tokens(value.usage) &&
    mapOf(isToken)(value.keys) && Object.keys(value.keys).length === 1 && optional(value.signatures, signatures);
}

export function isKeyQuery(value: unknown): value is KeyQueryResponse {
  if (!isRecord(value) || !optional(value.failures, mapOf(isRecord)) ||
      !optional(value.device_keys, mapOf(mapOf(isDeviceKey), isUserId))) return false;
  for (const [user, devices] of Object.entries(value.device_keys ?? {})) {
    for (const [device, key] of Object.entries(devices)) {
      if (key.user_id !== user || key.device_id !== device) return false;
    }
  }
  return [value.master_keys, value.self_signing_keys, value.user_signing_keys].every(keys =>
    keys === undefined || (mapOf(isCrossSigningKey, isUserId)(keys) &&
      Object.entries(keys).every(([user, key]) => key.user_id === user)));
}

export function isKeyUpload(value: unknown): value is JsonObject {
  return isRecord(value) && counts(value.one_time_key_counts);
}

function isOneTimeKey(value: unknown): value is string | JsonObject {
  return isToken(value) || (isRecord(value) && isToken(value.key) && signatures(value.signatures) &&
    (value.fallback === undefined || typeof value.fallback === 'boolean'));
}

export function isKeyClaim(value: unknown): value is JsonObject {
  return isRecord(value) && optional(value.failures, mapOf(isRecord)) &&
    mapOf(mapOf(mapOf(isOneTimeKey)), isUserId)(value.one_time_keys);
}

export function hasRoomId(value: unknown): value is {room_id: string} {
  return isRecord(value) && isRoomId(value.room_id);
}

export function hasEventId(value: unknown): value is {event_id: string} {
  return isRecord(value) && isEventId(value.event_id);
}

export function hasJoinedRooms(value: unknown): value is {joined_rooms: string[]} {
  return isRecord(value) && arrayOf(isRoomId)(value.joined_rooms);
}

export function hasIgnoredUsers(value: unknown): value is {ignored_users: Record<string, JsonObject>} {
  return isRecord(value) && mapOf(isRecord, isUserId)(value.ignored_users);
}
