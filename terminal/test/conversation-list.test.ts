import assert from 'node:assert/strict';
import test from 'node:test';
import { ConversationList } from '../src/conversation-list.ts';

test('a refreshed list never reassigns an old number to a different conversation', () => {
  const list = new ConversationList();
  const bob = {room: '!b', peer: '@bob:localhost', verified: true};
  const alice = {room: '!a', peer: '@alice:localhost', verified: false};
  assert.deepEqual(list.replace([bob, alice]).map(item => item.peer), [alice.peer, bob.peer]);
  assert.equal(list.select('2').room, bob.room);
  const next = list.replace([bob, {room: '!c', peer: '@carol:localhost', verified: undefined}]);
  assert.deepEqual(next.map(item => item.number), [2, 3]);
  assert.throws(() => list.select('1'), /seçim/);
  assert.throws(() => list.select('2e0'), /seçim/);
  assert.equal(list.select('2').peer, bob.peer);
  list.replace([{...bob, peer: '@other:localhost'}]);
  assert.throws(() => list.select('2'), /seçim/);
  assert.equal(list.select('4').peer, '@other:localhost');
});
