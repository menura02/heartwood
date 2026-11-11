import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { deviceCode } from '../src/policy.ts';
import type { DeviceIdentity } from '../src/policy.ts';
import type { HistoryPage } from '../src/history.ts';

function rpc<T>(worker: ChildProcess, op: string, args: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const exited = (code: number | null) => {
      worker.off('message', replied);
      reject(new Error(`Fixture process exited during ${op} (${code}).`));
    };
    const replied = (reply: { value?: T; error?: string }) => {
      worker.off('exit', exited);
      if (reply.error) reject(new Error(reply.error));
      else resolve(reply.value as T);
    };
    worker.once('message', replied);
    worker.once('exit', exited);
    worker.send({op, ...args});
  });
}

test('Synapse: şifreli sohbet, çevrimdışı teslim, sayfalı geçmiş ve erişim sınırları', {timeout: 300_000}, async context => {
  const origin = process.env.HEARTWOOD_TEST_ORIGIN;
  const token = process.env.HEARTWOOD_TEST_REGISTRATION_TOKEN;
  assert.ok(origin && token, 'Use a disposable Synapse and supply the two integration environment variables.');
  const logPath = process.env.HEARTWOOD_TEST_SERVER_LOG;
  const logOffset = logPath ? (await readFile(logPath)).length : 0;
  const root = await mkdtemp(join(tmpdir(), 'heartwood-test-'));
  const prefix = randomUUID().slice(0, 8);
  const password = randomUUID();
  const passphrase = randomUUID();
  const workers = new Map<string, ChildProcess>();

  async function open(name: string, first: boolean, storePassword = passphrase, account = name) {
    const worker = fork(fileURLToPath(new URL('./profile-worker.ts', import.meta.url)));
    workers.set(name, worker);
    const identity = await rpc<DeviceIdentity>(worker, 'open', {
      origin, token, name, username: account + prefix, password, passphrase: storePassword, root, first,
    });
    return {worker, identity};
  }

  async function close(name: string) {
    const worker = workers.get(name);
    if (!worker) return;
    workers.delete(name);
    if (worker.exitCode !== null || worker.signalCode !== null) return;
    const exit = new Promise<number | null>(resolve => worker.once('exit', resolve));
    try {
      await rpc(worker, 'close');
    } finally {
      assert.equal(await exit, 0, 'fixture closed cleanly');
    }
  }

  context.after(async () => {
    try { await Promise.all([...workers.keys()].map(close)); }
    finally { await rm(root, {recursive: true, force: true, maxRetries: 8, retryDelay: 200}); }
  });

  const alice = await open('alice', true);
  let bob = await open('bob', true);
  const outsider = await open('eve', true);
  const incompatible = await rpc<{room_id: string}>(alice.worker, 'incompatible-invite', {peer: bob.identity.user});
  await assert.rejects(rpc(bob.worker, 'accept', {room: incompatible.room_id}));
  assert.ok(!(await rpc<string[]>(bob.worker, 'rooms')).includes(incompatible.room_id));
  const rejected = await rpc<string>(alice.worker, 'invite', {peer: bob.identity.user});
  type Invite = {room: string; peer: string};
  assert.equal((await rpc<Invite[]>(bob.worker, 'pending'))[0]?.room, rejected);
  await rpc(bob.worker, 'reject', {room: rejected});
  await assert.rejects(rpc(bob.worker, 'accept', {room: rejected}));
  await assert.rejects(rpc(alice.worker, 'send', {room: rejected, text: 'rejected'}));

  const room = await rpc<string>(alice.worker, 'invite', {peer: bob.identity.user});
  assert.ok((await rpc<Invite[]>(bob.worker, 'pending')).some(invite => invite.room === room));
  await assert.rejects(rpc(outsider.worker, 'accept', {room}));
  await rpc(bob.worker, 'accept', {room});
  await assert.rejects(rpc(outsider.worker, 'history', {room}));
  await assert.rejects(rpc(alice.worker, 'send', {room, text: 'unverified'}), /doğrulanmadı/);
  assert.deepEqual(await rpc(alice.worker, 'status', {room}), {peer: bob.identity.user, verified: false});
  await assert.rejects(rpc(alice.worker, 'verify', {peer: bob.identity.user, text: '0'.repeat(64)}), /eşleşmedi/);
  const bobCode = deviceCode(bob.identity);
  await rpc(alice.worker, 'verify', {peer: bob.identity.user, text: bobCode});
  await rpc(bob.worker, 'verify', {peer: alice.identity.user, text: deviceCode(alice.identity)});
  assert.deepEqual(await rpc(alice.worker, 'status', {room}), {peer: bob.identity.user, verified: true});
  await assert.rejects(rpc(alice.worker, 'send', {room, peer: outsider.identity.user, text: 'wrong conversation'}),
    /karşı tarafı değişti/);
  const conversations = await rpc<{rooms: Array<{room: string; peer: string; verified: boolean}>; unavailable: number}>(
    alice.worker, 'conversations');
  assert.deepEqual(conversations.rooms, [{room, peer: bob.identity.user, verified: true}]);
  assert.ok(conversations.unavailable > 0);
  const marker = 'HEARTWOOD-FIXTURE-' + randomUUID();
  await close('bob');
  await rpc(alice.worker, 'send', {room, text: marker});
  bob = await open('bob', false);
  assert.equal(deviceCode(bob.identity), bobCode);
  type Line = {sender: string; body?: string};
  assert.ok((await rpc<Line[]>(bob.worker, 'history', {room})).some(event => event.body === marker), 'offline message decrypted');
  const response = 'reply-' + randomUUID();
  await rpc(bob.worker, 'send', {room, text: response});
  assert.ok((await rpc<Line[]>(alice.worker, 'history', {room})).some(event => event.body === response), 'reply decrypted');
  await close('bob');
  await assert.rejects(open('bob', false, randomUUID()), /Kripto deposu açılamadı/);
  await close('bob');
  bob = await open('bob', false);
  assert.ok((await rpc<Line[]>(bob.worker, 'history', {room})).some(event => event.body === marker), 'history survives reopening');
  const wire = await rpc<{chunk: Array<{type: string}>}>(alice.worker, 'wire', {room});
  assert.equal(wire.chunk.filter(event => event.type === 'm.room.encrypted').length, 2);
  assert.ok(!wire.chunk.some(event => event.type === 'm.room.message'));
  assert.ok(!JSON.stringify(wire).includes(marker));
  assert.ok(!JSON.stringify(wire).includes(response));

  const lostMessage = 'retry-' + prefix;
  assert.deepEqual(await rpc(alice.worker, 'send-losing-response', {room, text: lostMessage}), {status: 'uncertain'});
  const retry = await rpc<{result: {status: string; eventId: string}; matched: boolean; originalEvent: string}>(
    alice.worker, 'retry-send', {room});
  assert.ok(retry.matched);
  assert.deepEqual(retry.result, {status: 'accepted', eventId: retry.originalEvent});
  type EventLine = Line & {id: string};
  const initialLive = await rpc<EventLine[]>(bob.worker, 'live-open', {room});
  assert.equal(initialLive.filter(line => line.body === lostMessage).length, 1);
  await assert.rejects(rpc(bob.worker, 'live-offline', {room}), /network interruption/);

  const fixturePrefix = `history-${prefix}-`;
  const messages = Array.from({length: 120}, (_, index) => fixturePrefix + index);
  for (const text of messages) await rpc(alice.worker, 'send', {room, text});
  const liveLines: EventLine[] = [];
  for (let count = 0; count < 8 && liveLines.length < messages.length; count++) {
    liveLines.push(...await rpc<EventLine[]>(bob.worker, 'live-refresh'));
  }
  assert.deepEqual(liveLines.map(line => line.body), messages);
  assert.equal(new Set(liveLines.map(line => line.id)).size, 120);
  assert.deepEqual(await rpc(bob.worker, 'live-refresh'), []);
  let page = await rpc<HistoryPage>(bob.worker, 'history-page', {room});
  const firstCursor = page.next;
  assert.ok(firstCursor);
  assert.deepEqual(page.lines, await rpc<Line[]>(bob.worker, 'history', {room}));
  const chronologicalPages: string[][] = [];
  for (let count = 0; ; count++) {
    assert.ok(count < 10, 'history pagination terminates');
    assert.ok(page.lines.length <= 50);
    chronologicalPages.unshift(page.lines.flatMap(({body}) => body?.startsWith(fixturePrefix) ? [body] : []));
    if (page.next === undefined) break;
    page = await rpc<HistoryPage>(bob.worker, 'history-page', {room, before: page.next});
  }
  assert.ok(chronologicalPages.filter(lines => lines.length > 0).length >= 3);
  assert.deepEqual(chronologicalPages.flat(), messages);
  await assert.rejects(rpc(outsider.worker, 'history-page', {room, before: firstCursor}));

  let before: string | undefined;
  let encryptedEvents = 0;
  for (let count = 0; ; count++) {
    assert.ok(count < 10, 'raw pagination terminates');
    const raw = await rpc<{chunk: Array<{type: string}>; end?: string}>(alice.worker, 'wire', {room, before});
    assert.ok(raw.chunk.length <= 50);
    assert.ok(!raw.chunk.some(event => event.type === 'm.room.message'));
    assert.ok(!JSON.stringify(raw).includes(fixturePrefix));
    assert.ok(!JSON.stringify(raw).includes(lostMessage));
    encryptedEvents += raw.chunk.filter(event => event.type === 'm.room.encrypted').length;
    if (raw.end === undefined) break;
    assert.notEqual(raw.end, before);
    before = raw.end;
  }
  assert.equal(encryptedEvents, 123);
  if (logPath) {
    const log = (await readFile(logPath)).subarray(logOffset).toString('utf8');
    assert.ok(log.includes('/send/m.room.encrypted'), 'server log contains a send request');
    assert.ok(!log.includes(marker), 'fixture plaintext absent in selected server log');
    assert.ok(!log.includes(response), 'fixture reply absent in selected server log');
    assert.ok(!log.includes(fixturePrefix), 'pagination fixture plaintext absent in selected server log');
    assert.ok(!log.includes(lostMessage), 'retry fixture plaintext absent in selected server log');
  }
  await open('bob-extra', false, passphrase, 'bob');
  await assert.rejects(rpc(alice.worker, 'send', {room, text: 'extra device'}), /Birden çok cihaz/);
  await close('bob-extra');
  await rpc(bob.worker, 'block', {peer: alice.identity.user});
  assert.ok(!(await rpc<string[]>(bob.worker, 'rooms')).includes(room));
  await assert.rejects(rpc(bob.worker, 'history-page', {room, before: firstCursor}));
  await assert.rejects(rpc(bob.worker, 'live-refresh', {room}));
  await assert.rejects(rpc(bob.worker, 'send-live', {text: 'blocked-live'}));
  assert.deepEqual(await rpc(bob.worker, 'conversations'), {rooms: [], unavailable: 0});
  await assert.rejects(rpc(bob.worker, 'invite', {peer: alice.identity.user}), /engelli/);
  await assert.rejects(rpc(alice.worker, 'send', {room, text: 'blocked'}));
  const blocked = await rpc<string>(alice.worker, 'invite', {peer: bob.identity.user});
  assert.ok(!(await rpc<Invite[]>(bob.worker, 'pending')).some(invite => invite.room === blocked));
});
