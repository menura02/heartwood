import { createInterface } from 'node:readline/promises';
import type { Interface } from 'node:readline/promises';
import { clearScreenDown, cursorTo, moveCursor } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import type { Heartwood } from './client.ts';
import { MatrixHttp, login, register } from './matrix.ts';
import { deviceCode, formatDeviceCode, matrixOrigin, safeText } from './policy.ts';
import type { Profile } from './profile.ts';
import type { ChatLine } from './chat-feed.ts';
import { HistoryNavigator } from './history-navigation.ts';
import type { SendResult } from './send-attempts.ts';
import { ConversationList } from './conversation-list.ts';
import { LiveRecovery } from './connection.ts';
import { TerminalInput } from './terminal-input.ts';
import { commandName, startupMode, verificationCode } from './commands.ts';
import { formatError } from './failures.ts';
import { selectLanguage, translator } from './locale.ts';
import type { Language, Translator } from './locale.ts';
import { diagnose } from './doctor.ts';

type CliFailure = 'invalidCommand' | 'interactiveRequired' | 'passphraseMismatch' | 'acceptFirst' | 'chooseConversation';
class CliError extends Error {
  readonly key: CliFailure;

  constructor(key: CliFailure) {
    super(key);
    this.key = key;
  }
}

function errorText(error: unknown, ui: Translator): string {
  return safeText(error instanceof CliError ? ui.text(error.key) : formatError(error, ui.language));
}

function chatText(line: ChatLine, ui: Translator): string {
  return safeText(`${line.sender}  ${line.body ?? ui.text('undecryptable')}`);
}

async function sendWithStatus(ui: Translator, action: () => Promise<SendResult>, retry = false): Promise<void> {
  console.log(ui.text(retry ? 'retrying' : 'sending'));
  const result = await action();
  console.log(ui.text(result.status === 'accepted' ? 'serverAccepted' : 'uncertain'));
}

function showPending(client: Heartwood, ui: Translator): void {
  const rooms = client.pendingSendRooms();
  if (rooms.length === 0) console.log(ui.text('noPending'));
  for (const room of rooms) console.log(safeText(ui.text('pendingRoom', {room})));
}

async function discardPending(client: Heartwood, reader: Interface, room: string, signal: AbortSignal,
  ui: Translator): Promise<void> {
  const discard = client.prepareSendDiscard(room);
  console.log(ui.text('discardWarning'));
  const answer = await reader.question(ui.text('discardPrompt'), {signal});
  if (!['yes', 'evet'].includes(answer.trim().toLowerCase())) {
    console.log(ui.text('pendingKept'));
    return;
  }
  signal.throwIfAborted();
  discard();
  console.log(ui.text('discarded'));
}

