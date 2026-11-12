import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectProfile, listProfiles, removeProfile } from '../src/profile-management.ts';
import { Profile } from '../src/profile.ts';

const origin = 'http://127.0.0.1:18008';
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('lists public profile fields and isolates corrupt records', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'heartwood-profiles-'));
  const root = join(parent, 'profiles');
  try {
    assert.deepEqual(await listProfiles(root), []);
    assert.deepEqual(await readdir(parent), []);
    const alice = await Profile.open('alice', origin, 'alice', root);
    const device = alice.data.device;
    await alice.close();
    await mkdir(join(root, 'broken'));
    await writeFile(join(root, 'broken', 'profile.json'), '{');
    await mkdir(join(root, 'unrelated'));
    assert.deepEqual(await listProfiles(root), [
      {name: 'alice', record: {origin, username: 'alice', device}},
      {name: 'broken'},
      {name: 'unrelated'},
    ]);
    assert.deepEqual(await inspectProfile('alice', root), {name: 'alice', record: {origin, username: 'alice', device}});
    await assert.rejects(removeProfile('broken', root), {code: 'profileUnsafePath'});
    await assert.rejects(removeProfile('unrelated', root), {code: 'profileUnsafePath'});
  } finally {
    await rm(parent, {recursive: true, force: true});
  }
});

test('profiles CLI lists and shows offline while requiring an interactive confirmation to remove', async () => {
  const home = await mkdtemp(join(tmpdir(), 'heartwood-profile-cli-'));
  const root = join(home, '.heartwood');
  const recordPath = join(root, 'alice', 'profile.json');
  const cliEnv = {...process.env, HOME: home, USERPROFILE: home};
  function run(language: 'en' | 'tr', ...args: string[]) {
    return spawnSync(process.execPath, [cli, '--lang', language, 'profiles', ...args], {
      encoding: 'utf8', env: cliEnv, timeout: 10_000,
    });
  }
  try {
    const profile = await Profile.open('alice', origin, 'alice', root);
    await profile.close();
    const original = {...profile.data, password: 'example-password-marker',
      token: 'example-token-marker', privateKey: 'example-key-marker'};
    await writeFile(recordPath, JSON.stringify(original));
    await mkdir(join(root, 'broken'));
    await writeFile(join(root, 'broken', 'profile.json'), '{');

    const list = run('en', 'list');
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /alice/);
    assert.match(list.stdout, /broken/);
    const show = run('tr', 'show', 'alice');
    assert.equal(show.status, 0, show.stderr);
    for (const value of [origin, 'alice', profile.data.device]) assert.ok(show.stdout.includes(value));
    assert.doesNotMatch(list.stdout + show.stdout, /example-(?:password|token|key)-marker/);

    const remove = run('en', 'remove', 'alice');
    assert.equal(remove.status, 1);
    assert.match(remove.stderr, /interactive terminal/i);
    assert.deepEqual(JSON.parse(await readFile(recordPath, 'utf8')), original);
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test('cannot delete an active profile and retires only the requested profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-remove-'));
  try {
    const alice = await Profile.open('alice', origin, 'alice', root);
    const bob = await Profile.open('bob', origin, 'bob', root);
    await bob.close();
    try {
      await assert.rejects(removeProfile('alice', root), {code: 'profileInUse'});
      assert.equal((await inspectProfile('alice', root)).record?.device, alice.data.device);
    } finally {
      await alice.close();
    }
    await mkdir(join(root, 'alice', 'keys'));
    await writeFile(join(root, 'alice', 'keys', 'store'), 'fixture');
    await removeProfile('alice', root);
    await assert.rejects(inspectProfile('alice', root), {code: 'profileNotFound'});
    assert.deepEqual((await listProfiles(root)).map(item => item.name), ['bob']);
    assert.equal((await inspectProfile('bob', root)).record?.device, bob.data.device);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('a stale confirmation cannot remove a replacement with the same name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-confirmation-'));
  try {
    const original = await Profile.open('alice', origin, 'alice', root);
    await original.close();
    const {record} = await inspectProfile('alice', root);
    assert.ok(record);
    await removeProfile('alice', root, record);
    const replacement = await Profile.open('alice', origin, 'alice', root);
    await replacement.close();
    await assert.rejects(removeProfile('alice', root, record), {code: 'profileUnsafePath'});
    assert.equal((await inspectProfile('alice', root)).record?.device, replacement.data.device);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('concurrent open and removal cannot delete the profile held by the opener', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-race-'));
  try {
    const original = await Profile.open('alice', origin, 'alice', root);
    const originalDevice = original.data.device;
    await original.close();
    const [opened, removed] = await Promise.allSettled([
      Profile.open('alice', origin, 'alice', root),
      removeProfile('alice', root),
    ]);
    assert.equal(opened.status, 'fulfilled');
    const profile = opened.value;
    try {
      if (removed.status === 'rejected') {
        assert.equal(removed.reason.code, 'profileInUse');
        assert.equal(profile.data.device, originalDevice);
      } else {
        assert.notEqual(profile.data.device, originalDevice);
      }
      assert.equal((await inspectProfile('alice', root)).record?.device, profile.data.device);
    } finally {
      await profile.close();
    }
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('rejects traversal and preserves unexpected files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-files-'));
  try {
    const alice = await Profile.open('alice', origin, 'alice', root);
    await alice.close();
    await assert.rejects(removeProfile('../outside', root), {code: 'invalidProfileOrUsername'});
    await writeFile(join(root, 'alice', 'notes'), 'local notes');
    await assert.rejects(removeProfile('alice', root), {code: 'profileUnsafePath'});
    assert.equal(await readFile(join(root, 'alice', 'notes'), 'utf8'), 'local notes');
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('rejects linked roots, profile paths and key directories', async context => {
  const parent = await mkdtemp(join(tmpdir(), 'heartwood-profile-paths-'));
  const root = join(parent, 'profiles');
  const foreign = join(parent, 'outside');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    await mkdir(foreign);
    await writeFile(join(foreign, 'preserve'), 'fixture');
    const alice = await Profile.open('alice', origin, 'alice', root);
    await alice.close();
    try { await symlink(root, join(parent, 'linked-root'), linkType); }
    catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      context.skip('This environment does not allow creating directory links');
      return;
    }
    await symlink(foreign, join(root, 'linked-profile'), linkType);
    await assert.rejects(removeProfile('alice', join(parent, 'linked-root')), {code: 'profileUnsafePath'});
    await assert.rejects(removeProfile('linked-profile', root), {code: 'profileUnsafePath'});
    await symlink(foreign, join(root, 'alice', 'keys'), linkType);
    await assert.rejects(removeProfile('alice', root), {code: 'profileUnsafePath'});
    assert.equal(await readFile(join(foreign, 'preserve'), 'utf8'), 'fixture');
  } finally {
    await rm(parent, {recursive: true, force: true});
  }
});
