import { HeartwoodError } from './failures.ts';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const marker = 'sqlite-owner';
const protocol = 'heartwood-profile-lock-v1\n';

export async function acquireProfileLock(profile: string): Promise<() => Promise<void>> {
  const database = new DatabaseSync(join(profile, 'profile-lock.sqlite3'));
  const guard = join(profile, 'in-use');
  try {
    try {
      database.exec('BEGIN IMMEDIATE');
    } catch (error) {
      if ((error as {errcode?: number}).errcode === 5) throw new HeartwoodError('profileInUse');
      throw new HeartwoodError('profileLockFailed');
    }
    const created = await mkdir(guard).then(() => true).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') return false;
      throw error;
    });
    if (created) {
      await writeFile(join(guard, marker), protocol, {flag: 'wx', mode: 0o600});
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
  return async () => {
    if (released) return;
    released = true;
    const retired = join(profile, `in-use.released-${randomUUID()}`);
    try {
      // A legacy client may create a fresh guard after the rename. Never remove that guard.
      await rename(guard, retired);
      await unlink(join(retired, marker));
      await rmdir(retired);
    } finally {
      database.close();
    }
  };
}
