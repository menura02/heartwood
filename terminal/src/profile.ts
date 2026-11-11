import { HeartwoodError } from './failures.ts';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DeviceIdentity } from './policy.ts';
import { acquireProfileLock } from './profile-lock.ts';

interface Data {
  origin: string;
  username: string;
  device: string;
  identity?: DeviceIdentity;
  pins: Record<string, DeviceIdentity>;
  blocked: string[];
  sync?: { cursor: string; invites: Array<[string, string]> };
}

export class Profile {
  readonly path: string;
  readonly data: Data;
  private readonly release: () => Promise<void>;

  private constructor(path: string, data: Data, release: () => Promise<void>) {
    this.path = path;
    this.data = data;
    this.release = release;
  }

  static async open(name: string, origin: string, username: string, root = join(homedir(), '.heartwood')): Promise<Profile> {
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name) || !/^[a-z0-9._=-]{1,64}$/.test(username)) {
      throw new HeartwoodError('invalidProfileOrUsername');
    }
    const path = join(root, name);
    await mkdir(path, { recursive: true, mode: 0o700 });
    const release = await acquireProfileLock(path);
    try {
      let data: Data;
      try {
        data = JSON.parse(await readFile(join(path, 'profile.json'), 'utf8')) as Data;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        for (const name of ['keys', 'profile.next']) {
          const exists = await lstat(join(path, name)).then(() => true).catch((failure: NodeJS.ErrnoException) => {
            if (failure.code === 'ENOENT') return false;
            throw failure;
          });
          if (exists) throw new HeartwoodError('profileRecordMissing');
        }
        data = { origin, username, device: randomUUID(), pins: {}, blocked: [] };
      }
      if (data.origin !== origin || data.username !== username) {
        throw new HeartwoodError('profileBindingMismatch');
      }
      const profile = new Profile(path, data, release);
      await profile.save();
      return profile;
    } catch (error) {
      await release();
      throw error;
    }
  }

  async save(changes: Partial<Data> = {}): Promise<void> {
    const next = join(this.path, 'profile.next');
    await writeFile(next, JSON.stringify({ ...this.data, ...changes }), { mode: 0o600 });
    await rename(next, join(this.path, 'profile.json'));
    Object.assign(this.data, changes);
  }

  async close(): Promise<void> {
    await this.release();
  }
}
