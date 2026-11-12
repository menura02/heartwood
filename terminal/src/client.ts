import { HeartwoodError } from './failures.ts';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CollectStrategy, DeviceId, DeviceLists, EncryptionSettings, HistoryVisibility, OlmMachine,
  RequestType, RoomId, StoreType, UserId,
} from '@matrix-org/matrix-sdk-crypto-nodejs';
import type { ToDeviceRequest } from '@matrix-org/matrix-sdk-crypto-nodejs';
import { MatrixFailure, MatrixHttp, part } from './matrix.ts';
import type { Login } from './matrix.ts';
import { assertRoom, assertRoomSettings, assertTargets, assertTrusted, deviceCode, localUser, megolm, normalizeDeviceCode } from './policy.ts';
import type { DeviceIdentity, StateEvent } from './policy.ts';
import { Profile } from './profile.ts';
import type { ChatLine } from './chat-feed.ts';
import { readForwardPage, readHistoryPage } from './history.ts';
import type { HistoryEvent, HistoryPage } from './history.ts';
import { LiveTimeline } from './live-timeline.ts';
import { SendAttempts } from './send-attempts.ts';
import type { SendResult } from './send-attempts.ts';
import type { Conversation } from './conversation-list.ts';

interface Event { type: string; event_id?: string; sender?: string; content: Record<string, unknown> }
interface SyncResponse {
  next_batch: string;
  device_lists?: { changed?: string[]; left?: string[] };
  device_one_time_keys_count?: Record<string, number>;
  device_unused_fallback_key_types?: string[];
  to_device?: { events?: Event[] };
  rooms?: { invite?: Record<string, { invite_state: { events: StateEvent[] } }>;
    leave?: Record<string, unknown>; join?: Record<string, unknown> };
}
interface DeviceKeys {
  user_id: string;
  device_id: string;
  keys: Record<string, string>;
}

interface PreparedSend {
  path: string;
  ciphertext: {algorithm: string; ciphertext: string};
  recipient: DeviceIdentity;
  token: string | undefined;
}

export type OnboardingStep = 'accept' | 'wait' | 'verify' | 'changed' | 'ready' | 'invite' | 'unavailable';

export class Heartwood {
  readonly identity: DeviceIdentity;
  readonly http: MatrixHttp;
  readonly profile: Profile;
  private readonly machine: OlmMachine;
  private readonly invites: Map<string, string>;
  private readonly sends = new SendAttempts<PreparedSend>();
  private syncPending?: Promise<string>;

  private constructor(http: MatrixHttp, profile: Profile, machine: OlmMachine, session: Login) {
    this.http = http;
    this.profile = profile;
    this.machine = machine;
    this.invites = new Map(profile.data.sync?.invites);
    const keys = machine.identityKeys;
    this.identity = { user: session.user_id, device: session.device_id,
      ed: keys.ed25519.toBase64(), curve: keys.curve25519.toBase64() };
  }

  static async open(http: MatrixHttp, profile: Profile, session: Login, passphrase: string): Promise<Heartwood> {
    if (passphrase.length < 12) throw new HeartwoodError('storePassphraseTooShort');
    const keyPath = join(profile.path, 'keys');
    if (profile.data.identity) {
      await access(join(keyPath, 'matrix-sdk-crypto.sqlite3')).catch(() => {
        throw new HeartwoodError('cryptoStoreMissing');
      });
    }
    const machine = await OlmMachine.initialize(new UserId(session.user_id), new DeviceId(session.device_id),
      keyPath, passphrase, StoreType.Sqlite).catch(() => {
      throw new HeartwoodError('cryptoStoreOpenFailed');
    });
    try {
      const client = new Heartwood(http, profile, machine, session);
      if (profile.data.identity) assertTrusted(profile.data.identity, client.identity);
      else await profile.save({identity: client.identity});
      await client.sync();
      return client;
    } catch (error) {
      machine.close();
      throw error;
    }
  }

  close(): void { this.machine.close(); }

