import assert from 'node:assert/strict';
import { link, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { Profile } from '../src/profile.ts';
import { Heartwood } from '../src/client.ts';
import { MatrixHttp } from '../src/matrix.ts';

const origin = 'http://127.0.0.1:18008';
const device = '41111111-1111-4111-8111-111111111111';
const peer = '@bob:localhost';
const legacy = {origin, username: 'alice', device,
  identity: {user: '@Alice_legacy:localhost', device, ed: 'syntheticEd', curve: 'syntheticCurve'},
  pins: {[peer]: {user: peer, device: 'fixture-device', ed: 'peerEd', curve: 'peerCurve'}},
  blocked: ['@charlie:localhost'], sync: {cursor: 'opaque/fixture+cursor', invites: [['!fixture:localhost', peer]]},
  extension: {fixture: true},
};

async function profileFixture(context: TestContext, record: string) {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-migration-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  const directory = join(root, 'alice');
  const path = join(directory, 'profile.json');
  const next = join(directory, 'profile.next');
  await mkdir(directory);
  await writeFile(path, record);
  return {root, directory, path, next};
}

test('migrates an unversioned 0.6 fixture without touching the SDK store and reopens without writing', async context => {
  const {root, directory, path, next} = await profileFixture(context, JSON.stringify(legacy));
  const store = join(directory, 'keys', 'matrix-sdk-crypto.sqlite3');
  await mkdir(join(directory, 'keys'));
  await writeFile(store, 'synthetic SDK marker');
  const expected = {...legacy, schemaVersion: 1};
  for (let attempt = 0; attempt < 2; attempt++) {
    const profile = await Profile.open('alice', origin, 'alice', root);
    try { assert.deepEqual(profile.data, expected); }
    finally { await profile.close(); }
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), expected);
    assert.equal(await readFile(store, 'utf8'), 'synthetic SDK marker');
  }
  // A current profile opens even when the write staging path is unavailable.
  await mkdir(next);
  const current = await Profile.open('alice', origin, 'alice', root);
  await current.close();
});

test('rejects unknown versions and corrupt or incomplete records without changing them', async context => {
  for (const [record, code] of [
    [JSON.stringify({...legacy, schemaVersion: 2}), 'profileSchemaUnsupported'],
    [JSON.stringify({...legacy, schemaVersion: null}), 'profileRecordInvalid'],
    [JSON.stringify({...legacy, pins: null}), 'profileRecordInvalid'],
    [JSON.stringify({...legacy, identity: {...legacy.identity, device: 'different'}}), 'profileRecordInvalid'],
    [JSON.stringify({...legacy, sync: {cursor: '', invites: []}}), 'profileRecordInvalid'],
    ['{"origin":', 'profileRecordInvalid'],
  ]) {
    const {root, path, next} = await profileFixture(context, record);
    await assert.rejects(Profile.open('alice', origin, 'alice', root), {code});
    assert.equal(await readFile(path, 'utf8'), record);
    await assert.rejects(lstat(next), {code: 'ENOENT'});
  }
});

test('failed migration keeps old record and a restart ignores a prior interrupted staged write', async context => {
  const record = JSON.stringify(legacy);
  const {root, path, next} = await profileFixture(context, record);
  await mkdir(next);
  await assert.rejects(Profile.open('alice', origin, 'alice', root), {code: 'profileUnsafePath'});
  assert.equal(await readFile(path, 'utf8'), record);
  await rmdir(next);
  await writeFile(next, '{"schemaVersion":');
  const profile = await Profile.open('alice', origin, 'alice', root);
  await profile.close();
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {...legacy, schemaVersion: 1});
  await assert.rejects(lstat(next), {code: 'ENOENT'});
});

test('a staged record by itself cannot recreate a missing profile', async context => {
  const body = JSON.stringify({...legacy, schemaVersion: 1});
  const {root, path, next} = await profileFixture(context, body);
  await writeFile(next, body);
  await rm(path);
  await assert.rejects(Profile.open('alice', origin, 'alice', root), {code: 'profileRecordMissing'});
  assert.equal(await readFile(next, 'utf8'), body);
  await assert.rejects(lstat(path), {code: 'ENOENT'});
});

async function cryptoFixture(context: TestContext) {
  const temporary = await realpath(tmpdir());
  const root = await mkdtemp(join(temporary, 'heartwood-crypto-path-'));
  let profile: Profile | undefined;
  context.after(async () => {
    await profile?.close();
    const path = await realpath(root);
    assert.equal(dirname(path), temporary);
    await rm(path, {recursive: true, force: true});
  });
  profile = await Profile.open('alice', origin, 'alice', join(root, 'profiles'));
  return {root, profile, keys: join(profile.path, 'keys')};
}

function openCrypto(profile: Profile, http: MatrixHttp) {
  return Heartwood.open(http, profile, {
    user_id: '@alice:localhost', device_id: profile.data.device, access_token: 'fixture',
  }, 'synthetic store passphrase');
}