async function liveChat(client: Heartwood, reader: Interface, room: string, signal: AbortSignal,
  ui: Translator, expectedPeer?: string): Promise<boolean> {
  const live = await client.openLive(room, expectedPeer);
  if (signal.aborted) return true;
  console.log(ui.text('liveOpened'));
  for (const line of live.initial) console.log(chatText(line, ui));

  let waiting = false;
  let sending = false;
  let pending: Promise<void> | undefined;
  const recovery = new LiveRecovery();
  const polling = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay: number | undefined = 1500;
  function show(lines: string[]): void {
    if (!lines.length || signal.aborted) return;
    const rows = waiting ? reader.getCursorPos().rows : 0;
    if (waiting) {
      moveCursor(stdout, 0, -rows);
      cursorTo(stdout, 0);
      clearScreenDown(stdout);
    }
    console.log(lines.join('\n'));
    if (waiting) {
      // Readline moves up from the draft's cursor row before redrawing it.
      if (rows > 0) stdout.write('\n'.repeat(rows));
      reader.prompt(true);
    }
  }

  async function refresh(): Promise<void> {
    try {
      const lines = (await client.http.withSignal(polling.signal, live.refresh)).map(line => chatText(line, ui));
      const update = recovery.success(live.catchingUp);
      delay = update.delay;
      if (update.status) lines.unshift(ui.text(update.status));
      show(lines);
    } catch (error) {
      if (polling.signal.aborted || signal.aborted) return;
      const update = recovery.fail(error);
      delay = update.delay;
      if (update.status) show([ui.text(update.status), errorText(error, ui)]);
    }
  }

  function schedule(): void {
    clearTimeout(timer);
    if (sending || pending || signal.aborted || polling.signal.aborted || delay === undefined) return;
    timer = setTimeout(() => {
      pending = refresh().finally(() => {
        pending = undefined;
        schedule();
      });
    }, delay);
  }

  try {
    schedule();
    while (!signal.aborted) {
      waiting = true;
      const line = await reader.question(ui.text('chatPrompt'), {signal}).catch(() => '/exit');
      waiting = false;
      const message = line.trim();
      const command = commandName(message);
      if (command === '/back') return false;
      if (command === '/exit') return true;
      if (!message) continue;
      if (command === '/refresh') {
        recovery.resume();
        delay = 0;
        schedule();
        continue;
      }
      sending = true;
      clearTimeout(timer);
      try {
        await pending;
        if (signal.aborted) return true;
        if (command === '/retry') await sendWithStatus(ui, live.retry, true);
        else if (command === '/pending') showPending(client, ui);
        else if (command === '/discard') await discardPending(client, reader, room, signal, ui);
        else await sendWithStatus(ui, () => live.send(message));
      } catch (error) { console.error(errorText(error, ui)); }
      finally { sending = false; schedule(); }
    }
    return true;
  } finally {
    clearTimeout(timer);
    polling.abort();
    await pending;
  }
}

async function secret(input: TerminalInput, prompt: string, signal: AbortSignal): Promise<string> {
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const reader = createInterface({ input, output: hidden, terminal: true, historySize: 0 });
  const closed = new AbortController();
  reader.once('close', () => closed.abort());
  reader.once('SIGINT', () => reader.close());
  try {
    stdout.write(prompt);
    return await reader.question('', { signal: AbortSignal.any([signal, closed.signal, AbortSignal.timeout(180_000)]) });
  } finally {
    reader.close();
    stdout.write('\n');
  }
}

async function showGuide(client: Heartwood, signal: AbortSignal, ui: Translator): Promise<void> {
  const labels = {accept: 'guideAccept', wait: 'guideWait', verify: 'guideVerify', changed: 'guideChanged',
    ready: 'guideReady', invite: 'guideInvite', unavailable: 'guideUnavailable'} as const;
  const deadline = AbortSignal.timeout(4_000);
  try {
    const step = await client.http.withSignal(AbortSignal.any([signal, deadline]), () => client.onboardingStep());
    if (!signal.aborted) console.log(ui.text(labels[step]));
  } catch (error) {
    if (signal.aborted) return;
    console.log(ui.text('guideBlocked'));
    console.error(deadline.aborted ? ui.text('guideTimeout') : errorText(error, ui));
  }
}

