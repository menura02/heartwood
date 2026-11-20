import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatError, HeartwoodError } from './failures.ts';
import { selectLanguage } from './locale.ts';

// The binding's postinstall script downloads its native library from GitHub Releases without an
// integrity check, so the npm lockfile does not cover the code that holds every key. These SHA-256
// digests are the ones GitHub reports for the v0.6.6 release assets. Update them with the version.
export const bindingVersion = '0.6.6';
export const bindingDigests: Readonly<Record<string, string>> = {
  'matrix-sdk-crypto.darwin-arm64.node': '99dc7d90aa830d9b6d96bcda23589ce0fb72d10f84ec447c9d241937fee86d9f',
  'matrix-sdk-crypto.darwin-x64.node': '4a22a351e988b9ed1e90620b3474e576325ce5287f623351b6b2e9cfaf078c2c',
  'matrix-sdk-crypto.linux-arm-gnueabihf.node': '9d5e19a647ea4dcf41fa021b3c2cbc80cb32b3f3e72822c97dd130c9d4891fa8',
  'matrix-sdk-crypto.linux-arm64-gnu.node': 'c43c347f39786ee9f2d11b5ae3088d182c1a81636f2b68dc2297fe6716be2891',
  'matrix-sdk-crypto.linux-arm64-musl.node': '164bba83711e56373bd454d0d198f151e8928c5be2772c5696289da5cca9afac',
  'matrix-sdk-crypto.linux-ia32-gnu.node': 'b2b86a72a1f4767c2bc22647a7a855767e2c4a8f247b68cfe4a46c025780c251',
  'matrix-sdk-crypto.linux-riscv64-gnu.node': '0ba60210eeb25e250ab3cbe72c34c38c830417b6e7ece08c1ff81d066ecd3a0d',
  'matrix-sdk-crypto.linux-s390x-gnu.node': '860d1418249cd883156a6746e0b4560f044cbb57964530efa9dd8459cd659f9e',
  'matrix-sdk-crypto.linux-x64-gnu.node': 'aeb21029ac6bb29cd06493f67b19a5a75b3d0371a1ab452fe59f78249350f0f7',
  'matrix-sdk-crypto.linux-x64-musl.node': 'e357c2b58801e48974cdabd0fb76ef2cc7972c845c41bb50191a0d6ea0363bca',
  'matrix-sdk-crypto.win32-arm64-msvc.node': '22c33c5462f71e5342df499666d4c637a59d673b8d81abb736ac5e65cd38b92d',
  'matrix-sdk-crypto.win32-ia32-msvc.node': '1c084f0ebd5148721a4c8c3bfd59ff44a0b20252fef948a2ebe91bfb94569880',
  'matrix-sdk-crypto.win32-x64-msvc.node': '9c61629d14b9de5c2cfa03f2dd4be26cde2b578a0a4aec2bebba624305b48e47',
};

export type BindingCheck = 'trusted' | 'missing' | 'version' | 'untrusted';

export function bindingDirectory(): string {
  return dirname(fileURLToPath(import.meta.resolve('@matrix-org/matrix-sdk-crypto-nodejs')));
}

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

// Returns the libraries that do not match a pinned digest, so the caller can remove them.
export async function checkBinding(directory = bindingDirectory()): Promise<{result: BindingCheck; rejected: string[]}> {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {version?: unknown};
  if (manifest.version !== bindingVersion) return {result: 'version', rejected: []};
  const libraries = (await readdir(directory, {withFileTypes: true})).filter(entry => entry.name.endsWith('.node'));
  if (!libraries.length) return {result: 'missing', rejected: []};
  const rejected: string[] = [];
  for (const entry of libraries) {
    const expected = Object.hasOwn(bindingDigests, entry.name) ? bindingDigests[entry.name] : undefined;
    // A link could point the loader at a file other than the one hashed here.
    if (!expected || !entry.isFile() || await digest(join(directory, entry.name)) !== expected) rejected.push(entry.name);
  }
  return {result: rejected.length ? 'untrusted' : 'trusted', rejected};
}

const failures = {
  missing: 'nativeBindingMissing', version: 'nativeBindingVersion', untrusted: 'nativeBindingUntrusted',
} as const;

// Runs as the package postinstall step, after the binding downloaded its library and before
// anything loads it. An unverified library is removed so a failed install cannot load it later.
if (import.meta.main) {
  let language: 'en' | 'tr' = 'en';
  try { language = selectLanguage([], process.env.HEARTWOOD_LANG).language; } catch { /* keep English */ }
  const directory = bindingDirectory();
  const {result, rejected} = await checkBinding(directory);
  for (const name of rejected) await unlink(join(directory, name));
  if (result !== 'trusted') {
    console.error(formatError(new HeartwoodError(failures[result]), language));
    process.exitCode = 1;
  }
}
