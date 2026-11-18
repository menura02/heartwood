import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatSession } from '../src/chat-session.ts';
import { completeCommand, validArguments } from '../src/commands.ts';
import { HistoryNavigator } from '../src/history-navigation.ts';
import { SessionUnread } from '../src/unread.ts';
import { Heartwood } from '../src/client.ts';
import { megolm } from '../src/policy.ts';
import { RoomActivity } from '../src/room-activity.ts';

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

test('live and history reject a replacement peer in the same room without updating search or its cursor', async () => {
  const room = '!room';
  const own = '@alice:localhost';
  const original = '@bob:localhost';
  const replacement = '@carol:localhost';
  let peer = original;
  let delayHistory = false;
  let historyStarted!: () => void;
  let finishHistory!: () => void;
  const historyRequestStarted = new Promise<void>(resolve => { historyStarted = resolve; });
  const calls: Array<string | null> = [];
  const member = (user: string) => ({type: 'm.room.member', state_key: user, content: {membership: 'join'}});
  const settings = [
    ['com.heartwood.direct', {version: 1}], ['m.room.encryption', {algorithm: megolm}],
    ['m.room.join_rules', {join_rule: 'invite'}], ['m.room.history_visibility', {history_visibility: 'joined'}],
    ['m.room.create', {'m.federate': false}],
  ].map(([type, content]) => ({type, state_key: '', content}));
  const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
    identity: {user: own}, profile: {data: {blocked: []}}, sync: async () => 'anchor', activity: new RoomActivity(),
    roomState: async () => [...settings, member(own), member(peer)],
    http: {request: async (_method: string, path: string) => {
      const from = new URL(path, 'https://fixture.invalid/').searchParams.get('from');
      calls.push(from);
      if (delayHistory) {
        delayHistory = false;
        historyStarted();
        return await new Promise(resolve => {
          finishHistory = () => resolve({start: 'anchor', end: 'late', chunk: [
            {type: 'm.room.encrypted', event_id: '$replacement-late', sender: replacement, content: {}},
          ]});
        });
      }
      return {start: 'anchor', end: from === 'previous' ? 'previous2' : from === 'previous2' ? undefined : 'previous', chunk: [
        {type: 'm.room.encrypted', event_id: peer === original ? '$original' : '$replacement', sender: peer, content: {}},
      ]};
    }},
    decode: async (_room: string, sender: string, event: {event_id: string}) => ({
      id: event.event_id, sender, body: sender === original ? 'original fixture' : 'replacement fixture',
    }),
  });
  const nav = new HistoryNavigator((id, before, _signal, expectedPeer) => client.historyPage(id, before, expectedPeer));
  const session = new ChatSession();
  const live = await client.openLive(room, original);
  session.display(live.initial);
  session.display((await nav.latest(room, undefined, live.peer)).lines);
  peer = replacement;
  await assert.rejects(live.refresh(), {code: 'chatPeerChanged'});
  await assert.rejects(nav.older(room, undefined, live.peer).then(page => session.display(page.lines)),
    {code: 'chatPeerChanged'});
  session.search('replacement fixture', 'en');
  assert.deepEqual(session.results()?.lines, []);
  peer = original;
  assert.equal((await nav.older(room, undefined, live.peer)).page, 2);
  assert.deepEqual(calls, ['anchor', null, 'previous']);
  delayHistory = true;
  const delayed = nav.older(room, undefined, live.peer);
  await historyRequestStarted;
  peer = replacement;
  finishHistory();
  await assert.rejects(delayed, {code: 'chatPeerChanged'});
  session.search('replacement fixture', 'en');
  assert.deepEqual(session.results()?.lines, []);
  peer = original;
  assert.equal((await nav.older(room, undefined, live.peer)).page, 3);
  assert.deepEqual(calls, ['anchor', null, 'previous', 'previous2', 'previous2']);
  peer = replacement;
  assert.equal((await nav.latest(room)).lines[0].sender, replacement);
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

