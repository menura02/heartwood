import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Profile } from '../src/profile.ts';

const origin = 'http://127.0.0.1:18008';

test('an OS lock prevents concurrent open and permits recovery after process death', {timeout: 15_000}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-recovery-'));
  const first = await Profile.open('alice', origin, 'alice', root);
  const device = first.data.device;
  await first.close();
  const sentinel = join(root, 'alice', 'keys', 'preserve');
  await mkdir(join(root, 'alice', 'keys'));
  await writeFile(sentinel, 'fixture');
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `
    import { Profile } from ${JSON.stringify(new URL('../src/profile.ts', import.meta.url).href)};
    await Profile.open('alice', ${JSON.stringify(origin)}, 'alice', process.argv[1]);
    console.log('ready');
    setInterval(() => {}, 1000);
  `, root], {stdio: ['ignore', 'pipe', 'inherit']});
  const exit = once(worker, 'exit');
  try {
    await Promise.race([
      once(worker.stdout, 'data').then(([chunk]) => assert.match(String(chunk), /ready/)),
      exit.then(() => { throw new Error('Profile fixture stopped before acquiring its lock'); }),
    ]);
    await assert.rejects(Profile.open('alice', origin, 'alice', root), {code: 'profileInUse'});
    worker.kill('SIGKILL');
    await exit;
    const recovered = await Profile.open('alice', origin, 'alice', root);
    try {
      assert.equal(recovered.data.device, device);
      assert.equal(await readFile(sentinel, 'utf8'), 'fixture');
    } finally { await recovered.close(); }
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL');
    await exit;
    await rm(root, {recursive: true, force: true});
  }
});

test('an unmarked legacy lock remains in place', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-legacy-'));
  try {
    const old = join(root, 'alice', 'in-use');
    await mkdir(old, {recursive: true});
    await assert.rejects(Profile.open('alice', origin, 'alice', root), {code: 'profileLockUncertain'});
    await assert.rejects(mkdir(old), {code: 'EEXIST'});
  } finally { await rm(root, {recursive: true, force: true}); }
});

test('migration can recover from replacement failure and termination just before replacement', {timeout: 15_000}, async context => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-migration-recovery-'));
  context.after(() => rm(root, {recursive: true, force: true}));
  const directory = join(root, 'alice');
  const path = join(directory, 'profile.json');
  const next = join(directory, 'profile.next');
  await mkdir(directory);
  const legacy = {origin, username: 'alice', device: '41111111-1111-4111-8111-111111111111', pins: {}, blocked: []};
  const body = JSON.stringify(legacy);
  await writeFile(path, body);
  const script = `
    import fs from 'node:fs/promises';
    import { basename } from 'node:path';
    import { syncBuiltinESMExports } from 'node:module';
    import { Profile } from ${JSON.stringify(new URL('../src/profile.ts', import.meta.url).href)};
    const rename = fs.rename;
    fs.rename = async (source, target) => {
      if (basename(target) !== 'profile.json') return rename(source, target);
      if (process.argv[2] === 'fail') throw Object.assign(new Error('Injected rename failure'), {code: 'EACCES'});
      process.send('staged');
      await new Promise(resolve => process.once('message', resolve));
      return rename(source, target);
    };
    syncBuiltinESMExports();
    try {
      const profile = await Profile.open('alice', ${JSON.stringify(origin)}, 'alice', process.argv[1]);
      await profile.close();
    } catch (error) {
      if (error.code !== 'EACCES') throw error;
      console.log(error.code);
      process.exitCode = 23;
    }
  `;
  const failed = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, 'fail'],
    {encoding: 'utf8', timeout: 10_000});
  assert.equal(failed.status, 23, failed.stderr);
  assert.match(failed.stdout, /EACCES/);
  assert.equal(await readFile(path, 'utf8'), body);
  await assert.rejects(readFile(next), {code: 'ENOENT'});

  const worker = spawn(process.execPath, ['--input-type=module', '-e', script, root, 'pause'],
    {stdio: ['ignore', 'ignore', 'inherit', 'ipc']});
  const exit = once(worker, 'exit');
  try {
    await Promise.race([
      once(worker, 'message').then(([message]) => assert.equal(message, 'staged')),
      exit.then(() => { throw new Error('Migration fixture stopped before the replacement barrier'); }),
    ]);
    assert.equal(await readFile(path, 'utf8'), body);
    assert.deepEqual(JSON.parse(await readFile(next, 'utf8')), {...legacy, schemaVersion: 1});
    worker.kill('SIGKILL');
    await exit;
  } finally {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill('SIGKILL');
    await exit;
  }
  const recovered = await Profile.open('alice', origin, 'alice', root);
  try { assert.deepEqual(recovered.data, {...legacy, schemaVersion: 1}); }
  finally { await recovered.close(); }
  await assert.rejects(readFile(next), {code: 'ENOENT'});
});
