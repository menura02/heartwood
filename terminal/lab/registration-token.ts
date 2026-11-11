import { randomBytes } from 'node:crypto';
import { formatError, HeartwoodError, MatrixTransportFailure } from '../src/failures.ts';
import { selectLanguage } from '../src/locale.ts';
import type { Language } from '../src/locale.ts';

async function createToken(): Promise<string> {
  const origin = 'http://127.0.0.1:18008';
  const adminToken = process.env.HEARTWOOD_LAB_ADMIN_TOKEN;
  if (!adminToken) throw new HeartwoodError('labAdminTokenMissing');

  const response = await fetch(origin + '/_synapse/admin/v1/registration_tokens/new', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: randomBytes(24).toString('hex'), uses_allowed: 3,
      expiry_time: Date.now() + 30 * 60_000 }),
  }).catch(() => { throw new MatrixTransportFailure(); });
  if (!response.ok) throw new HeartwoodError('labTokenCreateFailed');
  const value = await response.json().catch(() => { throw new HeartwoodError('labTokenCreateFailed'); }) as {token?: unknown} | null;
  if (typeof value?.token !== 'string' || !value.token) throw new HeartwoodError('labTokenMissing');
  return value.token;
}

let language: Language = 'en';
try {
  language = selectLanguage(process.argv.slice(2), process.env.HEARTWOOD_LANG).language;
  console.log(await createToken());
} catch (error) {
  console.error(formatError(error, language));
  process.exitCode = 1;
}
