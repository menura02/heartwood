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
import { assertRoom, assertRoomSettings, assertTargets, assertTrusted, deviceCode, localUser, megolm } from './policy.ts';
import type { DeviceIdentity, StateEvent } from './policy.ts';
import { Profile } from './profile.ts';
import type { ChatLine } from './chat-feed.ts';

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

export class Heartwood {
  readonly identity: DeviceIdentity;
  readonly http: MatrixHttp;
  readonly profile: Profile;
  private readonly machine: OlmMachine;
  private readonly invites: Map<string, string>;

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
    if (passphrase.length < 12) throw new Error('Depo parolası en az 12 karakter olmalı.');
    const keyPath = join(profile.path, 'keys');
    if (profile.data.identity) {
      await access(join(keyPath, 'matrix-sdk-crypto.sqlite3')).catch(() => {
        throw new Error('Bu profilin kripto deposu eksik. Aynı cihaz kimliği yeniden oluşturulamaz.');
      });
    }
    const machine = await OlmMachine.initialize(new UserId(session.user_id), new DeviceId(session.device_id),
      keyPath, passphrase, StoreType.Sqlite).catch(() => {
      throw new Error('Kripto deposu açılamadı. Parolayı ve profil dosyalarını kontrol edin.');
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
    if (!endpoint) throw new Error('Beklenmeyen Matrix anahtar isteği.');
    const response = await this.http.request<{device_keys?: Record<string, Record<string, DeviceKeys>>}>(
      'POST', endpoint, JSON.parse(request.body));
    await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
    return response;
  }

  async sync(): Promise<void> {
    const query = new URLSearchParams({ timeout: '0', set_presence: 'offline' });
    const previous = this.profile.data.sync;
    if (previous) query.set('since', previous.cursor);
    const response = await this.http.request<SyncResponse>('GET', 'sync?' + query);
    if (!response.next_batch) throw new Error('Geçersiz eşzamanlama yanıtı.');
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
  }

  private activePeer(peer: string): string {
    localUser(peer, this.identity.user);
    if (this.profile.data.blocked.includes(peer)) throw new Error('Bu kullanıcı engelli.');
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
    if (!peer) throw new Error('Doğrulanabilir Heartwood daveti bulunamadı.');
    this.activePeer(peer);
    await this.http.request('POST', `join/${part(room)}`, {});
    try {
      if (await this.roomPeer(room) !== peer) throw new Error('Davetin katılımcısı değişti.');
    } catch (error) {
      await this.leave(room);
      throw error;
    }
    this.invites.delete(room);
  }

  async reject(room: string): Promise<void> {
    await this.sync();
    if (!this.invites.has(room)) throw new Error('Bekleyen davet bulunamadı.');
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
    if (!room.startsWith('!')) throw new Error('Tam oda kimliği gerekli.');
    return this.http.request('GET', `rooms/${part(room)}/state`);
  }

  private async roomPeer(room: string): Promise<string> {
    return this.activePeer(assertRoom(await this.roomState(room), this.identity.user));
  }

  async status(room: string): Promise<{peer: string; verified: boolean}> {
    const peer = await this.roomPeer(room);
    const [own, recipient] = await this.devices([this.identity.user, peer]);
    assertTrusted(this.identity, own);
    const pin = this.profile.data.pins[peer];
    return { peer, verified: !!pin && deviceCode(pin) === deviceCode(recipient) };
  }

  private async devices(users: string[]): Promise<DeviceIdentity[]> {
    const response = await this.keyRequest(this.machine.queryKeysForUsers(users.map(user => new UserId(user))));
    const devices: DeviceIdentity[] = [];
    for (const user of users) {
      const entries = Object.entries(response.device_keys?.[user] ?? {});
      if (entries.length !== 1) throw new Error('Her hesap için tam bir cihaz gerekli.');
      const [device, key] = entries[0];
      const ed = key.keys[`ed25519:${device}`];
      const curve = key.keys[`curve25519:${device}`];
      if (key.device_id !== device || key.user_id !== user ||
          ![ed, curve].every(value => typeof value === 'string' && /^[A-Za-z0-9+/]{43}$/.test(value))) {
        throw new Error('Sunucu geçerli cihaz anahtarları döndürmedi.');
      }
      devices.push({ user, device, ed, curve });
    }
    return devices;
  }

  async verify(peer: string, code: string): Promise<void> {
    this.activePeer(peer);
    const [actual] = await this.devices([peer]);
    if (deviceCode(actual) !== code.toLowerCase()) throw new Error('Cihaz kodu eşleşmedi.');
    const prior = this.profile.data.pins[peer];
    if (prior) assertTrusted(prior, actual);
    await this.profile.save({pins: { ...this.profile.data.pins, [peer]: actual }});
  }

  private async share(request: ToDeviceRequest, devices: DeviceIdentity[]): Promise<void> {
    const body = JSON.parse(request.body) as unknown;
    if (request.eventType !== 'm.room.encrypted') throw new Error('Şifrelenmemiş anahtar olayı engellendi.');
    assertTargets(body, devices);
    const response = await this.http.request('PUT',
      `sendToDevice/${part(request.eventType)}/${part(request.txnId)}`, body);
    await this.machine.markRequestAsSent(request.id, request.type, JSON.stringify(response));
  }

  async send(room: string, message: string): Promise<void> {
    if (!message.trim() || Buffer.byteLength(message, 'utf8') > 4000) throw new Error('Mesaj 1–4000 UTF-8 bayt olmalı.');
    await this.sync();
    const peer = await this.roomPeer(room);
    const [own, recipient] = await this.devices([this.identity.user, peer]);
    assertTrusted(this.identity, own);
    assertTrusted(this.profile.data.pins[peer], recipient);
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
    if (ciphertext.algorithm !== megolm || !ciphertext.ciphertext) throw new Error('Şifreleme tamamlanmadı.');
    await this.http.request('PUT', `rooms/${part(room)}/send/m.room.encrypted/${randomUUID()}`, ciphertext);
  }

  async history(room: string): Promise<ChatLine[]> {
    await this.sync();
    const peer = await this.roomPeer(room);
    const { chunk } = await this.http.request<{chunk: Event[]}>('GET',
      `rooms/${part(room)}/messages?dir=b&limit=50`);
    const history: ChatLine[] = [];
    for (const event of chunk.reverse()) {
      if (event.type !== 'm.room.encrypted' || typeof event.event_id !== 'string' ||
          (event.sender !== peer && event.sender !== this.identity.user)) continue;
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
            typeof value.content.body !== 'string') throw new Error();
        history.push({...line, body: value.content.body});
      } catch {
        history.push(line);
      }
    }
    return history;
  }
}
