import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestType } from '@matrix-org/matrix-sdk-crypto-nodejs';
import { Heartwood } from '../src/client.ts';
import { formatError } from '../src/failures.ts';
import { MatrixHttp, login, register } from '../src/matrix.ts';
import { isKeyClaim, isKeyQuery, isKeyUpload, isSyncResponse, isToken } from '../src/matrix-response.ts';
import { megolm } from '../src/policy.ts';
import { SendAttempts } from '../src/send-attempts.ts';
import { SyncOwner } from '../src/sync-owner.ts';

const origin = 'http://127.0.0.1:18008';
const alice = '@alice:localhost';
const bob = '@bob:localhost';
const room = '!room:localhost';

test('malformed JSON and truncated body have distinct, safe bilingual messages', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{example-private-response'));
  const http = new MatrixHttp(origin);
  await assert.rejects(http.request('GET', 'sync'), {code: 'matrixInvalidJson'});
  fetch.mock.mockImplementation(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    pull(controller) { controller.error(new Error('example-private-response')); },
  })));
  await assert.rejects(http.request('GET', 'sync'), (error: unknown) => {
    assert.equal((error as {code: string}).code, 'matrixBodyInterrupted');
    assert.match(formatError(error, 'en'), /interrupted/);
    assert.match(formatError(error, 'tr'), /kesildi/);
    for (const language of ['en', 'tr'] as const) {
      assert.doesNotMatch(formatError(error, language), /example-private-response/);
    }
    return true;
  });
});

test('body byte cap applies without Content-Length and with a falsely small Content-Length', async t => {
  for (const length of [undefined, '4']) {
    await t.test(String(length), async context => {
      let canceled = false;
      const headers = length === undefined ? undefined : {'Content-Length': length};
      context.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(512 * 1024).fill(32));
          controller.enqueue(new Uint8Array(512 * 1024 + 1).fill(32));
        },
        cancel() { canceled = true; },
      }), {headers}));
      await assert.rejects(new MatrixHttp(origin).request('GET', 'joined_rooms'), {code: 'matrixResponseTooLarge'});
      assert.equal(canceled, true);
    });
  }
});

test('sync accepts a body over the default limit and a falsely large Content-Length is not trusted', async t => {
  const payload = {next_batch: 'cursor', extension: 'ü'.repeat(524_288)};
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload, {headers: {'Content-Length': '999999999'}}));
  assert.deepEqual(await new MatrixHttp(origin).request('GET', 'sync?since=previous'), payload);
  await assert.rejects(new MatrixHttp(origin).request('GET', 'joined_rooms'), {code: 'matrixResponseTooLarge'});
});

test('user cancellation and timeout both cancel an active response read and remain distinct', async t => {
  for (const useTimeout of [false, true]) {
    await t.test(useTimeout ? 'timeout' : 'user cancellation', async context => {
      const abort = new AbortController();
      const reading = Promise.withResolvers<void>();
      let canceled = false;
      if (useTimeout) context.mock.method(AbortSignal, 'timeout', () => abort.signal);
      context.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
        pull() { reading.resolve(); },
        cancel() { canceled = true; },
      }, {highWaterMark: 0})));
      const http = new MatrixHttp(origin, useTimeout ? undefined : abort.signal);
      const request = http.request('GET', 'sync');
      await reading.promise;
      abort.abort();
      await assert.rejects(request, useTimeout ? {code: 'matrixTimeout'} : {name: 'AbortError'});
      assert.equal(canceled, true);
    });
  }
});

test('a timed-out authorization body retains HTTP status for recovery', async t => {
  const timeout = new AbortController();
  const reading = Promise.withResolvers<void>();
  t.mock.method(AbortSignal, 'timeout', () => timeout.signal);
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    pull() { reading.resolve(); },
  }, {highWaterMark: 0}), {status: 401}));
  const request = new MatrixHttp(origin).request('GET', 'sync');
  await reading.promise;
  timeout.abort();
  await assert.rejects(request, {status: 401, code: 'UNKNOWN', bodyFailure: 'matrixTimeout'});
});

test('login stores only a validated session and accepts extra Matrix fields', async t => {
  let response: unknown;
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  const http = new MatrixHttp(origin);
  const session = {access_token: 'synthetic-token', user_id: alice, device_id: 'DEVICE'};
  for (const value of [null, {}, {...session, access_token: 7}, {...session, access_token: 'a\nb'},
    {...session, access_token: '☺'}, {...session, user_id: '@alice:'},
    {...session, user_id: '@alice:matrix.invalid/path'}, {...session, device_id: 'DIFFERENT'}]) {
    response = value;
    await assert.rejects(login(http, 'alice', 'synthetic-passphrase', 'DEVICE'), {code: 'invalidLoginSession'});
    assert.equal(http.token, undefined);
  }
  response = {...session, extension: {}};
  assert.deepEqual(await login(http, 'alice', 'synthetic-passphrase', 'DEVICE'), session);
  assert.equal(http.token, session.access_token);
});

test('registration sends the token only after a valid challenge and refuses a mismatched follow-up session', async t => {
  const responses: Array<{value: unknown; status: number}> = [];
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    const next = responses.shift();
    assert.ok(next);
    return Response.json(next.value, {status: next.status});
  });
  const http = new MatrixHttp(origin);
  responses.push({value: {session: null, flows: [null]}, status: 401});
  const request = () => register(http, 'alice', 'synthetic-password', 'synthetic-registration-token');
  await assert.rejects(request(), {code: 'registrationFlowMissing'});
  assert.equal(fetch.mock.callCount(), 1);
  const challenge = {session: 'session', flows: [{stages: ['m.login.other']},
    {stages: ['m.login.registration_token', 'm.login.dummy'], extension: {}}]};
  const completed = {session: 'session', completed: ['m.login.registration_token']};
  responses.push({value: challenge, status: 401}, {value: {...completed, session: 'different'}, status: 401});
  await assert.rejects(request(), {code: 'registrationTokenRejected'});
  assert.equal(fetch.mock.callCount(), 3);
  responses.push({value: challenge, status: 401}, {value: completed, status: 401}, {value: {user_id: alice}, status: 200});
  await request();
  assert.equal(fetch.mock.callCount(), 6);
});

