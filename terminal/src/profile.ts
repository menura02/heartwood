import { HeartwoodError } from './failures.ts';
import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DeviceIdentity } from './policy.ts';
import { acquireProfileLock, withProfileGate } from './profile-lock.ts';

export const defaultProfileRoot = (): string => join(homedir(), '.heartwood');

export function validProfileName(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(name) &&
    !(process.platform === 'win32' && /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(name));
}

export async function existingProfileRoot(root: string): Promise<string | undefined> {
  const info = await lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!info) return undefined;
  if (!info.isDirectory()) throw new HeartwoodError('profileUnsafePath');
  return realpath(root);
}

export async function existingProfileDirectory(root: string, name: string): Promise<string | undefined> {
  if (!validProfileName(name)) throw new HeartwoodError('invalidProfileOrUsername');
  const path = join(root, name);
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!info) return undefined;
  if (!info.isDirectory()) throw new HeartwoodError('profileUnsafePath');
  const resolved = await realpath(path);
  if (relative(root, dirname(resolved)) || relative(path, resolved)) throw new HeartwoodError('profileUnsafePath');
  return resolved;
}

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

  static async open(name: string, origin: string, username: string, root = defaultProfileRoot()): Promise<Profile> {
    if (!validProfileName(name) || !/^[a-z0-9._=-]{1,64}$/.test(username)) {
      throw new HeartwoodError('invalidProfileOrUsername');
    }
    await mkdir(root, {recursive: true, mode: 0o700});
    const canonical = await existingProfileRoot(root);
    if (!canonical) throw new HeartwoodError('profileUnsafePath');
    const {path, release} = await withProfileGate(canonical, async () => {
      const created = join(canonical, name);
      await mkdir(created, {mode: 0o700}).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const path = await existingProfileDirectory(canonical, name);
      if (!path) throw new HeartwoodError('profileUnsafePath');
      return {path, release: await acquireProfileLock(path)};
    });
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
