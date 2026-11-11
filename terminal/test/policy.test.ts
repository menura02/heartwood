import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRoom, assertTargets, assertTrusted, deviceCode, localUser, matrixOrigin, safeText } from '../src/policy.ts';

const alice = { user: '@alice:localhost', device: 'A', ed: 'a', curve: 'x' };
const bob = { user: '@bob:localhost', device: 'B', ed: 'b', curve: 'y' };

test('origins, same-server IDs and terminal controls', () => {
  assert.equal(matrixOrigin('http://127.0.0.1:8008/'), 'http://127.0.0.1:8008');
  assert.throws(() => matrixOrigin('http://example.org'));
  assert.throws(() => matrixOrigin('https://user:pass@example.org'));
  assert.equal(localUser('@bob:localhost', alice.user), bob.user);
  assert.throws(() => localUser('@bob:remote.test', alice.user));
  assert.equal(safeText('a\u001b[2J\nb\u202e'), 'a�[2J�b�');
});

test('trusted identity includes both keys, user and device', () => {
  assert.equal(deviceCode(bob).length, 64);
  assert.doesNotThrow(() => assertTrusted(bob, bob));
  assert.throws(() => assertTrusted(undefined, bob));
  assert.throws(() => assertTrusted(bob, { ...bob, curve: 'changed' }));
});

test('room must be private, encrypted and have exactly the two joined members', () => {
  const state = [
    { type: 'com.heartwood.direct', state_key: '', content: { version: 1 } },
    { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
    { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'joined' } },
    { type: 'm.room.create', state_key: '', content: { 'm.federate': false } },
    ...[alice.user, bob.user].map(user => ({ type: 'm.room.member', state_key: user, content: { membership: 'join' } })),
  ];
  assert.equal(assertRoom(state, alice.user), bob.user);
  assert.throws(() => assertRoom(state.slice(1), alice.user));
  assert.throws(() => assertRoom([...state, { type: 'm.room.member', state_key: '@other:localhost', content: { membership: 'invite' } }], alice.user));
});

test('room keys can only target the exact pinned device and key', () => {
  const message = (curve: string) => ({ algorithm: 'm.olm.v1.curve25519-aes-sha2', ciphertext: { [curve]: {} } });
  assert.doesNotThrow(() => assertTargets({ messages: { [bob.user]: { B: message('y') } } }, [alice, bob]));
  assert.throws(() => assertTargets({ messages: { [bob.user]: { B: message('changed') } } }, [alice, bob]));
  assert.throws(() => assertTargets({ messages: { [bob.user]: { EXTRA: message('y') } } }, [alice, bob]));
});
