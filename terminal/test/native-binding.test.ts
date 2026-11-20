import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { bindingVersion, checkBinding } from '../src/native-binding.ts';

test('the installed native crypto library matches its pinned digest', async () => {
  assert.deepEqual(await checkBinding(), {result: 'trusted', rejected: []});
});

test('native library check rejects altered, unknown, missing, and unpinned-version libraries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'heartwood-binding-'));
  try {
    const manifest = (version: string) =>
      writeFile(join(directory, 'package.json'), JSON.stringify({version}));
    await manifest(bindingVersion);
    assert.deepEqual(await checkBinding(directory), {result: 'missing', rejected: []});
    await writeFile(join(directory, 'matrix-sdk-crypto.linux-x64-gnu.node'), 'altered');
    await writeFile(join(directory, 'matrix-sdk-crypto.other.node'), 'unknown');
    const checked = await checkBinding(directory);
    assert.equal(checked.result, 'untrusted');
    assert.deepEqual(checked.rejected.sort(), ['matrix-sdk-crypto.linux-x64-gnu.node', 'matrix-sdk-crypto.other.node']);
    await manifest('9.9.9');
    assert.deepEqual(await checkBinding(directory), {result: 'version', rejected: []});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
