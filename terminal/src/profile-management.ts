import { lstat, mkdtemp, readdir, realpath, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { HeartwoodError } from './failures.ts';
import { acquireProfileLock, restoreProfileGuard, withProfileGate } from './profile-lock.ts';
import { defaultProfileRoot, existingProfileDirectory, existingProfileRoot, readProfileData, validProfileName } from './profile.ts';

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
  const record = await readProfileData(directory).catch(() => undefined);
  if (!record) return undefined;
  const {origin, username, device} = record.data;
  return {origin, username, device};
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