test('session unread counts peer messages after a join event in the same timeline batch', () => {
  const unread = new SessionUnread();
  unread.observe({'!joined': {timeline: {events: [
    {type: 'm.room.encrypted', event_id: '$before-join', sender: 'peer'},
    {type: 'm.room.member', state_key: 'self', content: {membership: 'join'},
      unsigned: {prev_content: {membership: 'invite'}}},
    {type: 'm.room.encrypted', event_id: '$after-join', sender: 'peer'},
  ]}}}, 'self', false);
  assert.equal(unread.has('!joined', 'peer'), true);
  unread.displayed('!joined', [{id: '$before-join', body: 'backfill'}]);
  assert.equal(unread.has('!joined', 'peer'), true);
  unread.displayed('!joined', [{id: '$after-join', body: 'visible'}]);
  assert.equal(unread.has('!joined', 'peer'), false);
});

test('live refresh skips room reads until sync reports room activity or to-device events', async () => {
  const room = '!room';
  const own = '@alice:localhost';
  const peer = '@bob:localhost';
  const activity = new RoomActivity();
  const member = (user: string) => ({type: 'm.room.member', state_key: user, content: {membership: 'join'}});
  const settings = [
    ['com.heartwood.direct', {version: 1}], ['m.room.encryption', {algorithm: megolm}],
    ['m.room.join_rules', {join_rule: 'invite'}], ['m.room.history_visibility', {history_visibility: 'joined'}],
    ['m.room.create', {'m.federate': false}],
  ].map(([type, content]) => ({type, state_key: '', content}));
  let token = 0;
  let reads = 0;
  let states = 0;
  let pendingActivity: {rooms: string[]; toDevice: boolean} | undefined;
  const client: Heartwood = Object.assign(Object.create(Heartwood.prototype), {
    identity: {user: own}, profile: {data: {blocked: []}}, activity,
    sync: async () => {
      if (pendingActivity) activity.observe(pendingActivity.rooms, pendingActivity.toDevice);
      pendingActivity = undefined;
      return 'sync' + ++token;
    },
    roomState: async () => { states++; return [...settings, member(own), member(peer)]; },
    http: {request: async () => { reads++; return {start: 'start', chunk: []}; }},
    decode: async () => undefined,
  });
  const live = await client.openLive(room, peer);
  const opened = {reads, states};
  await live.refresh();
  assert.equal(reads, opened.reads + 1, 'the first refresh reads');
  const first = {reads, states};
  await live.refresh();
  await live.refresh();
  assert.deepEqual({reads, states}, first, 'idle refreshes make no room requests');
  pendingActivity = {rooms: ['!other'], toDevice: false};
  await live.refresh();
  assert.deepEqual({reads, states}, first, 'activity in another room does not read this room');
  pendingActivity = {rooms: [room], toDevice: false};
  await live.refresh();
  assert.equal(reads, first.reads + 1, 'room activity reads the room');
  await live.refresh();
  const settled = reads;
  await live.refresh();
  assert.equal(reads, settled, 'refreshes become idle again');
  pendingActivity = {rooms: [], toDevice: true};
  await live.refresh();
  assert.equal(reads, settled + 1, 'to-device events retry pending decryption');
});

test('room activity marks change on room updates, key delivery, and eviction', () => {
  const activity = new RoomActivity();
  const idle = activity.mark('!quiet');
  activity.observe(['!busy'], false);
  assert.equal(activity.mark('!quiet'), idle);
  const busy = activity.mark('!busy');
  activity.observe([], true);
  assert.notEqual(activity.mark('!busy'), busy);
  assert.notEqual(activity.mark('!quiet'), idle);
  const quiet = activity.mark('!quiet');
  activity.observe(Array.from({length: 257}, (_, i) => '!room' + i), false);
  assert.notEqual(activity.mark('!quiet'), quiet);
});
