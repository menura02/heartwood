import { clearScreenDown, cursorTo, moveCursor } from 'node:readline';
import type { Interface } from 'node:readline/promises';
import { stdout } from 'node:process';
import type { ChatLine } from './chat-feed.ts';
import type { ChatSession } from './chat-session.ts';
import type { ChatStatus } from './client.ts';
import { completeCommand } from './commands.ts';
import type { CommandContext } from './commands.ts';
import { formatError, HeartwoodError, MatrixFailure } from './failures.ts';
import type { HistoryResult } from './history-navigation.ts';
import type { Translator } from './locale.ts';
import { safeText } from './policy.ts';
import type { TerminalInput } from './terminal-input.ts';

export function chatText(line: ChatLine, ui: Translator): string {
  return safeText(`${line.sender}  ${line.body ?? ui.text('undecryptable')}`);
}

export function abovePrompt(reader: Interface, lines: string[], waiting: boolean): void {
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

export async function commandQuestion(reader: Interface, input: TerminalInput, prompt: string, context: CommandContext,
  signal: AbortSignal): Promise<string> {
  input.complete = () => {
    const [candidates, prefix] = completeCommand(reader.line, reader.cursor, context);
    if (candidates.length === 1) reader.write(candidates[0].slice(prefix.length));
    else if (candidates.length > 1) abovePrompt(reader, candidates, true);
  };
  try { return await reader.question(prompt, {signal}); }
  finally { input.complete = undefined; }
}

export function historyOutput(result: HistoryResult, lines: ChatLine[], ui: Translator, chat = false): string[] {
  return [
    ui.text('page', {page: result.page}),
    ...(lines.length ? lines.map(line => chatText(line, ui)) :
      [ui.text(result.lines.length ? 'historyAlreadyShown' : 'emptyPage')]),
    ui.text(result.hasMore ? (chat ? 'olderInChat' : 'olderAvailable') : 'noOlder'),
  ];
}

export function searchOutput(session: ChatSession, ui: Translator, move = 0): string[] {
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

export function statusOutput(report: ChatStatus, ui: Translator): string[] {
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
    lines.push(formatError(report.reason, ui.language), ui.text(next));
  }
  return lines.map(safeText);
}
