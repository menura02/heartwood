import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveRecovery } from '../src/connection.ts';
import { MatrixFailure, MatrixTransportFailure, MatrixHttp } from '../src/matrix.ts';

test('temporary failures use bounded jitter and success resets the next delay', () => {
  const recovery = new LiveRecovery(() => 0.5);
  const failure = new MatrixTransportFailure();
  assert.deepEqual(recovery.fail(failure), {delay: 500, status: 'reconnecting'});
  assert.deepEqual(recovery.fail(failure), {delay: 1000});
  assert.deepEqual(recovery.success(true), {delay: 50, status: 'catchingUp'});
  assert.deepEqual(recovery.success(false), {delay: 1500, status: 'connected'});
  assert.equal(recovery.fail(failure).delay, 500);
  for (let i = 0; i < 4; i++) assert.ok(recovery.fail(failure).delay! <= 8000);
  assert.equal(recovery.fail(failure).delay, undefined);
  assert.equal(recovery.fail(new MatrixFailure(401, 'M_UNKNOWN_TOKEN')).delay, undefined);
  assert.equal(recovery.fail(new Error('invalid Matrix response')).delay, undefined);
});

test('HTTP cancellation reaches the active fetch and is distinct from a network failure', async t => {
  const shutdown = new AbortController();
  const reading = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: {signal: AbortSignal}) => {
    const signal = options.signal;
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
    throw new Error('unexpected fetch completion');
  });
  const http = new MatrixHttp('http://127.0.0.1:18008', shutdown.signal);
  const pending = http.withSignal(reading.signal, () => http.request('GET', 'sync'));
  reading.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(shutdown.signal.aborted, false);
});

test('a truncated authorization response still pauses automatic reads', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({
    status: 403,
    async json() { throw new TypeError('truncated response'); },
  }));
  const http = new MatrixHttp('http://127.0.0.1:18008');
  await assert.rejects(http.request('GET', 'sync'), {status: 403});
});

test('an unrecognized Matrix error code is retained for callers and hidden from its message', async t => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({errcode: 'M_PRIVATE_DETAIL', error: 'secret token'}, {status: 403}));
  const http = new MatrixHttp('http://127.0.0.1:18008');
  await assert.rejects(http.request('GET', 'sync'), (error: unknown) => {
    assert.ok(error instanceof MatrixFailure);
    assert.equal(error.status, 403);
    assert.equal(error.code, 'M_PRIVATE_DETAIL');
    assert.match(error.message, /HW_MATRIX_REQUEST/);
    assert.doesNotMatch(error.message, /M_PRIVATE_DETAIL|secret token/);
    return true;
  });
});
