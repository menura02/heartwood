import { randomBytes } from 'node:crypto';

const origin = 'http://127.0.0.1:18008';
const adminToken = process.env.HEARTWOOD_LAB_ADMIN_TOKEN;
if (!adminToken) throw new Error('HEARTWOOD_LAB_ADMIN_TOKEN gerekli.');

const response = await fetch(origin + '/_synapse/admin/v1/registration_tokens/new', {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
  headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: randomBytes(24).toString('hex'), uses_allowed: 3,
    expiry_time: Date.now() + 30 * 60_000 }),
});
if (!response.ok) throw new Error(`Kayıt belirteci oluşturulamadı (${response.status}).`);
const {token} = await response.json() as {token: string};
console.log(token);
