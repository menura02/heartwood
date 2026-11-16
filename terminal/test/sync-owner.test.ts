import assert from 'node:assert/strict';
import test from 'node:test';
import { Heartwood } from '../src/client.ts';
import { MatrixHttp } from '../src/matrix.ts';
import { SyncOwner } from '../src/sync-owner.ts';

function fixture() {
  const http = new MatrixHttp('http://127.0.0.1:8008');
  const work = Promise.withResolvers<string>();
  const starts: AbortSignal[] = [];
  const closes: string[] = [];
  const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
    http, syncOwner: new SyncOwner<string>(),
    syncOnce: () => {
      assert.ok(http.currentSignal);
      starts.push(http.currentSignal);
      return work.promise;
    },
    machine: {close: () => { closes.push('SDK closed'); }},
  });
  return {client, http, work, starts, closes};
}

test('concurrent sync callers share one cursor owner and an abandoned caller cannot cancel it', async () => {
  const {client, http, work, starts} = fixture();
  const oldRoom = new AbortController();
  const newRoom = new AbortController();
  const first = http.withSignal(oldRoom.signal, () => client.sync());
  oldRoom.abort();
  await assert.rejects(first, {name: 'AbortError'});
  const next = http.withSignal(newRoom.signal, () => client.sync());
  assert.equal(starts.length, 1);
  assert.notEqual(starts[0], oldRoom.signal);
  assert.equal(starts[0].aborted, false);
  work.resolve('next cursor');
  assert.equal(await next, 'next cursor');
  await client.close();
});

test('exit aborts shared sync, waits for cleanup and closes the SDK once', async () => {
  const {client, http, work, starts, closes} = fixture();
  const room = new AbortController();
  const reading = http.withSignal(room.signal, () => client.sync());
  const aborted = assert.rejects(reading, {name: 'AbortError'});
  room.abort();
  const close = client.close();
  assert.equal(client.close(), close);
  assert.equal(starts[0].aborted, true);
  assert.deepEqual(closes, []);
  await assert.rejects(client.sync(), {name: 'AbortError'});
  work.reject(starts[0].reason);
  await Promise.all([aborted, close]);
  assert.deepEqual(closes, ['SDK closed']);
  await client.close();
  assert.equal(closes.length, 1);
});
