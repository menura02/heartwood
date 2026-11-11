import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatFeed } from '../src/chat-feed.ts';

test('live chat prints each event once and can recover a previously unreadable message', () => {
  const feed = new ChatFeed();
  const unreadable = {id: '$1', sender: '@bob:localhost'};
  const received = {...unreadable, body: 'Merhaba'};
  const sameText = {...received, id: '$2'};
  assert.deepEqual(feed.update([unreadable]), [unreadable]);
  assert.deepEqual(feed.update([unreadable]), []);
  assert.deepEqual(feed.update([received, sameText]), [received, sameText]);
  assert.deepEqual(feed.update([received, sameText]), []);
});
