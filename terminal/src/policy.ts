import { createHash } from 'node:crypto';

export interface DeviceIdentity { user: string; device: string; ed: string; curve: string }
export interface StateEvent { type: string; state_key: string; sender?: string; content: Record<string, unknown> }
export const megolm = 'm.megolm.v1.aes-sha2';

export function matrixOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('HTTPS veya loopback HTTP sunucu adresi gerekli.');
  }
  return url.origin;
}

export function localUser(value: string, self: string): string {
  const match = /^@[a-z0-9._=/-]+:(\S+)$/.exec(value);
  if (!match || match[1] !== self.slice(self.indexOf(':') + 1) || value === self) {
    throw new Error('Aynı sunucudan farklı bir tam kullanıcı kimliği gerekli.');
  }
  return value;
}

export function safeText(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '�');
}

export function deviceCode(identity: DeviceIdentity): string {
  return createHash('sha256').update(JSON.stringify([identity.user, identity.device, identity.ed, identity.curve])).digest('hex');
}

export function assertTrusted(pin: DeviceIdentity | undefined, actual: DeviceIdentity): void {
  if (!pin || deviceCode(pin) !== deviceCode(actual)) {
    throw new Error('Cihaz doğrulanmadı veya değişti. Gönderim durduruldu.');
  }
}

export function assertRoomSettings(state: StateEvent[]): void {
  const content = (type: string) => state.find(event => event.type === type && event.state_key === '')?.content;
  if (content('com.heartwood.direct')?.version !== 1 ||
      content('m.room.encryption')?.algorithm !== megolm ||
      content('m.room.join_rules')?.join_rule !== 'invite' ||
      content('m.room.history_visibility')?.history_visibility !== 'joined' ||
      content('m.room.create')?.['m.federate'] !== false) {
    throw new Error('Beklenen özel Heartwood odası ve Megolm yapılandırması bulunamadı.');
  }
}

export function assertRoom(state: StateEvent[], self: string): string {
  assertRoomSettings(state);
  const members = state.filter(event => event.type === 'm.room.member' &&
    ['join', 'invite', 'knock'].includes(String(event.content.membership)));
  const own = members.find(event => event.state_key === self);
  const peer = members.find(event => event.state_key !== self);
  if (members.length !== 2 || !peer || peer.content.membership !== 'join' ||
      own?.content.membership !== 'join') {
    throw new Error('İki kişilik beklenen oda üyeliği sağlanmadı.');
  }
  return localUser(peer.state_key, self);
}

export function assertTargets(body: unknown, expected: DeviceIdentity[]): void {
  if (!body || typeof body !== 'object' || !('messages' in body) ||
      !body.messages || typeof body.messages !== 'object') throw new Error('Geçersiz anahtar dağıtımı.');
  const targets = Object.entries(body.messages).flatMap(([user, devices]) =>
    Object.entries(devices as Record<string, {algorithm?: string; ciphertext?: object}>)
      .map(([device, event]) => ({ user, device, event })));
  if (!targets.length || targets.some(({user, device, event}) => {
    const identity = expected.find(item => item.user === user && item.device === device);
    return !identity || event?.algorithm !== 'm.olm.v1.curve25519-aes-sha2' ||
      Object.keys(event.ciphertext ?? {}).join() !== identity.curve;
  })) throw new Error('Anahtar dağıtım hedefi doğrulanmış cihazla eşleşmiyor.');
}
