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
import { available, commandName, commandUsage, completeCommand, startupMode, validArguments, verificationCode } from './commands.ts';
import type { CommandContext } from './commands.ts';
import { formatError, HeartwoodError, MatrixFailure } from './failures.ts';
import { selectLanguage, translator } from './locale.ts';
import type { Language, Translator } from './locale.ts';
import { diagnose } from './doctor.ts';
import { ChatSession } from './chat-session.ts';
import type { HistoryResult } from './history-navigation.ts';

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

function abovePrompt(reader: Interface, lines: string[], waiting: boolean): void {
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

async function commandQuestion(reader: Interface, input: TerminalInput, prompt: string, context: CommandContext,
  signal: AbortSignal): Promise<string> {
  input.complete = () => {
    const [candidates, prefix] = completeCommand(reader.line, reader.cursor, context);
    if (candidates.length === 1) reader.write(candidates[0].slice(prefix.length));
    else if (candidates.length > 1) abovePrompt(reader, candidates, true);
  };
  try { return await reader.question(prompt, {signal}); }
  finally { input.complete = undefined; }
}

function historyOutput(result: HistoryResult, lines: ChatLine[], ui: Translator, chat = false): string[] {
  return [
    ui.text('page', {page: result.page}),
    ...(lines.length ? lines.map(line => chatText(line, ui)) :
      [ui.text(result.lines.length ? 'historyAlreadyShown' : 'emptyPage')]),
    ui.text(result.hasMore ? (chat ? 'olderInChat' : 'olderAvailable') : 'noOlder'),
  ];
}

function searchOutput(session: ChatSession, ui: Translator, move = 0): string[] {
  const result = session.results(move);
  if (!result) return [ui.text('searchFirst')];
  const header = ui.text('searchScope');
  if (!result.pages) return [header, ui.text('searchEmpty')];
  return [
    header, ui.text('searchPage', {page: result.page, pages: result.pages}),
    ...result.lines.map(line => safeText(`${line.timestamp === undefined ? ui.text('timeUnknown') :
      new Date(line.timestamp).toISOString()} · ${chatText(line, ui)}`)),
    ...(result.expired ? [ui.text('searchEvicted')] : []),
  ];
}

async function detailedStatusOutput(client: Heartwood, room: string, ui: Translator,
  expectedPeer?: string, signal?: AbortSignal): Promise<string[]> {
  const check = () => client.detailedStatus(room, expectedPeer);
  const report = await (signal ? client.http.withSignal(signal, check) : check());
  const policy = {pass: 'statusPassed', fail: 'statusFailed', unknown: 'statusUnknown'} as const;
  const trust = {verified: 'deviceVerified', unverified: 'deviceUnverified', changed: 'statusChanged',
    unknown: 'statusUnknown'} as const;
  const sending = {allowed: 'statusAllowed', blocked: 'statusBlocked', unknown: 'statusUnknown'} as const;
  const pending = {none: 'statusNone', busy: 'statusBusy', uncertain: 'statusUncertain', retrying: 'retrying'} as const;
  const unknown = ui.text('statusUnknown');
  const lines = [
    ui.text('statusConnection', {state: ui.text(report.connection === 'connected' ? 'statusReachable' : 'statusFailed'),
      time: new Date(report.checkedAt).toISOString()}),
    ui.text('statusPeer', {account: report.peer ?? unknown, device: report.device ?? unknown}),
    ui.text('statusVerification', {state: ui.text(trust[report.verification])}),
    ui.text('statusEncryption', {state: ui.text(policy[report.encryption])}),
    ui.text('statusMembership', {state: ui.text(policy[report.membership])}),
    ui.text('statusSending', {state: ui.text(sending[report.sending])}),
    ui.text('statusPending', {state: ui.text(pending[report.pending])}),
  ];
  if (report.reason) {
    const code = report.reason instanceof HeartwoodError ? report.reason.code : undefined;
    const auth = report.reason instanceof MatrixFailure && report.reason.status === 401;
    const next = auth ? 'statusSignIn' : code === 'deviceNotVerified' ? 'statusVerify' :
      code === 'trustedDeviceChanged' || report.verification === 'changed' ? 'statusCheckDevice' :
        report.pending === 'uncertain' ? 'statusRetry' :
          report.pending === 'busy' || report.pending === 'retrying' ? 'statusWait' :
            report.connection === 'failed' ? 'statusCheckConnection' : 'statusReview';
    lines.push(errorText(report.reason, ui), ui.text(next));
  }
  return lines.map(safeText);
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

async function liveChat(client: Heartwood, reader: Interface, input: TerminalInput, room: string, signal: AbortSignal,
  ui: Translator, history: HistoryNavigator, expectedPeer?: string): Promise<boolean> {
  const live = await client.openLive(room, expectedPeer);
  if (signal.aborted) return true;
  const session = new ChatSession();
  console.log(ui.text('liveOpened'));
  const initial = session.display(live.initial);
  if (initial.length) console.log(ui.text('initialHistory'));
  for (const line of initial) console.log(chatText(line, ui));
  client.unread.displayed(room, initial);

  let waiting = false;
  let sending = false;
  let pending: Promise<void> | undefined;
  let historyPending: Promise<void> | undefined;
  const recovery = new LiveRecovery();
  const polling = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let delay: number | undefined = 1500;
  function show(lines: string[]): void {
    if (!lines.length || signal.aborted || polling.signal.aborted) return;
    abovePrompt(reader, lines, waiting);
  }

  async function refresh(): Promise<void> {
    try {
      const fetched = await client.http.withSignal(polling.signal, live.refresh);
      if (signal.aborted || polling.signal.aborted) return;
      const displayed = session.display(fetched);
      const lines = displayed.length ? [ui.text('newMessages'), ...displayed.map(line => chatText(line, ui))] : [];
      const update = recovery.success(live.catchingUp);
      delay = update.delay;
      if (update.status) lines.unshift(ui.text(update.status));
      show(lines);
      client.unread.displayed(room, displayed);
    } catch (error) {
      if (polling.signal.aborted || signal.aborted) return;
      const update = recovery.fail(error);
      delay = update.delay;
      if (update.status) show([ui.text(update.status), errorText(error, ui)]);
    }
  }

  function loadHistory(older: boolean): void {
    if (historyPending) { show([ui.text('historyBusy')]); return; }
    historyPending = (older ? history.older(room, polling.signal) : history.latest(room, polling.signal))
      .then(result => {
        if (signal.aborted || polling.signal.aborted) return;
        const lines = session.display(result.lines);
        show(historyOutput(result, lines, ui, true));
        client.unread.displayed(room, lines);
      }, error => show([errorText(error, ui)]))
      .finally(() => { historyPending = undefined; });
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
      const line = await commandQuestion(reader, input, ui.text('chatPrompt'), 'chat', signal).catch(() => '/exit');
      waiting = false;
      const message = line.trim();
      if (!message) continue;
      const [word] = message.split(/\s+/, 1);
      const command = commandName(word);
      const args = message.slice(word.length).trim();
      if (message.startsWith('/') && (!command || !available(command, 'chat'))) {
        show([ui.text('chatUnknown')]);
        continue;
      }
      if (command && !validArguments(command, args, 'chat')) {
        show([command === '/search' && args.length > 256 ? ui.text('searchTooLong') :
          ui.text('commandUsage', {example: commandUsage(command, 'chat')})]);
        continue;
      }
      if (command === '/back') return false;
      if (command === '/exit') return true;
      if (command === '/help') { show([ui.text('chatHelp')]); continue; }
      if (command === '/history' || command === '/older') { loadHistory(command === '/older'); continue; }
      if (command === '/search' || command === '/search-next' || command === '/search-prev') {
        if (command === '/search') session.search(args, ui.language);
        show(searchOutput(session, ui, command === '/search-next' ? 1 : command === '/search-prev' ? -1 : 0));
        continue;
      }
      if (command === '/status') {
        show(await detailedStatusOutput(client, room, ui, live.peer, polling.signal));
        continue;
      }
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
        else await sendWithStatus(ui, () => live.send(command === '/send' ? args : message));
      } catch (error) { console.error(errorText(error, ui)); }
      finally { sending = false; schedule(); }
    }
    return true;
  } finally {
    clearTimeout(timer);
    polling.abort();
    await Promise.all([pending, historyPending]);
    session.clear();
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
  const history = new HistoryNavigator((room, before, signal) => signal ?
    client.http.withSignal(signal, () => client.historyPage(room, before)) : client.historyPage(room, before));
  const conversations = new ConversationList();
  const reader = createInterface({ input, output: stdout, terminal: true, historySize: 0 });
  const openChat = (room: string, peer?: string) =>
    liveChat(client, reader, input, room, closed.signal, ui, history, peer);
  reader.once('close', () => closed.abort());
  reader.once('SIGINT', () => reader.close());
  try {
    console.log(ui.text('signedIn', {user: safeText(client.identity.user)}));
    if (guided) await showGuide(client, closed.signal, ui);
    while (true) {
      const line = await commandQuestion(reader, input, 'heartwood> ', 'main', closed.signal).catch(() => '/exit');
      const [word, target = ''] = line.trim().split(/\s+/);
      if (!word) continue;
      const command = commandName(word);
      if (!command || !available(command, 'main')) { console.log(ui.text('unknownCommand')); continue; }
      if (!validArguments(command, line.trim().slice(word.length).trim(), 'main')) {
        console.log(ui.text('commandUsage', {example: commandUsage(command, 'main')}));
        continue;
      }
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
            await client.sync();
            const {rooms, unavailable} = await client.conversations();
            for (const {number, room, peer, verified} of conversations.replace(rooms)) {
              const status = ui.text(verified === undefined ? 'deviceUnknown' :
                verified ? 'deviceVerified' : 'deviceUnverified');
              const indicator = client.unread.has(room, peer) ? ` · ${ui.text('unreadIndicator')}` : '';
              console.log(safeText(`${number}. ${peer} · ${status}${indicator}`));
            }
            if (rooms.length === 0) console.log(ui.text('noConversations'));
            if (unavailable > 0) console.log(ui.text('unavailableRooms', {count: unavailable}));
            break;
          }
          case '/chat': {
            if (target.startsWith('!')) {
              if (await openChat(target)) return;
              break;
            }
            const selected = target ? conversations.select(target) : undefined;
            const rooms = selected ? [selected.room] : await client.rooms();
            if (!rooms.length) throw new CliError('acceptFirst');
            if (rooms.length > 1) throw new CliError('chooseConversation');
            if (await openChat(rooms[0], selected?.peer)) return;
            break;
          }
          case '/status': {
            console.log((await detailedStatusOutput(client, target, ui)).join('\n'));
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
            console.log(historyOutput(result, result.lines, ui).join('\n'));
            client.unread.displayed(target, result.lines);
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

async function profiles(args: string[], ui: Translator): Promise<void> {
  const {inspectProfile, listProfiles, removeProfile} = await import('./profile-management.ts');
  const [operation, name] = args;
  if (operation === 'list' && args.length === 1) {
    const entries = await listProfiles();
    if (!entries.length) console.log(ui.text('profilesEmpty'));
    for (const entry of entries) console.log(safeText(entry.record ? entry.name :
      ui.text('profileUnavailable', {name: entry.name})));
    return;
  }
  if (!name || args.length !== 2 || (operation !== 'show' && operation !== 'remove')) {
    console.error(ui.text('profilesUsage'));
    process.exitCode = 1;
    return;
  }
  const entry = await inspectProfile(name);
  if (operation === 'show') {
    console.log(safeText(entry.record ? ui.text('profileDetails', {name, ...entry.record}) :
      ui.text('profileUnavailable', {name})));
    return;
  }
  if (!entry.record) throw new HeartwoodError('profileUnsafePath');
  if (!stdin.isTTY || !stdout.isTTY) throw new CliError('interactiveRequired');
  const closed = new AbortController();
  const interrupt = () => closed.abort();
  const input = new TerminalInput(interrupt, () => stdout.write('\x07'));
  const wasRaw = stdin.isRaw;
  const reader = createInterface({input, output: stdout, terminal: true, historySize: 0});
  reader.once('close', interrupt);
  process.on('SIGINT', interrupt);
  try {
    stdin.setRawMode(true);
    stdin.pipe(input);
    stdout.write('\x1b[?2004h');
    console.log(ui.text('profileWarning'));
    const answer = await reader.question(ui.text('profileConfirm', {name}),
      {signal: AbortSignal.any([closed.signal, AbortSignal.timeout(180_000)])}).catch(() => undefined);
    if (answer !== name || closed.signal.aborted) {
      console.log(ui.text('profileCancelled'));
      return;
    }
    await removeProfile(name, undefined, entry.record);
    console.log(ui.text('profileRemoved', {name}));
  } finally {
    process.off('SIGINT', interrupt);
    reader.close();
    stdin.unpipe(input);
    input.destroy();
    stdin.pause();
    stdin.setRawMode(wasRaw);
    stdout.write('\x1b[?2004l');
  }
}

async function main(args: string[], ui: Translator): Promise<void> {
  const [word, name, server, username] = args;
  if (!word || word === '--help') { console.log(ui.help()); return; }
  if (word === 'profiles') { await profiles(args.slice(1), ui); return; }
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
