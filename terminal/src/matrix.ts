import { HeartwoodError, MatrixFailure, MatrixTransportFailure } from './failures.ts';
import { matrixOrigin } from './policy.ts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isRecord, isToken, isUserId } from './matrix-response.ts';

export const part = encodeURIComponent;

export { MatrixFailure, MatrixTransportFailure } from './failures.ts';

const MiB = 1024 * 1024;

function responseLimit(path: string, status: number): number {
  if (status >= 400) return MiB;
  const endpoint = path.split('?', 1)[0];
  if (endpoint === 'sync') return 16 * MiB;
  if (/^rooms\/[^/]+\/(?:messages|state)$/.test(endpoint)) return 8 * MiB;
  if (endpoint.startsWith('keys/')) return 4 * MiB;
  return MiB;
}

async function readBody(response: Response, limit: number, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  const cancel = () => { void reader?.cancel().catch(() => {}); };
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let text = '';
  let bytes = 0;
  signal.addEventListener('abort', cancel, {once: true});
  try {
    if (reader) {
      signal.throwIfAborted();
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); }
        catch { throw new MatrixTransportFailure('matrixBodyInterrupted'); }
        signal.throwIfAborted();
        if (chunk.done) break;
        // The stream counts actual decoded HTTP bytes even with missing or misleading headers.
        bytes += chunk.value.byteLength;
        if (bytes > limit) throw new HeartwoodError('matrixResponseTooLarge');
        try { text += decoder.decode(chunk.value, {stream: true}); }
        catch { throw new HeartwoodError('matrixInvalidJson'); }
      }
    }
    try { return JSON.parse(text + decoder.decode()) as unknown; }
    catch { throw new HeartwoodError('matrixInvalidJson'); }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader?.releaseLock();
  }
}

function errorCode(value: unknown): string {
  return isRecord(value) && typeof value.errcode === 'string' && /^M_[A-Z_]+$/.test(value.errcode)
    ? value.errcode : 'UNKNOWN';
}

export class MatrixHttp {
  readonly origin: string;
  token?: string;
  private readonly shutdown?: AbortSignal;
  private readonly scope = new AsyncLocalStorage<AbortSignal>();

  constructor(origin: string, shutdown?: AbortSignal) {
    this.origin = matrixOrigin(origin);
    this.shutdown = shutdown;
  }

  withSignal<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
    return this.scope.run(signal, action);
  }

  get currentSignal(): AbortSignal | undefined { return this.scope.getStore(); }

  async json(method: string, path: string, body?: unknown): Promise<{status: number; value: unknown}> {
    const headers = new Headers({ Accept: 'application/json' });
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const parent = [this.shutdown, this.scope.getStore()].filter((signal): signal is AbortSignal => !!signal);
    const timeout = AbortSignal.timeout(15_000);
    const signal = AbortSignal.any([...parent, timeout]);
    const checkCancellation = (status?: number) => {
      if (timeout.aborted && signal.reason === timeout.reason) {
        if (status !== undefined && status >= 400) throw new MatrixFailure(status, 'UNKNOWN', 'matrixTimeout');
        throw new MatrixTransportFailure('matrixTimeout');
      }
      signal.throwIfAborted();
    };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let response: Response;
    try {
      checkCancellation();
      response = await fetch(`${this.origin}/_matrix/client/v3/${path}`, {
        method, headers, redirect: 'manual', signal, body: payload,
      });
    } catch {
      checkCancellation();
      throw new MatrixTransportFailure();
    }
    if (response.status >= 300 && response.status < 400) {
      void response.body?.cancel().catch(() => {});
      checkCancellation();
      throw new HeartwoodError('matrixRedirect');
    }
    const value = await readBody(response, responseLimit(path, response.status), signal).catch((error: unknown) => {
      checkCancellation(response.status);
      if (response.status >= 400 && error instanceof HeartwoodError) {
        throw new MatrixFailure(response.status, 'UNKNOWN', error.code);
      }
      throw error;
    });
    checkCancellation(response.status);
    return {status: response.status, value};
  }

  async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const {status, value} = await this.json(method, path, body);
    if (status < 200 || status >= 300) throw new MatrixFailure(status, errorCode(value));
    return value;
  }
}

export interface Login { access_token: string; user_id: string; device_id: string }

export async function register(http: MatrixHttp, username: string, password: string, token: string): Promise<void> {
  const registration = { username, password, inhibit_login: true };
  const challenge = await http.json('POST', 'register', registration);
  const value = challenge.value;
  // Synapse checks the username before user-interactive auth, so a taken or invalid name fails here.
  if (challenge.status >= 400 && challenge.status !== 401) throw new MatrixFailure(challenge.status, errorCode(value));
  if (challenge.status !== 401 || !isRecord(value) || !isToken(value.session) || !Array.isArray(value.flows)) {
    throw new HeartwoodError('registrationFlowMissing');
  }
  const {session} = value;
  const flows: unknown[] = value.flows;
  const flow = flows.find((candidate): candidate is {stages: string[]} =>
    isRecord(candidate) && Array.isArray(candidate.stages) && candidate.stages[0] === 'm.login.registration_token' &&
    (candidate.stages.length === 1 || (candidate.stages.length === 2 && candidate.stages[1] === 'm.login.dummy')));
  if (!flow) throw new HeartwoodError('registrationFlowMissing');
  const [tokenStage, nextStage] = flow.stages;
  const result = await http.json('POST', 'register', {
    ...registration, auth: { type: tokenStage, token, session },
  });
  if (result.status >= 200 && result.status < 300 && isRecord(result.value) && isUserId(result.value.user_id)) return;
  if (result.status !== 401 || nextStage === undefined || !isRecord(result.value) ||
      result.value.session !== session || !Array.isArray(result.value.completed) ||
      !result.value.completed.every(isToken) || !result.value.completed.includes(tokenStage)) {
    throw new HeartwoodError('registrationTokenRejected');
  }
  const complete = await http.request('POST', 'register', { ...registration, auth: { type: nextStage, session } });
  if (!isRecord(complete) || !isUserId(complete.user_id)) throw new HeartwoodError('registrationTokenRejected');
}

export async function login(http: MatrixHttp, username: string, password: string, device: string): Promise<Login> {
  const session = await http.request('POST', 'login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: username }, password,
    device_id: device, initial_device_display_name: 'Heartwood Terminal',
  });
  if (!isRecord(session) || !isToken(session.device_id) || session.device_id !== device ||
      typeof session.access_token !== 'string' || !/^[\x21-\x7e]+$/.test(session.access_token) ||
      !isUserId(session.user_id)) {
    throw new HeartwoodError('invalidLoginSession');
  }
  http.token = session.access_token;
  return {access_token: session.access_token, user_id: session.user_id, device_id: session.device_id};
}
