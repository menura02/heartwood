import { Heartwood } from '../src/client.ts';
import { HeartwoodError } from '../src/failures.ts';
import { MatrixFailure, MatrixHttp, login, part, register } from '../src/matrix.ts';
import { Profile } from '../src/profile.ts';

interface Command { op: string; room?: string; peer?: string; text?: string; before?: string }
interface Init {
  origin: string; token: string; name: string; username: string;
  password: string; passphrase: string; root: string; first: boolean;
}

let profile: Profile | undefined;
let client: Heartwood | undefined;
let live: Awaited<ReturnType<Heartwood['openLive']>> | undefined;
let lostSend: {url: string; body: RequestInit['body']; eventId: string} | undefined;

const fetchFromServer = globalThis.fetch;

async function withFetch<T>(intercept: typeof fetch, action: () => Promise<T>): Promise<T> {
  globalThis.fetch = intercept;
  try { return await action(); }
  finally { globalThis.fetch = fetchFromServer; }
}

function isEncryptedSend(url: string, init?: RequestInit): boolean {
  return init?.method === 'PUT' && url.includes('/send/m.room.encrypted/');
}

async function run(command: Command & Partial<Init>): Promise<unknown> {
  if (command.op === 'open') {
    const init = command as Init;
    const http = new MatrixHttp(init.origin);
    if (init.first) await register(http, init.username, init.password, init.token);
    profile = await Profile.open(init.name, http.origin, init.username, init.root);
    const session = await login(http, init.username, init.password, profile.data.device);
    client = await Heartwood.open(http, profile, session, init.passphrase);
    return client.identity;
  }
  if (!client) throw new Error('Fixture session not open');
  const session = client;
  const {room = '', peer = '', text = ''} = command;
  switch (command.op) {
    case 'invite': return client.invite(peer);
    case 'incompatible-invite': return client.http.request('POST', 'createRoom', {
      preset: 'private_chat', invite: [peer], creation_content: { 'm.federate': false },
      initial_state: [{type: 'com.heartwood.direct', state_key: '', content: {version: 1}}],
    });
    case 'pending': return client.pending();
    case 'accept': return client.accept(room);
    case 'reject': return client.reject(room);
    case 'send': return client.send(room, text, command.peer);
    case 'send-live': {
      if (!live) throw new Error('Live fixture not open');
      return live.send(text);
    }
    case 'send-losing-response': {
      return withFetch(async (input, init) => {
        const response = await fetchFromServer(input, init);
        const url = String(input);
        if (isEncryptedSend(url, init) && response.ok) {
          const {event_id} = await response.json() as {event_id: string};
          lostSend = {url, body: init?.body, eventId: event_id};
          throw new TypeError('Fixture dropped an accepted response');
        }
        return response;
      }, () => session.send(room, text));
    }
    case 'retry-send': {
      if (!lostSend) throw new Error('Missing lost response fixture');
      const original = lostSend;
      let matched = false;
      const result = await withFetch(async (input, init) => {
        const url = String(input);
        if (isEncryptedSend(url, init)) {
          matched = url === original.url && init?.body === original.body;
        }
        return fetchFromServer(input, init);
      }, () => session.retrySend(room));
      return {result, matched, originalEvent: original.eventId};
    }
    case 'live-open':
      live = await client.openLive(room);
      return live.initial;
    case 'live-refresh': return live?.refresh();
    case 'live-offline': {
      const chat = live;
      if (!chat) throw new Error('Live fixture not open');
      return withFetch(async (input, init) => {
        if (new URL(String(input)).pathname.endsWith('/sync')) throw new TypeError('Fixture network interruption');
        return fetchFromServer(input, init);
      }, chat.refresh);
    }
    case 'logout': return client.http.request('POST', 'logout', {});
    case 'guide': return client.onboardingStep();
    case 'verify': return client.verify(peer, text);
    case 'history': return client.history(room);
    case 'history-page': return client.historyPage(room, command.before);
    case 'block': return client.block(peer);
    case 'rooms': return client.rooms();
    case 'conversations': return client.conversations();
    case 'status': return client.status(room);
    case 'wire': {
      const query = new URLSearchParams({dir: 'b', limit: '50'});
      if (command.before !== undefined) query.set('from', command.before);
      return client.http.request('GET', `rooms/${part(room)}/messages?${query}`);
    }
    default: throw new Error('Unknown fixture command');
  }
}

process.on('message', async (command: Command) => {
  if (command.op === 'close') {
    try {
      client?.close();
      await profile?.close();
      process.send?.({ok: true}, undefined, undefined, () => process.disconnect());
    } catch (error) {
      process.send?.({error: (error as Error).message}, undefined, undefined, () => process.disconnect());
    }
    return;
  }
  try { process.send?.({ok: true, value: await run(command)}); }
  catch (error) {
    process.send?.({error: (error as Error).message,
      code: error instanceof HeartwoodError || error instanceof MatrixFailure ? error.code : undefined,
      status: error instanceof MatrixFailure ? error.status : undefined});
  }
});
