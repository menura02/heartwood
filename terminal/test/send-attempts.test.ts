import assert from 'node:assert/strict';
import test from 'node:test';
import { SendAttempts } from '../src/send-attempts.ts';
import { MatrixFailure } from '../src/matrix.ts';

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
