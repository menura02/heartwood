import { mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DeviceIdentity } from './policy.ts';

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

  private constructor(path: string, data: Data) {
    this.path = path;
    this.data = data;
  }

  static async open(name: string, origin: string, username: string, root = join(homedir(), '.heartwood')): Promise<Profile> {
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name) || !/^[a-z0-9._=-]{1,64}$/.test(username)) {
      throw new Error('Profil veya kullanıcı adı geçersiz.');
    }
    const path = join(root, name);
    await mkdir(path, { recursive: true, mode: 0o700 });
    const lock = join(path, 'in-use');
    await mkdir(lock).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new Error('Profil kullanımda veya önceki oturum düzgün kapanmadı.');
      throw error;
    });
    try {
      let data: Data;
      try {
        data = JSON.parse(await readFile(join(path, 'profile.json'), 'utf8')) as Data;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        data = { origin, username, device: randomUUID(), pins: {}, blocked: [] };
      }
      if (data.origin !== origin || data.username !== username) {
        throw new Error('Bu profil farklı bir sunucuya veya kullanıcıya bağlı.');
      }
      const profile = new Profile(path, data);
      await profile.save();
      return profile;
    } catch (error) {
      await rmdir(lock);
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
    await rmdir(join(this.path, 'in-use'));
  }
}
