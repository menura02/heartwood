import assert from 'node:assert/strict';
import test from 'node:test';
import { readHistoryPage } from '../src/history.ts';

const room = '!room/+?:localhost';
const event = (id: string) => ({type: 'm.room.encrypted', event_id: id, sender: '@bob:localhost', content: {}});

test('backward page encodes the room and cursor and reverses a copy', async () => {
  const events = [event('$3'), event('$2'), event('$1')];
  const page = await readHistoryPage(async path => {
    const url = new URL(path, 'https://fixture.invalid/');
    assert.equal(url.pathname, '/rooms/!room%2F%2B%3F%3Alocalhost/messages');
    assert.equal(url.searchParams.get('dir'), 'b');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('from'), 'cursor/+?=');
    return {start: 'cursor/+?=', end: 'older', chunk: events};
  }, room, 'cursor/+?=');
  assert.deepEqual(page.events.map(e => e.event_id), ['$1', '$2', '$3']);
  assert.equal(page.next, 'older');
  assert.deepEqual(events.map(e => e.event_id), ['$3', '$2', '$1']);
});

test('first page has no from and an empty chunk may have a continuation', async () => {
  const page = await readHistoryPage(async path => {
    assert.equal(new URL(path, 'https://fixture.invalid/').searchParams.has('from'), false);
    return {chunk: [], start: 'a', end: 'b'};
  }, room);
  assert.deepEqual(page, {events: [], next: 'b'});
  const last = await readHistoryPage(async () => ({chunk: [event('$1')], start: 'b'}), room, 'b');
  assert.equal(last.next, undefined);
});

test('invalid pages and a stationary cursor are rejected', async () => {
  for (const response of [
    {chunk: {}, start: 'a'}, {chunk: [], start: ''}, {chunk: [], start: 'a', end: ''},
    {chunk: [], start: 'a', end: 'a'}, {chunk: [{...event('$1'), sender: 3}], start: 'a'},
    {chunk: [{...event('$1'), content: []}], start: 'a'},
  ]) await assert.rejects(readHistoryPage(async () => response, room, 'a'));
});