async function shell(client: Heartwood, input: TerminalInput, closed: AbortController, ui: Translator,
  guided = false): Promise<void> {
  const history = new HistoryNavigator((room, before) => client.historyPage(room, before));
  const conversations = new ConversationList();
  const reader = createInterface({ input, output: stdout, terminal: true, historySize: 0 });
  reader.once('close', () => closed.abort());
  reader.once('SIGINT', () => reader.close());
  try {
    console.log(ui.text('signedIn', {user: safeText(client.identity.user)}));
    if (guided) await showGuide(client, closed.signal, ui);
    while (true) {
      const line = await reader.question('heartwood> ', {signal: closed.signal}).catch(() => '/exit');
      const [word, target = ''] = line.trim().split(/\s+/);
      if (!word) continue;
      const command = commandName(word);
      try {
        switch (command) {
          case '/help': console.log(ui.help()); break;
          case '/guide': await showGuide(client, closed.signal, ui); break;
          case '/identity':
            console.log(safeText(ui.text('identity', {user: client.identity.user, device: client.identity.device})));
            console.log(formatDeviceCode(deviceCode(client.identity)));
            console.log(ui.text('compareCode'));
            break;
          case '/invite': console.log(safeText(await client.invite(target))); break;
          case '/requests':
            for (const {room, peer} of await client.pending()) console.log(safeText(`${room}  ${peer}`));
            break;
          case '/accept': await client.accept(target); console.log(ui.text('accepted')); break;
          case '/reject': await client.reject(target); console.log(ui.text('rejected')); break;
          case '/block': await client.block(target); console.log(ui.text('blocked')); break;
          case '/verify': {
            await client.verify(target, verificationCode(line));
            console.log(ui.text('verified'));
            break;
          }
          case '/rooms':
            for (const room of await client.rooms()) console.log(safeText(room));
            break;
          case '/conversations': {
            const {rooms, unavailable} = await client.conversations();
            for (const {number, peer, verified} of conversations.replace(rooms)) {
              const status = ui.text(verified === undefined ? 'deviceUnknown' :
                verified ? 'deviceVerified' : 'deviceUnverified');
              console.log(safeText(`${number}. ${peer} · ${status}`));
            }
            if (rooms.length === 0) console.log(ui.text('noConversations'));
            if (unavailable > 0) console.log(ui.text('unavailableRooms', {count: unavailable}));
            break;
          }
          case '/chat': {
            if (target.startsWith('!')) {
              if (await liveChat(client, reader, target, closed.signal, ui)) return;
              break;
            }
            const selected = target ? conversations.select(target) : undefined;
            const rooms = selected ? [selected.room] : await client.rooms();
            if (!rooms.length) throw new CliError('acceptFirst');
            if (rooms.length > 1) throw new CliError('chooseConversation');
            if (await liveChat(client, reader, rooms[0], closed.signal, ui, selected?.peer)) return;
            break;
          }
          case '/status': {
            const {peer, verified} = await client.status(target);
            console.log(safeText(`${peer} · Megolm · ${ui.text(verified ? 'deviceVerified' : 'deviceUnverified')}`));
            break;
          }
          case '/send': {
            const message = /^\S+\s+\S+\s+(.+)$/u.exec(line.trim())?.[1] ?? '';
            await sendWithStatus(ui, () => client.send(target, message));
            break;
          }
          case '/retry': await sendWithStatus(ui, () => client.retrySend(target), true); break;
          case '/pending': showPending(client, ui); break;
          case '/discard': await discardPending(client, reader, target, closed.signal, ui); break;
          case '/history':
          case '/older': {
            const result = await (command === '/history' ? history.latest(target) : history.older(target));
            console.log(ui.text('page', {page: result.page}));
            if (result.lines.length === 0) console.log(ui.text('emptyPage'));
            for (const event of result.lines) console.log(chatText(event, ui));
            console.log(ui.text(result.hasMore ? 'olderAvailable' : 'noOlder'));
            break;
          }
          case '/exit': return;
          default: console.log(ui.text('unknownCommand'));
        }
      } catch (error) { console.error(errorText(error, ui)); }
    }
  } finally {
    const count = client.pendingSendRooms().length;
    if (count > 0) console.log(ui.text('exitPending', {count}));
    reader.close();
  }
}

