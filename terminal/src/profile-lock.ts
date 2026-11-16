import { HeartwoodError } from './failures.ts';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as wait } from 'node:timers/promises';

const marker = 'sqlite-owner';
const removalMarker = 'sqlite-removing';
const protocol = 'heartwood-profile-lock-v1\n';

async function openLockDatabase(path: string): Promise<DatabaseSync> {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const info = await lstat(path + suffix).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (info && (!info.isFile() || info.nlink !== 1)) throw new HeartwoodError('profileUnsafePath');
  }
  const database = new DatabaseSync(path);
  try {
    database.exec('BEGIN IMMEDIATE');
    return database;
  } catch (error) {
    database.close();
    if ((error as {errcode?: number}).errcode === 5) throw new HeartwoodError('profileInUse');
    throw new HeartwoodError('profileLockFailed');
  }
}

export async function withProfileGate<T>(root: string, action: () => Promise<T>): Promise<T> {
  const path = join(root, '.profile-operations.sqlite3');
  const deadline = Date.now() + 1000;
  let database: DatabaseSync;
  for (;;) {
    try {
      database = await openLockDatabase(path);
      break;
    } catch (error) {
      if (!(error instanceof HeartwoodError) || error.code !== 'profileInUse' || Date.now() >= deadline) throw error;
      await wait(25);
    }
  }
  try { return await action(); }
  finally { database.close(); }
}

async function guardMarker(guard: string): Promise<string | undefined> {
  if (!(await lstat(guard)).isDirectory() || relative(guard, await realpath(guard))) return;
  const entries = await readdir(guard);
  if (entries.length !== 1 || ![marker, removalMarker].includes(entries[0])) return;
  const path = join(guard, entries[0]);
  const info = await lstat(path);
  if (!info.isFile() || info.nlink !== 1 || info.size !== Buffer.byteLength(protocol) ||
      relative(path, await realpath(path)) || await readFile(path, 'utf8') !== protocol) return;
  return entries[0];
}

export async function acquireProfileLock(profile: string): Promise<(retire?: boolean) => Promise<void>> {
  const database = await openLockDatabase(join(profile, 'profile-lock.sqlite3'));
  const guard = join(profile, 'in-use');
  try {
    const created = await mkdir(guard).then(() => true).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') return false;
      throw error;
    });
    if (created) {
      if (relative(guard, await realpath(guard))) throw new HeartwoodError('profileUnsafePath');
      await writeFile(join(guard, marker), protocol, {flag: 'wx', mode: 0o600});
    } else {
      const known = await guardMarker(guard).catch(() => undefined);
      if (!known) throw new HeartwoodError('profileLockUncertain');
      // Both locks are held. If the profile is still at its original path, removal never committed.
      if (known === removalMarker) await rename(join(guard, removalMarker), join(guard, marker));
    }
  } catch (error) {
    database.close();
    throw error;
  }

  let released = false;
  return async (retire = false) => {
    if (released) return;
    released = true;
    const retired = join(profile, `in-use.released-${randomUUID()}`);
    try {
      if (retire) {
        // Leave a guard older clients cannot recover, before releasing SQLite for the Windows rename.
        await rename(join(guard, marker), join(guard, removalMarker));
        return;
      }
      // A legacy client may create a fresh guard after the rename. Never remove that guard.
      await rename(guard, retired);
      await unlink(join(retired, marker));
      await rmdir(retired);
    } finally {
      database.close();
    }
  };
}
