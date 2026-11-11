import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
    await assert.rejects(Profile.open('alice', origin, 'alice', root), /kullanımda/);
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
    await assert.rejects(Profile.open('alice', origin, 'alice', root), /eski veya belirsiz/);
    await assert.rejects(mkdir(old), {code: 'EEXIST'});
  } finally { await rm(root, {recursive: true, force: true}); }
});