async function onboarding(input: TerminalInput, signal: AbortSignal, ui: Translator):
Promise<{mode: 'register' | 'login'; name: string; server: string; username: string} | undefined> {
  const reader = createInterface({input, output: stdout, terminal: true, historySize: 0});
  const closed = new AbortController();
  reader.once('close', () => closed.abort());
  const active = AbortSignal.any([signal, closed.signal]);
  const answer = async (prompt: string) => (await reader.question(prompt, {signal: active})).trim();
  try {
    console.log(ui.text('guideIntro'));
    let mode: ReturnType<typeof startupMode>;
    while (!mode) {
      const selected = await answer(ui.text('guideMode'));
      if (selected === 'q') return undefined;
      mode = startupMode(selected);
      if (!mode) console.log(ui.text('guideModeInvalid'));
    }
    let server: string | undefined;
    while (!server) {
      try { server = matrixOrigin(await answer(ui.text('guideServer'))); }
      catch (error) {
        if (active.aborted) throw error;
        console.error(errorText(error, ui));
      }
    }
    const name = await answer(ui.text('guideProfile'));
    const username = await answer(ui.text('guideUsername'));
    return {mode, name, server, username};
  } catch (error) {
    if (active.aborted) return undefined;
    throw error;
  } finally {
    reader.close();
  }
}

async function main(args: string[], ui: Translator): Promise<void> {
  const [word, name, server, username] = args;
  if (!word || word === '--help') { console.log(ui.help()); return; }
  if (word === 'doctor' && args.length <= 2) {
    const results = await diagnose(name);
    for (const {check, level, detail} of results) {
      console.log(ui.text('doctorResult', {level: ui.text(level), check: ui.text(check), detail: ui.text(detail)}));
    }
    console.log(ui.text('doctorScope'));
    if (results.some(({level}) => level === 'doctorFail')) process.exitCode = 1;
    return;
  }
  const guided = word === 'onboard' && args.length === 1;
  const mode = startupMode(word);
  const direct = mode && name && server && username && args.length === 4 ? {mode, name, server, username} : undefined;
  if (!guided && !direct) {
    throw new CliError('invalidCommand');
  }
  if (!stdin.isTTY || !stdout.isTTY) throw new CliError('interactiveRequired');
  const [{Heartwood}, {Profile}] = await Promise.all([import('./client.ts'), import('./profile.ts')]);
  const closed = new AbortController();
  const interrupt = () => closed.abort();
  const input = new TerminalInput(interrupt, () => stdout.write('\x07'));
  const wasRaw = stdin.isRaw;
  let bracketed = false;
  let profile: Profile | undefined;
  let client: Heartwood | undefined;
  process.on('SIGINT', interrupt);
  try {
    stdin.setRawMode(true);
    stdin.pipe(input);
    stdout.write('\x1b[?2004h');
    bracketed = true;
    const options = direct ?? await onboarding(input, closed.signal, ui);
    if (!options || closed.signal.aborted) return;
    const http = new MatrixHttp(options.server, closed.signal);
    profile = await Profile.open(options.name, http.origin, options.username);
    closed.signal.throwIfAborted();
    const password = await secret(input, ui.text('accountPassword'), closed.signal);
    if (options.mode === 'register') {
      await register(http, options.username, password, await secret(input, ui.text('registrationToken'), closed.signal));
      console.log(ui.text('accountCreated'));
    }
    const passphrase = await secret(input, ui.text('storePassphrase'), closed.signal);
    if (!profile.data.identity && passphrase !== await secret(input, ui.text('confirmPassphrase'), closed.signal)) {
      throw new CliError('passphraseMismatch');
    }
    client = await Heartwood.open(http, profile, await login(http, options.username, password, profile.data.device), passphrase);
    await shell(client, input, closed, ui, guided);
  } catch (error) {
    if (!closed.signal.aborted) throw error;
  } finally {
    stdin.unpipe(input);
    input.destroy();
    stdin.pause();
    if (stdin.isRaw !== wasRaw) stdin.setRawMode(wasRaw);
    if (bracketed) stdout.write('\x1b[?2004l');
    process.off('SIGINT', interrupt);
    try { client?.close(); }
    finally { await profile?.close(); }
  }
}

async function run(): Promise<void> {
  let language: Language = 'en';
  try {
    const selected = selectLanguage(process.argv.slice(2), process.env.HEARTWOOD_LANG);
    language = selected.language;
    await main(selected.args, translator(language));
  } catch (error) {
    console.error(errorText(error, translator(language)));
    process.exitCode = 1;
  }
}

await run();