test('SDK startup rejects linked key directories before touching the target', async context => {
  const {root, profile, keys} = await cryptoFixture(context);
  const outside = join(root, 'outside');
  await mkdir(outside);
  try { await symlink(outside, keys, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    context.skip('This environment does not allow creating directory links');
    return;
  }
  const http = new MatrixHttp(origin);
  const requests = context.mock.method(http, 'request', async () => { throw new Error('Unexpected network request'); });
  await assert.rejects(openCrypto(profile, http), {code: 'profileUnsafePath'});
  assert.equal(requests.mock.callCount(), 0);
  assert.deepEqual(await readdir(outside), []);
  assert.ok((await lstat(keys)).isSymbolicLink());
});

test('SDK startup rejects invalid key directories and unsafe SQLite files', async context => {
  for (const [entry, suffix] of [
    ['keys file', ''], ['database directory', ''], ['database hard link', ''], ['WAL hard link', '-wal'],
    ['journal hard link', '-journal'], ['SHM hard link', '-shm'],
  ]) {
    await context.test(entry, async subtest => {
      const {root, profile, keys} = await cryptoFixture(subtest);
      const outside = join(root, 'outside');
      const database = join(keys, 'matrix-sdk-crypto.sqlite3');
      if (entry === 'keys file') await writeFile(keys, 'fixture');
      else {
        await mkdir(keys);
        if (entry === 'database directory') await mkdir(database);
        else {
          await writeFile(outside, 'fixture');
          await link(outside, database + suffix);
        }
      }
      const http = new MatrixHttp(origin);
      const requests = subtest.mock.method(http, 'request', async () => { throw new Error('Unexpected network request'); });
      await assert.rejects(openCrypto(profile, http), {code: 'profileUnsafePath'});
      assert.equal(requests.mock.callCount(), 0);
      if (entry.endsWith('hard link')) assert.equal(await readFile(outside, 'utf8'), 'fixture');
    });
  }
});

test('SDK startup creates and reopens a regular key store without replacing its device identity', async context => {
  const {root, profile, keys} = await cryptoFixture(context);
  const http = new MatrixHttp(origin);
  context.mock.method(http, 'request', async (_method: string, path: string) => {
    if (path.startsWith('sync?')) return {next_batch: 'fixture'};
    if (path === 'keys/upload') return {one_time_key_counts: {signed_curve25519: 50}};
    if (path === 'keys/query') return {device_keys: {}};
    throw new Error('Unexpected fixture request');
  });
  const client = await openCrypto(profile, http);
  const identity = client.identity;
  await client.close();
  await profile.close();
  assert.ok((await lstat(join(keys, 'matrix-sdk-crypto.sqlite3'))).isFile());
  const reopened = await Profile.open('alice', origin, 'alice', join(root, 'profiles'));
  try {
    const next = await openCrypto(reopened, http);
    try { assert.ok(deviceIdentityMatches(next.identity, identity)); }
    finally { await next.close(); }
  } finally { await reopened.close(); }
});

function deviceIdentityMatches(left: Heartwood['identity'], right: Heartwood['identity']): boolean {
  return left.user === right.user && left.device === right.device && left.ed === right.ed && left.curve === right.curve;
}

test('a profile is locked, bound to its account and reopened with the same device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-'));
  try {
    const profile = await Profile.open('alice', origin, 'alice', root);
    const device = profile.data.device;
    await assert.rejects(Profile.open('alice', origin, 'alice', root), {code: 'profileInUse'});
    await profile.close();
    await assert.rejects(Profile.open('alice', origin, 'bob', root), {code: 'profileBindingMismatch'});
    const reopened = await Profile.open('alice', origin, 'alice', root);
    assert.equal(reopened.data.device, device);
    const saved = JSON.parse(await readFile(join(reopened.path, 'profile.json'), 'utf8')) as object;
    assert.deepEqual(Object.keys(saved).sort(), ['blocked', 'device', 'origin', 'pins', 'schemaVersion', 'username']);
    const temporary = join(reopened.path, 'profile.next');
    await mkdir(temporary);
    const blocked = ['@bob:localhost'];
    await assert.rejects(reopened.save({blocked}));
    assert.deepEqual(reopened.data.blocked, []);
    await rmdir(temporary);
    await Promise.all([reopened.save({blocked}), reopened.save({sync: {cursor: 'cursor', invites: []}})]);
    assert.deepEqual(reopened.data.blocked, blocked);
    assert.deepEqual(JSON.parse(await readFile(join(reopened.path, 'profile.json'), 'utf8')),
      {...saved, blocked, sync: {cursor: 'cursor', invites: []}});
    const close = reopened.close();
    assert.equal(reopened.close(), close);
    await close;
    await assert.rejects(reopened.save({blocked: []}), /profile is closed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
