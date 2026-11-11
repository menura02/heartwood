import assert from 'node:assert/strict';
import test from 'node:test';
import { HistoryNavigator } from '../src/history-navigation.ts';
import type { HistoryPage } from '../src/history.ts';

test('rooms have separate cursors and latest resets only its room', async () => {
  const calls: Array<[string, string | undefined]> = [];
  const nav = new HistoryNavigator(async (room, before) => {
    calls.push([room, before]);
    return {lines: [], next: before ? undefined : room + '1'};
  });
  assert.deepEqual(await nav.latest('a'), {lines: [], hasMore: true, page: 1});
  assert.equal((await nav.latest('b')).page, 1);
  assert.deepEqual(await nav.older('a'), {lines: [], hasMore: false, page: 2});
  await assert.rejects(nav.older('a'), /Daha eski olay yok/);
  assert.equal((await nav.latest('a')).page, 1);
  assert.equal((await nav.older('b')).page, 2);
  assert.deepEqual(calls, [['a', undefined], ['b', undefined], ['a', 'a1'], ['a', undefined], ['b', 'b1']]);
});

test('failed latest and older reads retain the last successful cursor and page', async () => {
  const replies = ['a1', new Error('HTTP'), new Error('HTTP'), undefined];
  const calls: Array<string | undefined> = [];
  const nav = new HistoryNavigator(async (_room, before) => {
    calls.push(before);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return {lines: [], next};
  });
  await nav.latest('a');
  await assert.rejects(nav.older('a'), /HTTP/);
  await assert.rejects(nav.latest('a'), /HTTP/);
  assert.equal((await nav.older('a')).page, 2);
  assert.deepEqual(calls, [undefined, 'a1', undefined, 'a1']);
});

test('an empty intermediate page advances to its replacement cursor', async () => {
  const line = {id: '$old', sender: '@bob:localhost', body: 'Eski mesaj'};
  const calls: Array<string | undefined> = [];
  const nav = new HistoryNavigator(async (_room, before) => {
    calls.push(before);
    if (before === undefined) return {lines: [line], next: 'a1'};
    if (before === 'a1') return {lines: [], next: 'a2'};
    return {lines: [line], next: undefined};
  });
  await nav.latest('a');
  assert.deepEqual(await nav.older('a'), {lines: [], hasMore: true, page: 2});
  assert.deepEqual(await nav.older('a'), {lines: [line], hasMore: false, page: 3});
  assert.deepEqual(calls, [undefined, 'a1', 'a2']);
});

test('starting and overlapping reads are guarded and failure releases the lock', async () => {
  const pending = Promise.withResolvers<HistoryPage>();
  let calls = 0;
  const nav = new HistoryNavigator(async () => {
    if (++calls === 1) return pending.promise;
    return {lines: []};
  });
  await assert.rejects(nav.older('a'), /Önce \/gecmis !oda ile geçmişi aç/);
  const reading = nav.latest('a');
  await assert.rejects(nav.latest('a'), /bekliyor/);
  await assert.rejects(nav.older('a'), /bekliyor/);
  pending.reject(new Error('HTTP'));
  await assert.rejects(reading, /HTTP/);
  assert.equal((await nav.latest('a')).page, 1);
  assert.equal(calls, 2);
});
