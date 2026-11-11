import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Profile } from '../src/profile.ts';

test('a profile is locked, bound to its account and reopened with the same device', async () => {
  const root = await mkdtemp(join(tmpdir(), 'heartwood-profile-'));
  const origin = 'http://127.0.0.1:18008';
  try {
    const profile = await Profile.open('alice', origin, 'alice', root);
    const device = profile.data.device;
    await assert.rejects(Profile.open('alice', origin, 'alice', root), /kullanımda/);
    await profile.close();
    await assert.rejects(Profile.open('alice', origin, 'bob', root), /farklı/);
    const reopened = await Profile.open('alice', origin, 'alice', root);
    assert.equal(reopened.data.device, device);
    const saved = JSON.parse(await readFile(join(reopened.path, 'profile.json'), 'utf8')) as object;
    assert.deepEqual(Object.keys(saved).sort(), ['blocked', 'device', 'origin', 'pins', 'username']);
    const temporary = join(reopened.path, 'profile.next');
    await mkdir(temporary);
    const blocked = ['@bob:localhost'];
    await assert.rejects(reopened.save({blocked}));
    assert.deepEqual(reopened.data.blocked, []);
    await rmdir(temporary);
    await reopened.save({blocked});
    assert.deepEqual(reopened.data.blocked, blocked);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