  private async keyRequest(request: { type: RequestType; id: string; body: string }) {
    const endpoint = {
      [RequestType.KeysUpload]: 'keys/upload',
      [RequestType.KeysQuery]: 'keys/query',
      [RequestType.KeysClaim]: 'keys/claim',
    }[request.type as RequestType.KeysUpload | RequestType.KeysQuery | RequestType.KeysClaim];
    if (!endpoint) throw new HeartwoodError('unexpectedKeyRequest');
    const response = await this.http.request<{device_keys?: Record<string, Record<string, DeviceKeys>>}>(
      'POST', endpoint, JSON.parse(request.body));
    await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
    return response;
  }

  sync(): Promise<string> {
    this.syncPending ??= this.syncOnce().finally(() => { this.syncPending = undefined; });
    return this.syncPending;
  }

  private async syncOnce(): Promise<string> {
    const query = new URLSearchParams({ timeout: '0', set_presence: 'offline' });
    const previous = this.profile.data.sync;
    if (previous) query.set('since', previous.cursor);
    const response = await this.http.request<SyncResponse>('GET', 'sync?' + query);
    if (!response.next_batch) throw new HeartwoodError('invalidSyncResponse');
    const users = (values: string[] = []) => values.map(value => new UserId(value));
    await this.machine.receiveSyncChanges(JSON.stringify(response.to_device?.events ?? []),
      new DeviceLists(users(response.device_lists?.changed), users(response.device_lists?.left)),
      response.device_one_time_keys_count ?? {}, response.device_unused_fallback_key_types ?? []);
    for (const request of await this.machine.outgoingRequests()) {
      if ([RequestType.KeysUpload, RequestType.KeysQuery, RequestType.KeysClaim].includes(request.type)) {
        await this.keyRequest(request);
      }
    }
    for (const [room, invite] of Object.entries(response.rooms?.invite ?? {})) {
      const peer = this.pendingPeer(invite.invite_state.events);
      if (peer) this.invites.set(room, peer);
      else this.invites.delete(room);
    }
    for (const room of Object.keys(response.rooms?.leave ?? {})) this.invites.delete(room);
    for (const room of Object.keys(response.rooms?.join ?? {})) this.invites.delete(room);
    // A later sync acknowledges to-device events. Persist only after the SDK stores their keys.
    await this.profile.save({sync: {cursor: response.next_batch, invites: [...this.invites]}});
    return response.next_batch;
  }

  private activePeer(peer: string): string {
    localUser(peer, this.identity.user);
    if (this.profile.data.blocked.includes(peer)) throw new HeartwoodError('peerBlocked');
    return peer;
  }

