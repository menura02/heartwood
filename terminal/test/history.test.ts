import assert from 'node:assert/strict';
import test from 'node:test';
import { readForwardPage, readHistoryPage } from '../src/history.ts';

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

test('history validates encrypted event identifiers and timestamps while retaining extension events', async () => {
  const extension = {type: 'com.example.custom', content: {more: null}};
  const encrypted = {...event('$2'), origin_server_ts: 1700000000000};
  const request = (chunk: unknown[]) => readHistoryPage(async () => ({start: 'a', chunk}), room);
  assert.deepEqual((await request([encrypted, extension])).events, [extension, encrypted]);
  for (const invalid of [{...encrypted, event_id: 'missing-sigil'}, {...encrypted, sender: undefined},
    {...encrypted, sender: '@alice:example.invalid/path'}, {...encrypted, origin_server_ts: 1.5}]) {
    await assert.rejects(request([extension, invalid]), {code: 'invalidHistoryPage'});
  }
});

test('history limits opaque cursors by UTF-8 bytes before requesting or storing a page', async () => {
  const boundary = 'ş'.repeat(512);
  const large = boundary + 'x';
  const received = await readHistoryPage(async path => {
    assert.equal(new URL(path, 'https://fixture.invalid/').searchParams.get('from'), boundary);
    return {start: boundary, end: 'next', chunk: []};
  }, room, boundary);
  assert.equal(received.next, 'next');
  for (const [start, end] of [[large, 'next'], ['start', large], ['start', 'a'.repeat(1025)]]) {
    await assert.rejects(readHistoryPage(async () => ({start, end, chunk: []}), room), {code: 'invalidHistoryPage'});
  }
  let requests = 0;
  const request = async () => { requests++; return {start: 'a', chunk: []}; };
  await assert.rejects(readHistoryPage(request, room, large), {code: 'invalidHistoryPage'});
  await assert.rejects(readHistoryPage(request, room, '\uD800'), {code: 'invalidHistoryPage'});
  await assert.rejects(readForwardPage(request, room, large, 'b'), {code: 'invalidHistoryPage'});
  await assert.rejects(readForwardPage(request, room, 'a', large), {code: 'invalidHistoryPage'});
  await assert.rejects(readForwardPage(request, room, large, large), {code: 'invalidHistoryPage'});
  assert.equal(requests, 0);
});
