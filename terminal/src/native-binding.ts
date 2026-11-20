import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatError, HeartwoodError } from './failures.ts';
import { selectLanguage } from './locale.ts';

// The binding's postinstall script downloads its native library from GitHub Releases without an
// integrity check, so the npm lockfile does not cover the code that holds every key. These SHA-256
// digests are the ones GitHub reports for the release assets of bindingVersion. Update both together.
export const bindingVersion = '0.7.0';
export const bindingDigests: Readonly<Record<string, string>> = {
  'matrix-sdk-crypto.darwin-arm64.node': '84a805e11ab5cf65fdac62ae0841b6f898e5637dd25ec922d0be349ba570cee4',
  'matrix-sdk-crypto.darwin-x64.node': '30053cc1f3fd22a4b4d3c63fc8dd1949bd2d61c5ff94dde0786fa2b55848902e',
  'matrix-sdk-crypto.linux-arm-gnueabihf.node': 'db88d413bfe578bba0b387e897b930123f86c281c072b4a8c669034ed10b34e5',
  'matrix-sdk-crypto.linux-arm64-gnu.node': '31c181376af0298bbd91e64ede09685f6830971f41c6158404006c6907d2ddc1',
  'matrix-sdk-crypto.linux-arm64-musl.node': 'c5d3e864965960b0f4f90c148df3a8faf6192b1b2e7fe46ccea625d9cbad7024',
  'matrix-sdk-crypto.linux-ia32-gnu.node': 'f0b3ab7fa265b3ffae24efaeb8ba6c32e180a79ad346c60fdc7aacb1dafe1134',
  'matrix-sdk-crypto.linux-riscv64-gnu.node': 'f06ffdaa2f804164282a957a3fb52a3c25047c1537d6900721a781ac6ca94c98',
  'matrix-sdk-crypto.linux-s390x-gnu.node': '2a2788942d10e93a6ec277b4027f208e2f985432cd3a2f1516638b56cccdd98f',
  'matrix-sdk-crypto.linux-x64-gnu.node': '5a880046c21d6e6997acda6b999e1bc07b0400ceb90be06554fefff6dfe45249',
  'matrix-sdk-crypto.linux-x64-musl.node': '12bb9afe19ae9d5e48f2a3cd0936959c76f44f59e4d422412392ea92cb7d92f6',
  'matrix-sdk-crypto.win32-arm64-msvc.node': 'c67f9cf7406190bc99c21d362d0622379a45d264362e74c32c1e052f0df6b744',
  'matrix-sdk-crypto.win32-ia32-msvc.node': 'c4523affaea3247889d453c465f27af5efd37ce5701eafce10b0b4ac774c338e',
  'matrix-sdk-crypto.win32-x64-msvc.node': 'be21569750867d581982efe38b6bc8a31f01ba2667e89c70775d75fa02d36490',
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
