import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatSession } from '../src/chat-session.ts';
import { completeCommand, validArguments } from '../src/commands.ts';
import { HistoryNavigator } from '../src/history-navigation.ts';
import { SessionUnread } from '../src/unread.ts';

test('Tab only completes a whole command token at the cursor in the current context', () => {
  assert.deepEqual(completeCommand('/ide', 4, 'main'), [['/identity'], '/ide']);
  assert.deepEqual(completeCommand('/kim', 4, 'main'), [['/kimlik'], '/kim']);
  assert.ok(completeCommand('/s', 2, 'chat')[0].includes('/search-next'));
  assert.deepEqual(completeCommand('/search', 7, 'main')[0], []);
  assert.deepEqual(completeCommand('/history draft', 8, 'chat')[0], []);
  assert.deepEqual(completeCommand('secret', 6, 'main')[0], []);
  assert.equal(validArguments('/history', '', 'main'), false);
  assert.equal(validArguments('/history', '', 'chat'), true);
});

test('history and live lines share display identity and unresolved lines can later become readable', () => {
  const session = new ChatSession();
  const line = {id: 'event', sender: 'peer', timestamp: 2, body: 'Message'};
  assert.equal(session.display([{id: 'event', sender: 'peer'}]).length, 1);
  assert.equal(session.display([line, line]).length, 1);
  assert.equal(session.display([line]).length, 0);
  session.search('message', 'en');
  assert.deepEqual(session.results()?.lines, [line]);
  session.clear();
  assert.equal(session.results(), undefined);
});

test('search is literal, Turkish case aware, paged, and reports evicted matches', () => {
  const session = new ChatSession();
  session.display(Array.from({length: 12}, (_, i) =>
    ({id: String(i), sender: 'peer', timestamp: i, body: 'IŞIK [.]*'})));
  session.display([{id: 'private', sender: 'peer'}, {id: 'oversized', sender: 'peer', body: 'a'.repeat(4001)}]);
  session.search('ışık [.]*', 'tr');
  assert.equal(session.results()?.lines.length, 10);
  assert.equal(session.results(1)?.lines.length, 2);
  assert.equal(session.results(1)?.page, 2);
  session.display(Array.from({length: 200}, (_, i) => ({id: 'new' + i, sender: 'peer', body: 'different'})));
  assert.equal(session.results()?.expired, 2);
  session.search('ışık', 'tr');
  assert.equal(session.results()?.pages, 0);
});

test('a cancelled history load neither advances the cursor nor blocks a later load', async () => {
  let finish!: () => void;
  const history = new HistoryNavigator(async (_room, before) => {
    if (before) await new Promise<void>(resolve => { finish = resolve; });
    return {lines: [], next: before ? 'later' : 'first'};
  });
  await history.latest('!one');
  const scope = new AbortController();
  const load = history.older('!one', scope.signal);
  await assert.rejects(history.latest('!one'), {code: 'historyReadPending'});
  scope.abort();
  finish();
  await assert.rejects(load, {name: 'AbortError'});
  const next = history.older('!one');
  finish();
  assert.equal((await next).page, 2);
});

test('a cyclic history cursor cannot advance the navigation state', async () => {
  let next = 'first';
  const history = new HistoryNavigator(async () => ({lines: [], next}));
  await history.latest('!one');
  next = 'second';
  assert.equal((await history.older('!one')).page, 2);
  next = 'first';
  await assert.rejects(history.older('!one'), {code: 'historyCursorStalled'});
  next = 'third';
  assert.equal((await history.older('!one')).page, 3);
});

test('session unread ignores baseline, join backfill, self, and duplicates, and clears only on readable display', () => {
  const unread = new SessionUnread();
  const event = (id: string, sender = 'peer') => ({type: 'm.room.encrypted', event_id: id, sender});
  const timeline = (...events: ReturnType<typeof event>[]) => ({timeline: {events}});
  unread.observe({'!one': timeline(event('old'))}, 'self', true);
  unread.observe({'!one': timeline(event('old'), event('own', 'self'))}, 'self', false);
  assert.equal(unread.has('!one', 'peer'), false);
  unread.observe({'!two': {...timeline(event('backfill')), state: {events: [
    {type: 'm.room.member', state_key: 'self', content: {membership: 'join'}},
  ]}}}, 'self', false);
  assert.equal(unread.has('!two', 'peer'), false);
  unread.observe({'!one': timeline(event('catch-up'), event('second'))}, 'self', false);
  unread.displayed('!one', [{id: 'catch-up', body: 'shown'}, {id: 'second'}]);
  assert.equal(unread.has('!one', 'peer'), true);
  assert.equal(unread.has('!one', 'other'), false);
  unread.displayed('!one', [{id: 'second', body: 'shown'}]);
  unread.observe({'!one': timeline(event('catch-up'))}, 'self', false);
  assert.equal(unread.has('!one', 'peer'), false);
});