  async invite(peer: string): Promise<string> {
    this.activePeer(peer);
    const { room_id } = await this.http.request<{room_id: string}>('POST', 'createRoom', {
      visibility: 'private', preset: 'private_chat', is_direct: true, invite: [peer],
      creation_content: { 'm.federate': false },
      initial_state: [
        { type: 'com.heartwood.direct', state_key: '', content: { version: 1 } },
        { type: 'm.room.encryption', state_key: '', content: { algorithm: megolm } },
        { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
      ],
    });
    return room_id;
  }

  async pending(): Promise<Array<{room: string; peer: string}>> {
    await this.sync();
    return [...this.invites].filter(([, peer]) => !this.profile.data.blocked.includes(peer))
      .map(([room, peer]) => ({room, peer}));
  }

  private pendingPeer(state: StateEvent[]): string | undefined {
    const own = state.find(event => event.type === 'm.room.member' && event.state_key === this.identity.user);
    if (!own?.sender || own.content.membership !== 'invite') return undefined;
    try {
      assertRoomSettings(state);
      return this.activePeer(own.sender);
    }
    catch { return undefined; }
  }

  async accept(room: string): Promise<void> {
    await this.sync();
    const peer = this.invites.get(room);
    if (!peer) throw new HeartwoodError('inviteNotVerified');
    this.activePeer(peer);
    await this.http.request('POST', `join/${part(room)}`, {});
    try {
      if (await this.roomPeer(room) !== peer) throw new HeartwoodError('invitePeerChanged');
    } catch (error) {
      await this.leave(room);
      throw error;
    }
    this.invites.delete(room);
  }

  async reject(room: string): Promise<void> {
    await this.sync();
    if (!this.invites.has(room)) throw new HeartwoodError('noPendingInvite');
    await this.leave(room);
  }

  private async leave(room: string): Promise<void> {
    await this.http.request('POST', `rooms/${part(room)}/leave`, {});
    this.invites.delete(room);
  }

  async block(peer: string): Promise<void> {
    localUser(peer, this.identity.user);
    if (!this.profile.data.blocked.includes(peer)) {
      const pins = { ...this.profile.data.pins };
      delete pins[peer];
      await this.profile.save({blocked: [...this.profile.data.blocked, peer], pins});
    }
    const path = `user/${part(this.identity.user)}/account_data/m.ignored_user_list`;
    const previous = await this.http.request<{ ignored_users: Record<string, object> }>('GET', path)
      .catch((error: unknown) => {
        if (error instanceof MatrixFailure && error.status === 404) return { ignored_users: {} };
        throw error;
      });
    await this.http.request('PUT', path, { ignored_users: { ...previous.ignored_users, [peer]: {} } });
    for (const [room, sender] of this.invites) {
      if (sender === peer) await this.leave(room);
    }
    for (const room of await this.rooms()) {
      const state = await this.roomState(room);
      const member = state.find(event => event.type === 'm.room.member' && event.state_key === peer);
      const direct = state.some(event => event.type === 'com.heartwood.direct' && event.content.version === 1);
      if (direct && member && ['join', 'invite'].includes(String(member.content.membership))) await this.leave(room);
    }
  }

  async rooms(): Promise<string[]> {
    return (await this.http.request<{joined_rooms: string[]}>('GET', 'joined_rooms')).joined_rooms;
  }

  private roomState(room: string): Promise<StateEvent[]> {
    if (!room.startsWith('!')) throw new HeartwoodError('roomIdRequired');
    return this.http.request('GET', `rooms/${part(room)}/state`);
  }

  private async roomPeer(room: string): Promise<string> {
    return this.activePeer(assertRoom(await this.roomState(room), this.identity.user));
  }

  async status(room: string): Promise<{peer: string; verified: boolean}> {
    const peer = await this.roomPeer(room);
    return {peer, verified: await this.verifiedPeer(peer)};
  }

  private async verifiedPeer(peer: string): Promise<boolean> {
    return await this.peerTrust(peer) === 'verified';
  }

  private async peerTrust(peer: string): Promise<'unverified' | 'changed' | 'verified'> {
    const [own, recipient] = await this.devices([this.identity.user, peer]);
    assertTrusted(this.identity, own);
    const pin = this.profile.data.pins[peer];
    if (!pin) return 'unverified';
    return deviceCode(pin) === deviceCode(recipient) ? 'verified' : 'changed';
  }

  async onboardingStep(): Promise<OnboardingStep> {
    if ((await this.pending()).length) return 'accept';
    let waiting = false;
    let unavailable = false;
    for (const room of await this.rooms()) {
      const state = await this.roomState(room).catch(error => {
        if (error instanceof MatrixFailure && [403, 404].includes(error.status) && error.code !== 'M_UNKNOWN_TOKEN') {
          return undefined;
        }
        throw error;
      });
      if (!state) { unavailable = true; continue; }
      let peer: string;
      try {
        peer = this.activePeer(assertRoom(state, this.identity.user));
      } catch (error) {
        if (!(error instanceof HeartwoodError)) throw error;
        if (error.code === 'invalidRoomSettings' || error.code === 'peerBlocked') continue;
        if (error.code === 'invalidRoomMembership') {
          const active = state.filter(event => event.type === 'm.room.member' &&
            ['join', 'invite', 'knock'].includes(String(event.content.membership)));
          const invite = active.find(event => event.state_key !== this.identity.user);
          if (active.length === 2 && invite?.sender === this.identity.user &&
              invite.content.membership === 'invite' &&
              active.some(event => event.state_key === this.identity.user && event.content.membership === 'join') &&
              !this.profile.data.blocked.includes(invite.state_key)) {
            waiting = true;
            continue;
          }
        }
        unavailable = true;
        continue;
      }
      const trust = await this.peerTrust(peer);
      return trust === 'verified' ? 'ready' : trust === 'changed' ? 'changed' : 'verify';
    }
    return waiting ? 'wait' : unavailable ? 'unavailable' : 'invite';
  }

  async conversations(): Promise<{rooms: Conversation[]; unavailable: number}> {
    const rooms: Conversation[] = [];
    let unavailable = 0;
    for (const room of await this.rooms()) {
      try {
        const peer = await this.roomPeer(room);
        const verified = await this.verifiedPeer(peer).catch(() => undefined);
        rooms.push({room, peer, verified});
      } catch {
        unavailable++;
      }
    }
    return {rooms, unavailable};
  }

  private async devices(users: string[]): Promise<DeviceIdentity[]> {
    const response = await this.keyRequest(this.machine.queryKeysForUsers(users.map(user => new UserId(user))));
    const devices: DeviceIdentity[] = [];
    for (const user of users) {
      const entries = Object.entries(response.device_keys?.[user] ?? {});
      if (entries.length === 0) throw new HeartwoodError('noVerifiableDevice');
      if (entries.length > 1) throw new HeartwoodError('tooManyDevices');
      const [device, key] = entries[0];
      const ed = key.keys[`ed25519:${device}`];
      const curve = key.keys[`curve25519:${device}`];
      if (key.device_id !== device || key.user_id !== user ||
          ![ed, curve].every(value => typeof value === 'string' && /^[A-Za-z0-9+/]{43}$/.test(value))) {
        throw new HeartwoodError('invalidDeviceKeys');
      }
      devices.push({ user, device, ed, curve });
    }
    return devices;
  }

  async verify(peer: string, code: string): Promise<void> {
    const normalized = normalizeDeviceCode(code);
    this.activePeer(peer);
    const [actual] = await this.devices([peer]);
    const prior = this.profile.data.pins[peer];
    if (prior) assertTrusted(prior, actual);
    if (deviceCode(actual) !== normalized) throw new HeartwoodError('deviceCodeMismatch');
    await this.profile.save({pins: { ...this.profile.data.pins, [peer]: actual }});
  }

  private async share(request: ToDeviceRequest, devices: DeviceIdentity[]): Promise<void> {
    const body = JSON.parse(request.body) as unknown;
    if (request.eventType !== 'm.room.encrypted') throw new HeartwoodError('unencryptedKeyEvent');
    assertTargets(body, devices);
    const response = await this.http.request('PUT',
      `sendToDevice/${part(request.eventType)}/${part(request.txnId)}`, body);
    await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }

  async send(room: string, message: string, expectedPeer?: string): Promise<SendResult> {
    if (!message.trim() || Buffer.byteLength(message, 'utf8') > 4000) throw new HeartwoodError('invalidMessageSize');
    return this.sends.start(room, () => this.prepareSend(room, message, expectedPeer), prepared => this.submitSend(prepared));
  }

  pendingSendRooms(): string[] {
    return this.sends.pendingRooms();
  }

  prepareSendDiscard(room: string): () => void {
    return this.sends.prepareDiscard(room);
  }

  async retrySend(room: string, expectedPeer?: string): Promise<SendResult> {
    return this.sends.retry(room, async prepared => {
      const [, recipient] = await this.sendDevices(room, expectedPeer);
      assertTrusted(prepared.recipient, recipient);
      if (this.http.token !== prepared.token) throw new HeartwoodError('sendSessionChanged');
    }, prepared => this.submitSend(prepared));
  }

  private async sendDevices(room: string, expectedPeer?: string): Promise<[DeviceIdentity, DeviceIdentity]> {
    await this.sync();
    const peer = await this.roomPeer(room);
    if (expectedPeer !== undefined && peer !== expectedPeer) throw new HeartwoodError('chatPeerChanged');
    const [own, recipient] = await this.devices([this.identity.user, peer]);
    assertTrusted(this.identity, own);
    assertTrusted(this.profile.data.pins[peer], recipient);
    return [own, recipient];
  }

  private async prepareSend(room: string, message: string, expectedPeer?: string): Promise<PreparedSend> {
    const [own, recipient] = await this.sendDevices(room, expectedPeer);
    const users = [own.user, recipient.user].map(user => new UserId(user));
    const claim = await this.machine.getMissingSessions(users);
    if (claim) await this.keyRequest(claim);
    const roomId = new RoomId(room);
    const settings = new EncryptionSettings();
    settings.historyVisibility = HistoryVisibility.Joined;
    // The binding has no local-trust setter. Check every resulting Olm ciphertext before sending.
    settings.sharingStrategy = CollectStrategy.AllDevices;
    for (const request of await this.machine.shareRoomKey(roomId, users, settings)) {
      await this.share(request, [own, recipient]);
    }
    const ciphertext = JSON.parse(await this.machine.encryptRoomEvent(roomId, 'm.room.message',
      JSON.stringify({ msgtype: 'm.text', body: message }))) as {algorithm?: string; ciphertext?: string};
    if (ciphertext.algorithm !== megolm || !ciphertext.ciphertext) throw new HeartwoodError('encryptionFailed');
    return {path: `rooms/${part(room)}/send/m.room.encrypted/${randomUUID()}`,
      ciphertext: {...ciphertext, algorithm: megolm, ciphertext: ciphertext.ciphertext},
      recipient, token: this.http.token};
  }

  private async submitSend(prepared: PreparedSend): Promise<string> {
    const response = await this.http.request<{event_id: string}>('PUT', prepared.path, prepared.ciphertext);
    return response.event_id;
  }

  async history(room: string): Promise<ChatLine[]> {
    return (await this.historyPage(room)).lines;
  }

  async historyPage(room: string, before?: string): Promise<HistoryPage> {
    await this.sync();
    const peer = await this.roomPeer(room);
    const {events, next} = await readHistoryPage(path => this.http.request('GET', path), room, before);
    const history: ChatLine[] = [];
    for (const event of events) {
      const line = await this.decode(room, peer, event);
      if (line) history.push(line);
    }
    return {lines: history, next};
  }

  async openLive(room: string, expectedPeer?: string) {
    const anchor = await this.sync();
    const peer = await this.roomPeer(room);
    if (expectedPeer !== undefined && peer !== expectedPeer) throw new HeartwoodError('chatPeerChanged');
    const request = (path: string) => this.http.request('GET', path);
    const timeline = new LiveTimeline(anchor);
    const {events} = await readHistoryPage(request, room, anchor);
    const decode = (event: HistoryEvent) => this.decode(room, peer, event);
    const initial = await timeline.initial(events, decode);
    let catchingUp = false;
    return {
      initial,
      get catchingUp() { return catchingUp; },
      send: (message: string) => this.send(room, message, peer),
      retry: () => this.retrySend(room, peer),
      refresh: () => timeline.poll(async from => {
        const until = await this.sync();
        if (await this.roomPeer(room) !== peer) throw new HeartwoodError('chatPeerChanged');
        const page = await readForwardPage(request, room, from, until);
        catchingUp = page.next !== undefined && page.next !== until;
        return page;
      }, decode),
    };
  }

  private async decode(room: string, peer: string, event: HistoryEvent): Promise<ChatLine | undefined> {
    if (event.type !== 'm.room.encrypted' || typeof event.event_id !== 'string' ||
        (event.sender !== peer && event.sender !== this.identity.user)) return;
    const line = {id: event.event_id, sender: event.sender};
    const expected = event.sender === peer ? this.profile.data.pins[peer] : this.identity;
    try {
      const clear = await this.machine.decryptRoomEvent(JSON.stringify(event), new RoomId(room));
      const value = JSON.parse(clear.event) as Event;
      if (!expected || clear.sender?.toString() !== expected.user ||
          (clear.senderDevice && clear.senderDevice.toString() !== expected.device) ||
          clear.senderCurve25519Key !== expected.curve ||
          clear.senderClaimedEd25519Key !== expected.ed ||
          clear.forwardingCurve25519KeyChain.length ||
          value.type !== 'm.room.message' || value.content.msgtype !== 'm.text' ||
          typeof value.content.body !== 'string') return line;
      return {...line, body: value.content.body};
    } catch {
      return line;
    }
  }
}
