import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveTimeline } from '../src/live-timeline.ts';
import { readForwardPage } from '../src/history.ts';
import type { HistoryEvent } from '../src/history.ts';

const event = (n: number) => ({type: 'm.room.encrypted', event_id: '$' + n, content: {}});
const decode = async (event: HistoryEvent) => ({id: event.event_id!, sender: '@peer:localhost', body: event.event_id});

test('live catch-up advances across 120 events, overlap and an empty page', async () => {
  const timeline = new LiveTimeline('anchor');
  await timeline.initial([event(0)], decode);
  const pages = [
    {events: [], next: 'empty'},
    {events: Array.from({length: 50}, (_, i) => event(i)), next: 'p1'},
    {events: Array.from({length: 50}, (_, i) => event(i + 50)), next: 'p2'},
    {events: Array.from({length: 21}, (_, i) => event(i + 100)), next: 'end'},
  ];
  const result: string[] = [];
  const cursors: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const lines = await timeline.poll(async cursor => {
      cursors.push(cursor);
      return pages[i];
    }, decode);
    result.push(...lines.map(line => line.id));
  }
  assert.deepEqual(cursors, ['anchor', 'empty', 'p1', 'p2']);
  assert.deepEqual(result, Array.from({length: 120}, (_, i) => '$' + (i + 1)));
});

test('failed and repeated cursors preserve position and unresolved events can recover', async () => {
  const timeline = new LiveTimeline('a');
  await timeline.initial([event(1)], async () => ({id: '$1', sender: '@peer:localhost'}));
  await assert.rejects(timeline.poll(async () => { throw new Error('network'); }, decode), /network/);
  await assert.rejects(timeline.poll(async () => ({events: [], next: 'a'}), decode), {code: 'liveCursorStalled'});
  assert.deepEqual(await timeline.poll(async cursor => {
    assert.equal(cursor, 'a');
    return {events: [], next: 'b'};
  }, decode), [await decode(event(1))]);
});

test('forward page uses Matrix bounds and keeps event order', async () => {
  const result = await readForwardPage(async path => {
    const {searchParams} = new URL(path, 'https://fixture.invalid/');
    assert.equal(searchParams.get('dir'), 'f');
    assert.equal(searchParams.get('from'), 'a/+');
    assert.equal(searchParams.get('to'), 'b/+');
    return {start: 'a/+', chunk: [event(1), event(2)]};
  }, '!room:localhost', 'a/+', 'b/+');
  assert.deepEqual(result, {events: [event(1), event(2)], next: 'b/+'});
});

test('overlapping reads are rejected and only the first result advances the cursor', async () => {
  const timeline = new LiveTimeline('start');
  const delayed = Promise.withResolvers<{events: HistoryEvent[]; next: string}>();
  const first = timeline.poll(() => delayed.promise, decode);
  await assert.rejects(timeline.poll(async () => ({events: [], next: 'other'}), decode), {code: 'liveReadPending'});
  delayed.resolve({events: [event(1)], next: 'next'});
  assert.deepEqual(await first, [await decode(event(1))]);
  await timeline.poll(async cursor => {
    assert.equal(cursor, 'next');
    return {events: []};
  }, decode);
});
