import { matrixOrigin } from './policy.ts';

export const part = encodeURIComponent;

export class MatrixFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Matrix isteği başarısız (${status}, ${code}).`);
    this.status = status;
    this.code = code;
  }
}

export class MatrixHttp {
  readonly origin: string;
  token?: string;

  constructor(origin: string) { this.origin = matrixOrigin(origin); }

  async json<T>(method: string, path: string, body?: unknown): Promise<{status: number; value: T}> {
    const headers = new Headers({ Accept: 'application/json' });
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await fetch(`${this.origin}/_matrix/client/v3/${path}`, {
        method, headers, redirect: 'error', signal: AbortSignal.timeout(15_000),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Sunucu bağlantısı kurulamadı veya istek zaman aşımına uğradı.');
    }
    const value = await response.json().catch(() => {
      throw new Error('Sunucu geçerli bir JSON yanıtı döndürmedi.');
    }) as T;
    return {status: response.status, value};
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const {status, value} = await this.json<T & {errcode?: unknown}>(method, path, body);
    if (status < 200 || status >= 300) {
      const code = typeof value?.errcode === 'string' && /^M_[A-Z_]+$/.test(value.errcode) ? value.errcode : 'UNKNOWN';
      throw new MatrixFailure(status, code);
    }
    return value;
  }
}

export interface Login { access_token: string; user_id: string; device_id: string }

export async function register(http: MatrixHttp, username: string, password: string, token: string): Promise<void> {
  const registration = { username, password, inhibit_login: true };
  interface Challenge { session?: string; flows?: Array<{stages: string[]}>; completed?: string[] }
  const challenge = await http.json<Challenge>('POST', 'register', registration);
  const {session, flows} = challenge.value;
  const stages = flows?.find(flow => flow.stages[0] === 'm.login.registration_token' &&
    (flow.stages.length === 1 || (flow.stages.length === 2 && flow.stages[1] === 'm.login.dummy')))?.stages;
  if (challenge.status !== 401 || !session || !stages) {
    throw new Error('Sunucuda belirteçli kayıt akışı bulunamadı.');
  }
  const result = await http.json<Challenge>('POST', 'register', {
    ...registration, auth: { type: stages[0], token, session },
  });
  if (result.status >= 200 && result.status < 300) return;
  if (result.status !== 401 || stages.length !== 2 || !result.value.completed?.includes(stages[0])) {
    throw new Error('Kayıt belirteci doğrulanamadı.');
  }
  await http.request('POST', 'register', { ...registration, auth: { type: stages[1], session } });
}

export async function login(http: MatrixHttp, username: string, password: string, device: string): Promise<Login> {
  const session = await http.request<Login>('POST', 'login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: username }, password,
    device_id: device, initial_device_display_name: 'Heartwood Terminal',
  });
  if (session.device_id !== device || !session.access_token || !/^@[^:]+:\S+$/.test(session.user_id)) {
    throw new Error('Sunucu beklenen oturum veya cihaz kimliğini döndürmedi.');
  }
  http.token = session.access_token;
  return session;
}
