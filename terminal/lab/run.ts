import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const lab = dirname(fileURLToPath(import.meta.url));

async function checkPort(port: number): Promise<void> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen({host: '127.0.0.1', port, exclusive: true}, () => {
      probe.close(error => error ? reject(error) : resolve());
    });
  });
}

async function json<T>(origin: string, path: string, body?: object, token?: string): Promise<T> {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {...(body && {'Content-Type': 'application/json'}), ...(token && {Authorization: 'Bearer ' + token})},
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error(`Laboratuvar API isteği reddedildi (${response.status}).`);
  return await response.json() as T;
}

async function registrationToken(origin: string, secret: string): Promise<string> {
  const path = '/_synapse/admin/v1/register';
  const {nonce} = await json<{nonce: string}>(origin, path);
  const username = 'labadmin';
  const password = randomBytes(24).toString('hex');
  const mac = createHmac('sha1', secret).update([nonce, username, password, 'admin'].join('\0')).digest('hex');
  const admin = await json<{access_token: string}>(origin, path, {nonce, username, password, mac, admin: true});
  const {token} = await json<{token: string}>(origin, '/_synapse/admin/v1/registration_tokens/new', {
    uses_allowed: 3, expiry_time: Date.now() + 30 * 60_000,
  }, admin.access_token);
  if (typeof token !== 'string' || !token) throw new Error('Kayıt belirteci alınamadı.');
  return token;
}

export async function startLab(port: number, fast = false) {
  const python = process.env.HEARTWOOD_SYNAPSE_PYTHON;
  if (!python) throw new Error('HEARTWOOD_SYNAPSE_PYTHON ile Synapse 1.164.2 Python yolunu belirt.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Geçersiz laboratuvar portu.');
  await checkPort(port);
  const parent = join(lab, '..', '.lab');
  await mkdir(parent, {recursive: true, mode: 0o700});
  const directory = await mkdtemp(join(parent, 'synapse-run-'));
  const origin = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString('hex');
  let stop: (() => Promise<void>) | undefined;
  try {
    const template = await readFile(join(lab, 'homeserver.yaml'), 'utf8');
    const rates = fast ? '\nrc_message:\n  per_second: 100\n  burst_count: 200\n' : '';
    await writeFile(join(directory, 'homeserver.yaml'), template.replaceAll('18008', String(port)) + rates);
    await writeFile(join(directory, 'admin.yaml'), 'registration_shared_secret: ' + secret + '\n', {mode: 0o600});
    await copyFile(join(lab, 'log.yaml'), join(directory, 'log.yaml'));
    const args = [python, 'lab/supervise.py', '.lab/' + basename(directory)];
    const cwd = join(lab, '..');
    const child = process.platform === 'win32'
      ? spawn('wsl.exe', ['--distribution', process.env.HEARTWOOD_WSL_DISTRO || 'Ubuntu', '--exec', ...args],
        {cwd, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true})
      : spawn(python, args.slice(1), {cwd, stdio: ['pipe', 'ignore', 'ignore']});
    child.on('error', () => {});
    child.stdin.on('error', () => {});
    let finished = false;
    const exited = new Promise<number | null>(resolve => child.once('close', code => {
      finished = true;
      resolve(code);
    }));
    stop = async () => {
      child.stdin.end();
      await Promise.race([exited, wait(15_000, undefined, {ref: false})]);
      if (!finished) throw new Error('Laboratuvar sürecinin durduğu doğrulanamadı.');
      await rm(directory, {recursive: true, force: true, maxRetries: 8, retryDelay: 200});
    };
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (!finished && Date.now() < deadline) {
      ready = await json<{versions?: string[]}>(origin, '/_matrix/client/versions')
        .then(result => Array.isArray(result.versions)).catch(() => false);
      if (ready) break;
      await wait(250);
    }
    if (!ready || finished) throw new Error('Synapse hazır olmadı. Python yolunu ve 1.164.2 kurulumunu kontrol et.');
    return {origin, token: await registrationToken(origin, secret), logPath: join(directory, 'homeserver.log'),
      directory, exited, stop};
  } catch (error) {
    if (stop) await stop();
    else await rm(directory, {recursive: true, force: true});
    throw error;
  }
}

async function demo() {
  const lab = await startLab(Number(process.argv[2] ?? '18008'));
  let shutdown!: () => void;
  const signal = new Promise<void>(resolve => { shutdown = resolve; });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  try {
    console.log(`Synapse hazır ${lab.origin}`);
    console.log(`30 dakikalık kayıt belirteci ${lab.token}`);
    console.log('Laboratuvarı kapatmak için Ctrl+C.');
    const requestedStop = await Promise.race([signal.then(() => true), lab.exited.then(() => false)]);
    if (!requestedStop) throw new Error('Synapse laboratuvarı beklenmedik biçimde kapandı.');
  } finally {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
    await lab.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  demo().catch(error => {
    console.error(error instanceof Error ? error.message : 'Laboratuvar hatası.');
    process.exitCode = 1;
  });
}
