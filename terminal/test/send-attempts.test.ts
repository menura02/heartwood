import assert from 'node:assert/strict';
import test from 'node:test';
import { SendAttempts } from '../src/send-attempts.ts';
import { MatrixFailure } from '../src/matrix.ts';

test('pending sends expose room metadata and discard is bound to an idle record', async () => {
  const attempts = new SendAttempts<string>();
  const fail = async () => { throw new Error('response lost'); };
  await attempts.start('room', async () => 'ciphertext', fail);
  assert.deepEqual(attempts.pendingRooms(), ['room']);
  const confirm = attempts.prepareDiscard('room');
  const blocked = Promise.withResolvers<void>();
  const retry = attempts.retry('room', () => blocked.promise, async () => '$accepted');
  assert.throws(confirm, /sürüyor/);
  blocked.resolve();
  await retry;
  await attempts.start('room', async () => 'new ciphertext', fail);
  assert.throws(confirm, /değişti/);
  attempts.prepareDiscard('room')();
  assert.deepEqual(attempts.pendingRooms(), []);
});

test('an ambiguous send retries the identical ciphertext and checks permission again', async () => {
  const attempts = new SendAttempts<string>();
  const prepared = JSON.stringify({ciphertext: 'fixture'});
  const submissions: string[] = [];
  const submit = async (value: string) => {
    submissions.push(value);
    if (submissions.length === 1) throw new Error('response lost');
    return '$event';
  };
  assert.deepEqual(await attempts.start('room', async () => prepared, submit), {status: 'uncertain'});
  await assert.rejects(attempts.start('room', async () => 'different', submit), /tekrar/);
  await assert.rejects(attempts.retry('room', async () => { throw new Error('blocked'); }, submit), /blocked/);
  assert.deepEqual(await attempts.retry('room', async value => assert.equal(value, prepared), submit),
    {status: 'accepted', eventId: '$event'});
  assert.deepEqual(submissions, [prepared, prepared]);
  await assert.rejects(attempts.retry('room', async () => {}, submit), /Bekleyen/);
});

test('a definitive initial rejection clears the slot, but a later rejection does not resolve uncertainty', async () => {
  const attempts = new SendAttempts<string>();
  const reject = async () => { throw new MatrixFailure(403, 'M_FORBIDDEN'); };
  await assert.rejects(attempts.start('room', async () => 'one', reject), /403/);
  await attempts.start('room', async () => 'two', async () => { throw new Error('timeout'); });
  assert.deepEqual(await attempts.retry('room', async () => {}, reject), {status: 'uncertain'});
  assert.deepEqual(await attempts.retry('room', async () => {}, async value => {
    assert.equal(value, 'two');
    return '$ok';
  }), {status: 'accepted', eventId: '$ok'});
});
