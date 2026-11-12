import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { matrixOrigin } from './policy.ts';

type Result = {
  check: 'doctorNode' | 'doctorCrypto' | 'doctorProfile' | 'doctorMatrix';
  level: 'doctorPass' | 'doctorWarn' | 'doctorFail';
  detail: 'doctorNodeOk' | 'doctorNodeBad' | 'doctorCryptoOk' | 'doctorCryptoBad'
    | 'doctorProfileOk' | 'doctorProfileMissing' | 'doctorProfileBad'
    | 'doctorMatrixSkipped' | 'doctorMatrixOrigin' | 'doctorMatrixOk' | 'doctorMatrixBad';
};

const timeout = 3000;

async function checkProfile(): Promise<Result> {
  const check = 'doctorProfile';
  const home = homedir();
  const root = join(home, '.heartwood');
  let deadline: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      (async (): Promise<Result> => {
        const directory = await stat(root).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
        if (!(directory ?? await stat(home)).isDirectory()) throw new Error('Profile location is not a directory');
        await access(directory ? root : home, constants.R_OK | constants.W_OK | constants.X_OK);
        return directory
          ? {check, level: 'doctorPass', detail: 'doctorProfileOk'}
          : {check, level: 'doctorWarn', detail: 'doctorProfileMissing'};
      })(),
      new Promise<never>((_, reject) => { deadline = setTimeout(reject, timeout); }),
    ]);
  } catch {
    return {check, level: 'doctorFail', detail: 'doctorProfileBad'};
  } finally {
    clearTimeout(deadline);
  }
}

async function checkCrypto(): Promise<Result> {
  const check = 'doctorCrypto';
  try {
    await promisify(execFile)(process.execPath, [
      '--input-type=module', '--eval', "await import('@matrix-org/matrix-sdk-crypto-nodejs')",
    ], {cwd: new URL('../', import.meta.url), timeout, windowsHide: true});
    return {check, level: 'doctorPass', detail: 'doctorCryptoOk'};
  } catch {
    return {check, level: 'doctorFail', detail: 'doctorCryptoBad'};
  }
}

async function checkMatrix(server?: string): Promise<Result> {
  const check = 'doctorMatrix';
  if (server === undefined) return {check, level: 'doctorWarn', detail: 'doctorMatrixSkipped'};
  let origin: string;
  try { origin = matrixOrigin(server); }
  catch { return {check, level: 'doctorFail', detail: 'doctorMatrixOrigin'}; }
  const controller = new AbortController();
  try {
    const response = await fetch(`${origin}/_matrix/client/versions`, {
      headers: {Accept: 'application/json'}, redirect: 'error',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
    });
    if (!response.ok || !response.body) throw new Error('Versions unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) throw new Error('Versions response too large');
      chunks.push(value);
    }
    const {versions} = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {versions?: unknown};
    if (!Array.isArray(versions) || !versions.length || !versions.every(value => typeof value === 'string')) {
      throw new Error('Invalid versions response');
    }
    return {check, level: 'doctorPass', detail: 'doctorMatrixOk'};
  } catch {
    return {check, level: 'doctorFail', detail: 'doctorMatrixBad'};
  } finally {
    controller.abort();
  }
}

export async function diagnose(server?: string): Promise<Result[]> {
  const supported = process.versions.node.split('.')[0] === '24';
  const node: Result = supported
    ? {check: 'doctorNode', level: 'doctorPass', detail: 'doctorNodeOk'}
    : {check: 'doctorNode', level: 'doctorFail', detail: 'doctorNodeBad'};
  return [node, ...await Promise.all([checkCrypto(), checkProfile(), checkMatrix(server)])];
}
