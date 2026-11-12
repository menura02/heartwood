import { lstat, mkdtemp, open, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { HeartwoodError } from './failures.ts';
import { matrixOrigin } from './policy.ts';
import { acquireProfileLock, restoreProfileGuard, withProfileGate } from './profile-lock.ts';
import { defaultProfileRoot, existingProfileDirectory, existingProfileRoot, validProfileName } from './profile.ts';

export interface ProfileRecord {
  origin: string;
  username: string;
  device: string;
}

interface ProfileEntry {
  name: string;
  record?: ProfileRecord;
}

async function readRecord(directory: string): Promise<ProfileRecord | undefined> {
  try {
    const path = join(directory, 'profile.json');
    const before = await lstat(path);
    const limit = 1024 * 1024;
    if (!before.isFile() || before.nlink !== 1 || before.size > limit) return;
    const file = await open(path, 'r');
    try {
      const current = await file.stat();
      if (before.dev !== current.dev || before.ino !== current.ino || !current.isFile() || current.nlink !== 1) return;
      const {buffer, bytesRead} = await file.read(Buffer.alloc(limit + 1));
      if (bytesRead > limit) return;
      const {origin, username, device, pins, blocked} = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as
        Partial<ProfileRecord> & {pins?: unknown; blocked?: unknown};
      if (typeof origin !== 'string' || matrixOrigin(origin) !== origin ||
          typeof username !== 'string' || !/^[a-z0-9._=-]{1,64}$/.test(username) ||
          typeof device !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(device) ||
          !pins || typeof pins !== 'object' || Array.isArray(pins) || !Array.isArray(blocked)) return;
      return {origin, username, device};
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}

async function profileEntry(name: string, directory: string): Promise<ProfileEntry> {
  const record = await readRecord(directory);
  return record ? {name, record} : {name};
}

export async function listProfiles(root = defaultProfileRoot()): Promise<ProfileEntry[]> {
  const canonical = await existingProfileRoot(root);
  if (!canonical) return [];
  const profiles: ProfileEntry[] = [];
  for (const entry of await readdir(canonical, {withFileTypes: true})) {
    if (!entry.isDirectory() || !validProfileName(entry.name)) continue;
    const directory = await existingProfileDirectory(canonical, entry.name).catch(() => undefined);
    if (directory) profiles.push(await profileEntry(entry.name, directory));
  }
  return profiles.sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

export async function inspectProfile(name: string, root = defaultProfileRoot()): Promise<ProfileEntry> {
  if (!validProfileName(name)) throw new HeartwoodError('invalidProfileOrUsername');
  const canonical = await existingProfileRoot(root);
  const directory = canonical && await existingProfileDirectory(canonical, name);
  if (!directory) throw new HeartwoodError('profileNotFound');
  return profileEntry(name, directory);
}

const regularProfileFiles = new Set([
  'profile.json', 'profile.next', 'profile-lock.sqlite3', 'profile-lock.sqlite3-journal',
  'profile-lock.sqlite3-wal', 'profile-lock.sqlite3-shm',
]);

async function checkContents(directory: string): Promise<void> {
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop()!;
    for (const name of await readdir(current)) {
      const path = join(current, name);
      const info = await lstat(path);
      const root = current === directory;
      if (info.isDirectory()) {
        if (root && name !== 'keys' && name !== 'in-use' &&
            !/^in-use\.released-[0-9a-f-]{36}$/i.test(name)) throw new HeartwoodError('profileUnsafePath');
        pending.push(path);
      } else if (!info.isFile() || info.nlink !== 1 || (root && !regularProfileFiles.has(name))) {
        throw new HeartwoodError('profileUnsafePath');
      }
    }
  }
}

export async function removeProfile(name: string, root = defaultProfileRoot(), expected?: ProfileRecord): Promise<void> {
  if (!validProfileName(name)) throw new HeartwoodError('invalidProfileOrUsername');
  const canonical = await existingProfileRoot(root);
  if (!canonical) throw new HeartwoodError('profileNotFound');
  const quarantine = await withProfileGate(canonical, async () => {
    const directory = await existingProfileDirectory(canonical, name);
    if (!directory) throw new HeartwoodError('profileNotFound');
    if (!await readRecord(directory)) throw new HeartwoodError('profileUnsafePath');
    const release = await acquireProfileLock(directory);
    try {
      const record = await readRecord(directory);
      if (!record || (expected && (record.device !== expected.device || record.origin !== expected.origin ||
          record.username !== expected.username))) throw new HeartwoodError('profileUnsafePath');
      await checkContents(directory);
      const container = await mkdtemp(join(canonical, '.removed-'));
      try {
        await release(true);
        await rename(directory, join(container, 'profile')).catch(async error => {
          if (await existingProfileDirectory(canonical, name) === directory) await restoreProfileGuard(directory);
          throw error;
        });
      } catch (error) {
        await rmdir(container);
        throw error;
      }
      return container;
    } finally {
      await release();
    }
  });
  const resolved = await realpath(quarantine);
  if (relative(quarantine, resolved) || relative(canonical, dirname(resolved))) {
    throw new HeartwoodError('profileUnsafePath');
  }
  await rm(resolved, {recursive: true, force: false, maxRetries: 3, retryDelay: 50});
}
