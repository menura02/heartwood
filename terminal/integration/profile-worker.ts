import { Heartwood } from '../src/client.ts';
import { MatrixHttp, login, part, register } from '../src/matrix.ts';
import { Profile } from '../src/profile.ts';

interface Command { op: string; room?: string; peer?: string; text?: string; before?: string }
interface Init {
  origin: string; token: string; name: string; username: string;
  password: string; passphrase: string; root: string; first: boolean;
}

let profile: Profile | undefined;
let client: Heartwood | undefined;
let live: Awaited<ReturnType<Heartwood['openLive']>> | undefined;
let lostSend: {path: string; body: unknown; eventId: string} | undefined;

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
      const http = client.http;
      const request = http.request.bind(http);
      http.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
        const result = await request<T>(method, path, body);
        if (method === 'PUT' && path.includes('/send/m.room.encrypted/')) {
          lostSend = {path, body, eventId: (result as {event_id: string}).event_id};
          throw new Error('Fixture dropped an accepted response');
        }
        return result;
      };
      try { return await client.send(room, text); }
      finally { http.request = request; }
    }
    case 'retry-send': {
      if (!lostSend) throw new Error('Missing lost response fixture');
      const http = client.http;
      const request = http.request.bind(http);
      const original = lostSend;
      let matched = false;
      http.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
        if (method === 'PUT' && path.includes('/send/m.room.encrypted/')) {
          matched = path === original.path && JSON.stringify(body) === JSON.stringify(original.body);
        }
        return request<T>(method, path, body);
      };
      try { return {result: await client.retrySend(room), matched, originalEvent: original.eventId}; }
      finally { http.request = request; }
    }
    case 'live-open':
      live = await client.openLive(room);
      return live.initial;
    case 'live-refresh': return live?.refresh();
    case 'live-offline': {
      const http = client.http;
      const request = http.request.bind(http);
      http.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
        if (path.startsWith('sync?')) throw new Error('Fixture network interruption');
        return request<T>(method, path, body);
      };
      try { return await live?.refresh(); }
      finally { http.request = request; }
    }
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
  catch (error) { process.send?.({error: (error as Error).message}); }
});
