import { HeartwoodError, MatrixFailure, MatrixTransportFailure } from './failures.ts';
import { matrixOrigin } from './policy.ts';
import { AsyncLocalStorage } from 'node:async_hooks';

export const part = encodeURIComponent;

export { MatrixFailure, MatrixTransportFailure } from './failures.ts';

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

  async json<T>(method: string, path: string, body?: unknown): Promise<{status: number; value: T}> {
    const headers = new Headers({ Accept: 'application/json' });
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const parent = [this.shutdown, this.scope.getStore()].filter((signal): signal is AbortSignal => !!signal);
    const signal = AbortSignal.any([...parent, AbortSignal.timeout(15_000)]);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    let response: Response;
    try {
      response = await fetch(`${this.origin}/_matrix/client/v3/${path}`, {
        method, headers, redirect: 'manual', signal, body: payload,
      });
    } catch {
      for (const controller of parent) controller.throwIfAborted();
      throw new MatrixTransportFailure();
    }
    if (response.status >= 300 && response.status < 400) throw new HeartwoodError('matrixRedirect');
    const value = await response.json().catch((error: unknown) => {
      for (const controller of parent) controller.throwIfAborted();
      if (response.status >= 400) throw new MatrixFailure(response.status, 'UNKNOWN');
      if (!(error instanceof SyntaxError)) throw new MatrixTransportFailure();
      throw new HeartwoodError('matrixInvalidJson');
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
    throw new HeartwoodError('registrationFlowMissing');
  }
  const result = await http.json<Challenge>('POST', 'register', {
    ...registration, auth: { type: stages[0], token, session },
  });
  if (result.status >= 200 && result.status < 300) return;
  if (result.status !== 401 || stages.length !== 2 || !result.value.completed?.includes(stages[0])) {
    throw new HeartwoodError('registrationTokenRejected');
  }
  await http.request('POST', 'register', { ...registration, auth: { type: stages[1], session } });
}

export async function login(http: MatrixHttp, username: string, password: string, device: string): Promise<Login> {
  const session = await http.request<Login>('POST', 'login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: username }, password,
    device_id: device, initial_device_display_name: 'Heartwood Terminal',
  });
  if (session.device_id !== device || !session.access_token || !/^@[^:]+:\S+$/.test(session.user_id)) {
    throw new HeartwoodError('invalidLoginSession');
  }
  http.token = session.access_token;
  return session;
}
