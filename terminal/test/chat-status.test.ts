import assert from 'node:assert/strict';
import test from 'node:test';
import { Heartwood } from '../src/client.ts';
import { HeartwoodError } from '../src/failures.ts';
import { MatrixTransportFailure } from '../src/matrix.ts';
import type { DeviceIdentity, StateEvent } from '../src/policy.ts';
import { megolm } from '../src/policy.ts';
import { SendAttempts } from '../src/send-attempts.ts';

const own: DeviceIdentity = {user: '@alice:localhost', device: 'ALICE', ed: 'a'.repeat(43), curve: 'b'.repeat(43)};
const peer: DeviceIdentity = {user: '@bob:localhost', device: 'BOB', ed: 'c'.repeat(43), curve: 'd'.repeat(43)};
const room = '!chat:localhost';
const state: StateEvent[] = [
  {type: 'com.heartwood.direct', state_key: '', content: {version: 1}},
  {type: 'm.room.encryption', state_key: '', content: {algorithm: megolm}},
  {type: 'm.room.join_rules', state_key: '', content: {join_rule: 'invite'}},
  {type: 'm.room.history_visibility', state_key: '', content: {history_visibility: 'joined'}},
  {type: 'm.room.create', state_key: '', content: {'m.federate': false}},
  ...[own, peer].map(({user}) => ({type: 'm.room.member', state_key: user, content: {membership: 'join'}})),
];

function fixture({pin, devices, roomState, syncError, blocked}: {
  pin?: DeviceIdentity | null; devices?: DeviceIdentity[]; roomState?: StateEvent[]; syncError?: Error; blocked?: boolean;
} = {}) {
  const sends = new SendAttempts<object>();
  const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
    identity: own,
    profile: {data: {blocked: blocked ? [peer.user] : [], pins: pin === null ? {} : {[peer.user]: pin ?? peer}}},
    sync: async () => { if (syncError) throw syncError; return 'cursor'; },
    roomState: async () => roomState ?? state,
    devices: async () => devices ?? [own, peer],
    sends,
  });
  return {client, sends};
}

test('room status reports separate policy checks and current peer without exposing keys', async () => {
  const {client} = fixture();
  const before = Date.now();
  const result = await client.detailedStatus(room);
  assert.ok(result.checkedAt >= before);
  assert.deepEqual({...result, checkedAt: 0}, {
    checkedAt: 0, connection: 'connected', encryption: 'pass', membership: 'pass',
    peer: peer.user, device: peer.device, verification: 'verified', sending: 'allowed', pending: 'none',
  });
  assert.doesNotMatch(JSON.stringify(result), /[a-d]{43}/);
});

test('known room and device blocks agree with real send authorization', async () => {
  for (const [options, code, checks] of [
    [{pin: null}, 'deviceNotVerified', {verification: 'unverified'}],
    [{pin: {...peer, curve: 'e'.repeat(43)}}, 'trustedDeviceChanged', {verification: 'changed'}],
    [{blocked: true}, 'peerBlocked', {membership: 'pass', verification: 'unknown'}],
    [{roomState: state.filter(event => event.type !== 'm.room.encryption')},
      'invalidRoomSettings', {encryption: 'fail', membership: 'pass'}],
    [{roomState: state.filter(event => event.state_key !== peer.user)},
      'invalidRoomMembership', {encryption: 'pass', membership: 'fail'}],
  ] as const) {
    const {client} = fixture(options);
    const result = await client.detailedStatus(room);
    assert.equal(result.sending, 'blocked');
    assert.equal((result.reason as HeartwoodError).code, code);
    for (const [field, expected] of Object.entries(checks)) assert.equal(result[field as keyof typeof checks], expected);
    await assert.rejects(client.send(room, 'test'), {code});
  }
});

test('a failed connection leaves policy unknown and uncertainty blocks a new send', async () => {
  const offline = fixture({syncError: new MatrixTransportFailure()}).client;
  const result = await offline.detailedStatus(room);
  assert.equal(result.connection, 'failed');
  assert.equal(result.sending, 'unknown');
  assert.equal(result.encryption, 'unknown');
  assert.equal(result.membership, 'unknown');
  assert.equal(result.verification, 'unknown');
  assert.equal(result.device, undefined);
  const {client, sends} = fixture();
  await sends.start(room, async () => ({}), async () => { throw new Error('response lost'); });
  const pending = await client.detailedStatus(room);
  assert.equal(pending.pending, 'uncertain');
  assert.equal(pending.sending, 'blocked');
  assert.equal((pending.reason as HeartwoodError).code, 'pendingSendExists');
  await assert.rejects(client.send(room, 'test'), {code: 'pendingSendExists'});
});

test('send checks a replacement device after an allowed status and status does not repin it', async () => {
  const devices = [own, peer];
  const {client} = fixture({devices});
  assert.equal((await client.detailedStatus(room)).sending, 'allowed');
  const replacement = {...peer, device: 'NEW', curve: 'e'.repeat(43)};
  devices[1] = replacement;
  const changed = await client.detailedStatus(room);
  assert.equal(changed.verification, 'changed');
  assert.equal(changed.device, replacement.device);
  assert.equal(client.profile.data.pins[peer.user], peer);
  await assert.rejects(client.send(room, 'test'), {code: 'trustedDeviceChanged'});
});

test('status distinguishes an in-flight initial send from a retry and agrees with the slot guard', async () => {
  const {client, sends} = fixture();
  const submit = Promise.withResolvers<string>();
  const initial = sends.start(room, async () => ({}), () => submit.promise);
  const busy = await client.detailedStatus(room);
  assert.equal(busy.pending, 'busy');
  assert.equal((busy.reason as HeartwoodError).code, 'sendInProgress');
  await assert.rejects(client.send(room, 'test'), {code: 'sendInProgress'});
  submit.reject(new Error('response lost'));
  await initial;
  const authorization = Promise.withResolvers<void>();
  const retry = sends.retry(room, () => authorization.promise, async () => '$accepted');
  assert.equal((await client.detailedStatus(room)).pending, 'retrying');
  authorization.resolve();
  await retry;
  assert.equal((await client.detailedStatus(room)).pending, 'none');
});
