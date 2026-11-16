import { HeartwoodError } from './failures.ts';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { matrixOrigin } from './policy.ts';
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
  return existingOwnedDirectory(join(root, name));
}

async function existingOwnedDirectory(path: string): Promise<string | undefined> {
  const info = await statIfPresent(path);
  if (!info) return undefined;
  if (!info.isDirectory()) throw new HeartwoodError('profileUnsafePath');
  const resolved = await realpath(path);
  if (relative(path, resolved)) throw new HeartwoodError('profileUnsafePath');
  return resolved;
}

const cryptoDatabase = 'matrix-sdk-crypto.sqlite3';
const schemaVersion = 1;
const maxRecordBytes = 1024 * 1024;
const profileUsername = /^[a-z0-9._=-]{1,64}$/;
const deviceUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const matrixUser = /^@[^:\s\p{Cc}\p{Cf}]+:[^\s\p{Cc}\p{Cf}]+$/u;
const matrixRoom = /^![^\s\p{Cc}\p{Cf}]+$/u;

interface Data {
  schemaVersion: typeof schemaVersion;
  origin: string;
  username: string;
  device: string;
  identity?: DeviceIdentity;
  pins: Record<string, DeviceIdentity>;
  blocked: string[];
  sync?: { cursor: string; invites: Array<[string, string]> };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validIdentity(value: unknown): value is DeviceIdentity {
  return object(value) && typeof value.user === 'string' && matrixUser.test(value.user) &&
    nonempty(value.device) && nonempty(value.ed) && nonempty(value.curve);
}

function validSync(value: unknown): boolean {
  return object(value) && nonempty(value.cursor) && Array.isArray(value.invites) &&
    value.invites.every((invite: unknown) => Array.isArray(invite) && invite.length === 2 &&
      typeof invite[0] === 'string' && matrixRoom.test(invite[0]) &&
      typeof invite[1] === 'string' && matrixUser.test(invite[1]));
}

function canonicalOrigin(value: unknown): boolean {
  try { return typeof value === 'string' && matrixOrigin(value) === value; }
  catch { return false; }
}

function validProfileFields(value: Record<string, unknown>): value is Omit<Data, 'schemaVersion'> & Record<string, unknown> {
  return canonicalOrigin(value.origin) && typeof value.username === 'string' && profileUsername.test(value.username) &&
    typeof value.device === 'string' && deviceUuid.test(value.device) && object(value.pins) &&
    Object.entries(value.pins).every(([user, pin]) => validIdentity(pin) && pin.user === user) &&
    Array.isArray(value.blocked) && value.blocked.every((user: unknown) => typeof user === 'string' && matrixUser.test(user)) &&
    (!Object.hasOwn(value, 'identity') || (validIdentity(value.identity) && value.identity.device === value.device)) &&
    (!Object.hasOwn(value, 'sync') || validSync(value.sync));
}

function decodeProfile(value: unknown): {data: Data; legacy: boolean} {
  if (!object(value)) throw new HeartwoodError('profileRecordInvalid');
  const legacy = !Object.hasOwn(value, 'schemaVersion');
  if (!legacy && value.schemaVersion !== schemaVersion) {
    if (typeof value.schemaVersion === 'number' && Number.isSafeInteger(value.schemaVersion) &&
        value.schemaVersion > schemaVersion) throw new HeartwoodError('profileSchemaUnsupported');
    throw new HeartwoodError('profileRecordInvalid');
  }
  if (!validProfileFields(value)) throw new HeartwoodError('profileRecordInvalid');
  // The unversioned 0.6 shape already contains all v1 fields apart from the version.
  return {data: {...value, schemaVersion}, legacy};
}

function statIfPresent(path: string) {
  return lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export async function readProfileData(directory: string): Promise<{data: Data; legacy: boolean} | undefined> {
  const path = join(directory, 'profile.json');
  const before = await statIfPresent(path);
  if (!before) return undefined;
  if (!before.isFile() || before.nlink !== 1) throw new HeartwoodError('profileUnsafePath');
  if (before.size > maxRecordBytes) throw new HeartwoodError('profileRecordInvalid');
  const file = await open(path, 'r');
  try {
    const current = await file.stat();
    if (before.dev !== current.dev || before.ino !== current.ino || !current.isFile() || current.nlink !== 1) {
      throw new HeartwoodError('profileUnsafePath');
    }
    if (current.size > maxRecordBytes) throw new HeartwoodError('profileRecordInvalid');
    const buffer = Buffer.alloc(Math.min(current.size + 1, maxRecordBytes + 1));
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await file.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== current.size) throw new HeartwoodError('profileRecordInvalid');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, length))); }
    catch { throw new HeartwoodError('profileRecordInvalid'); }
    return decodeProfile(parsed);
  } finally { await file.close(); }
}

