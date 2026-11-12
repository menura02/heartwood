import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { Profile } from '../src/profile.ts';

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