test('sync validates consumed sections while preserving unknown extensions and event types', async () => {
  const response = {
    next_batch: 'cursor', 'com.example.extension': {value: null},
    to_device: {events: [{type: 'com.example.custom', sender: '@old localpart:[::1]:8008', content: {value: [null]}}]},
    rooms: {join: {[room]: {timeline: {events: [{type: 'com.example.custom', content: {}, extension: null}]}}}},
  };
  assert.equal(isSyncResponse(response), true);
  for (const value of [{}, {next_batch: 'cursor', device_lists: null},
    {...response, device_lists: {changed: ['alice']}}, {...response, to_device: {events: [null]}},
    {...response, device_one_time_keys_count: {signed_curve25519: -1}},
    {...response, rooms: {join: {[room]: {timeline: {events: [{type: 'm.room.encrypted', content: {}}]}}}}}]) {
    const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
      http: {withSignal: (_: AbortSignal, action: () => Promise<string>) => action(), request: async () => value},
      profile: {data: {}, save: () => assert.fail('Malformed sync advanced the cursor')},
      syncOwner: new SyncOwner<string>(),
      machine: {receiveSyncChanges: () => assert.fail('Malformed sync reached the SDK')},
    });
    await assert.rejects(client.sync(), {code: 'invalidSyncResponse'});
  }
});

test('opaque tokens reject unpaired surrogates while accepting valid supplementary Unicode', () => {
  const invalid = String.fromCharCode(0xd800);
  const valid = 'cursor-🪵';
  assert.equal(isToken(invalid), false);
  assert.equal(isSyncResponse({next_batch: invalid}), false);
  assert.equal(isToken(valid), true);
  assert.equal(isSyncResponse({next_batch: valid}), true);
  assert.equal(new URLSearchParams({since: valid}).get('since'), valid);
});

test('invalid membership state never reaches key verification or send authorization', async () => {
  const state = [
    {type: 'com.heartwood.direct', state_key: '', content: {version: 1}},
    {type: 'm.room.encryption', state_key: '', content: {algorithm: megolm}},
    {type: 'm.room.join_rules', state_key: '', content: {join_rule: 'invite'}},
    {type: 'm.room.history_visibility', state_key: '', content: {history_visibility: 'joined'}},
    {type: 'm.room.create', state_key: '', content: {'m.federate': false}},
    ...[alice, bob].map(state_key => ({type: 'm.room.member', state_key, content: {membership: 'join'}})),
  ];
  for (const malformed of [
    {type: 'm.room.member', state_key: '@third:localhost', content: {membership: null}},
    {type: 'm.room.member', state_key: 'not-a-user-id', content: {membership: 'leave'}},
    {type: 'm.room.member', state_key: bob, content: {membership: 'leave'}},
    {type: 'm.room.encryption', state_key: '', content: {algorithm: null}},
  ]) {
    const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
      identity: {user: alice}, sync: async () => 'cursor', sends: new SendAttempts<object>(),
      profile: {data: {blocked: []}},
      http: {request: async () => [...state, malformed]},
      devices: () => assert.fail('Invalid membership reached key verification'),
    });
    await assert.rejects(client.send(room, 'synthetic-message'), {code: 'matrixInvalidResponse'});
    const status = await client.detailedStatus(room);
    assert.equal(status.membership, 'unknown');
    assert.equal(status.sending, 'unknown');
  }
});

test('keys are structurally validated before the SDK or the pin store sees them', async () => {
  const key = 'a'.repeat(43);
  const device = {user_id: bob, device_id: 'DEVICE', algorithms: ['m.megolm.v1.aes-sha2'],
    keys: {'ed25519:DEVICE': key, 'curve25519:DEVICE': key}, signatures: {[bob]: {'ed25519:DEVICE': 'signature'}}};
  assert.equal(isKeyQuery({device_keys: {[bob]: {DEVICE: device}}, unknown_extension: null}), true);
  assert.equal(isKeyUpload({one_time_key_counts: {signed_curve25519: 3}}), true);
  assert.equal(isKeyUpload({one_time_key_counts: {signed_curve25519: 0.5}}), false);
  assert.equal(isKeyClaim({one_time_keys: {[bob]: {DEVICE: {'signed_curve25519:x': {key, signatures: device.signatures}}}}}), true);
  assert.equal(isKeyClaim({one_time_keys: {[bob]: {DEVICE: null}}}), false);
  for (const bad of [null, {...device, device_id: 'REPLACEMENT'}, {...device, keys: []}, {...device, signatures: null}]) {
    const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
      identity: {user: alice}, profile: {data: {pins: {}, blocked: []}, save: () => assert.fail('Pin stored')},
      http: {request: async () => ({device_keys: {[bob]: {DEVICE: bad}}})},
      machine: {
        queryKeysForUsers: () => ({id: 'key-request', type: RequestType.KeysQuery, body: '{}'}),
        markRequestAsSent: () => assert.fail('Malformed device keys reached the SDK'),
      },
    });
    await assert.rejects(client.verify(bob, '1'.repeat(64)), {code: 'invalidDeviceKeys'});
  }
});
