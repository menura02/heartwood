import { HeartwoodError } from './failures.ts';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as wait } from 'node:timers/promises';

const marker = 'sqlite-owner';
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

export async function restoreProfileGuard(profile: string): Promise<void> {
  const guard = join(profile, 'in-use');
  if (!(await lstat(guard)).isDirectory() || relative(guard, await realpath(guard))) {
    throw new HeartwoodError('profileUnsafePath');
  }
  await writeFile(join(guard, marker), protocol, {flag: 'wx', mode: 0o600});
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
      await restoreProfileGuard(profile);
    } else {
      const known = await (async () => {
        if (!(await lstat(guard)).isDirectory() || !(await lstat(join(guard, marker))).isFile()) return false;
        if ((await readdir(guard)).length !== 1) return false;
        return await readFile(join(guard, marker), 'utf8') === protocol;
      })().catch(() => false);
      if (!known) throw new HeartwoodError('profileLockUncertain');
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
        await unlink(join(guard, marker));
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
