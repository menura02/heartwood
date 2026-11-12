import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { diagnose } from '../src/doctor.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('doctor works offline without creating profiles and masks invalid server input', async () => {
  const home = await mkdtemp(join(tmpdir(), 'heartwood-doctor-'));
  const env = {...process.env, HOME: home, USERPROFILE: home, HEARTWOOD_LANG: 'en'};
  try {
    const run = (...args: string[]) => promisify(execFile)(process.execPath, [cli, ...args], {env, timeout: 12_000});
    const offline = await run('doctor');
    assert.match(offline.stdout, /WARN.*Profile/);
    assert.match(offline.stdout, /WARN.*Matrix API/);
    assert.deepEqual(await readdir(home), []);
    await assert.rejects(run('--lang', 'tr', 'doctor', 'http://private-server.invalid'), error => {
      const result = error as {code: number; stdout: string};
      assert.equal(result.code, 1);
      assert.match(result.stdout, /BAŞARISIZ/);
      assert.doesNotMatch(result.stdout, /private-server/);
      return true;
    });
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});

test('doctor requires a Matrix versions response and sends no credentials', async context => {
  let versions: unknown = ['v1.11'];
  const fetch = context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'http://127.0.0.1:18008/_matrix/client/versions');
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    assert.equal(options.redirect, 'error');
    return Response.json({versions});
  });
  assert.equal((await diagnose('http://127.0.0.1:18008')).at(-1)?.detail, 'doctorMatrixOk');
  versions = ['v1.11', 42];
  assert.equal((await diagnose('http://127.0.0.1:18008')).at(-1)?.detail, 'doctorMatrixBad');
  assert.equal((await diagnose('http://example.invalid')).at(-1)?.detail, 'doctorMatrixOrigin');
  assert.equal(fetch.mock.callCount(), 2);
});
