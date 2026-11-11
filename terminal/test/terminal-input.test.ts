import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { TerminalInput } from '../src/terminal-input.ts';

test('split paste markers preserve Unicode and reject a multiline paste in full', async () => {
  let rejected = 0;
  const input = new TerminalInput(() => {}, () => rejected++);
  const received: Buffer[] = [];
  input.on('data', chunk => received.push(chunk));
  const ended = once(input, 'end');
  input.write('hi\x1b[20');
  input.write('0~');
  const unicode = Buffer.from('çığ 🚲');
  input.write(unicode.subarray(0, unicode.length - 2));
  input.write(unicode.subarray(unicode.length - 2));
  input.write('\x1b[201~\r');
  input.write('\x1b[200~first\n/cikis\x1b[201~');
  input.end();
  await ended;
  assert.equal(Buffer.concat(received).toString(), 'hiçığ 🚲\r');
  assert.equal(rejected, 1);
});

test('a delayed paste prefix still protects embedded commands', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let rejected = 0;
  const input = new TerminalInput(() => {}, () => rejected++);
  const chunks: Buffer[] = [];
  input.on('data', chunk => chunks.push(chunk));
  const ended = once(input, 'end');
  input.write('\x1b[20');
  t.mock.timers.tick(1000);
  input.end('0~message\n/cikis\x1b[201~');
  await ended;
  assert.equal(Buffer.concat(chunks).toString(), '');
  assert.equal(rejected, 1);
});