type DataChanges = Partial<Pick<Data, 'identity' | 'pins' | 'blocked' | 'sync'>>;

export class Profile {
  readonly path: string;
  readonly data: Data;
  private readonly release: () => Promise<void>;
  private pendingWrite = Promise.resolve();
  private closing?: Promise<void>;

  private constructor(path: string, data: Data, release: () => Promise<void>) {
    this.path = path;
    this.data = data;
    this.release = release;
  }

  static async open(name: string, origin: string, username: string, root = defaultProfileRoot()): Promise<Profile> {
    if (!validProfileName(name) || !profileUsername.test(username)) {
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
      const record = await readProfileData(path);
      if (!record) {
        for (const name of ['keys', 'profile.next']) {
          if (await statIfPresent(join(path, name))) throw new HeartwoodError('profileRecordMissing');
        }
      }
      const data: Data = record?.data ?? {schemaVersion, origin, username, device: randomUUID(), pins: {}, blocked: []};
      if (data.origin !== origin || data.username !== username) {
        throw new HeartwoodError('profileBindingMismatch');
      }
      const profile = new Profile(path, data, release);
      if (!record || record.legacy) await profile.save();
      return profile;
    } catch (error) {
      await release();
      throw error;
    }
  }

  async cryptoStorePath(): Promise<string> {
    if (this.closing || !await existingOwnedDirectory(this.path)) throw new HeartwoodError('profileUnsafePath');
    const path = join(this.path, 'keys');
    const directory = await existingOwnedDirectory(path);
    let databaseExists = false;
    if (directory) {
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const file = join(directory, cryptoDatabase + suffix);
        const info = await statIfPresent(file);
        if (!info) continue;
        if (!info.isFile() || info.nlink !== 1 || relative(file, await realpath(file))) {
          throw new HeartwoodError('profileUnsafePath');
        }
        if (!suffix) databaseExists = true;
      }
    }
    if (!databaseExists && this.data.identity) throw new HeartwoodError('cryptoStoreMissing');
    return path;
  }

  save(changes: DataChanges = {}): Promise<void> {
    if (this.closing) return Promise.reject(new Error('The profile is closed'));
    const write = this.pendingWrite.then(() => this.write(changes));
    this.pendingWrite = write.catch(() => {});
    return write;
  }

  private async write(changes: DataChanges): Promise<void> {
    const updated = {...this.data, ...changes};
    if (!validProfileFields(updated)) throw new HeartwoodError('profileRecordInvalid');
    const body = JSON.stringify(updated);
    if (Buffer.byteLength(body) > maxRecordBytes) throw new HeartwoodError('profileRecordInvalid');
    const next = join(this.path, 'profile.next');
    const abandoned = await statIfPresent(next);
    if (abandoned) {
      if (!abandoned.isFile() || abandoned.nlink !== 1) throw new HeartwoodError('profileUnsafePath');
      // A validated profile.json stays authoritative until a staged write is renamed.
      await unlink(next);
    }
    const file = await open(next, 'wx', 0o600);
    try {
      try {
        await file.writeFile(body);
        await file.sync();
      } finally { await file.close(); }
      await rename(next, join(this.path, 'profile.json'));
    } catch (error) {
      await unlink(next).catch(() => {});
      throw error;
    }
    Object.assign(this.data, changes);
  }

  close(): Promise<void> {
    return this.closing ??= this.pendingWrite.then(() => this.release());
  }
}
