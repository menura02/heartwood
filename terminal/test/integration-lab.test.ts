import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const suite = fileURLToPath(new URL('../integration/synapse.test.ts', import.meta.url));
const stopBeforeNetwork = `data:text/javascript,${encodeURIComponent(`
  import childProcess from 'node:child_process';
  import { syncBuiltinESMExports } from 'node:module';
  childProcess.fork = () => { throw new Error('Unexpected fixture worker start'); };
  syncBuiltinESMExports();
  globalThis.fetch = () => { throw new Error('Unexpected network request'); };
`)}`;

test('direct integration execution rejects missing and forged lab context before starting a worker or using the network', async t => {
  for (const [label, origin] of [
    ['missing context', undefined],
    ['external target', 'https://example.invalid'],
    ['unowned loopback target', 'http://127.0.0.1:18019'],
  ] as const) {
    await t.test(label, () => {
      const env = {...process.env};
      delete env.NODE_TEST_CONTEXT;
      delete env.HEARTWOOD_TEST_ORIGIN;
      delete env.HEARTWOOD_TEST_REGISTRATION_TOKEN;
      delete env.HEARTWOOD_TEST_SERVER_LOG;
      if (origin) {
        env.HEARTWOOD_TEST_ORIGIN = origin;
        env.HEARTWOOD_TEST_REGISTRATION_TOKEN = 'synthetic-fixture';
        env.HEARTWOOD_TEST_LAB_CONTEXT = 'forged';
      }
      const result = spawnSync(process.execPath, ['--import', stopBeforeNetwork, '--test', '--test-reporter=tap', suite],
        {env, encoding: 'utf8', timeout: 15_000});
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 1);
      assert.doesNotMatch(output, /Unexpected fixture worker start|Unexpected network request/);
      assert.match(output, /Disposable Synapse test context required\. Run npm run test:integration\./);
    });
  }
});
