import { pipeline } from 'node:stream/promises';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { fileURLToPath } from 'node:url';
import { withDisposableLab } from './lab-context.ts';

const shutdown = new AbortController();
const interrupt = (signal: NodeJS.Signals) => {
  process.exitCode = signal === 'SIGINT' ? 130 : 143;
  shutdown.abort();
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  await withDisposableLab(Number(process.env.HEARTWOOD_TEST_PORT ?? '18019'), async lab => {
    if (shutdown.signal.aborted) return;
    void lab.exited.then(() => shutdown.abort());
    let passed = false;
    const tests = run({
      files: [fileURLToPath(new URL('./synapse.test.ts', import.meta.url))],
      // Share only the launcher-created, process-local lab context with the test file.
      isolation: 'none',
      signal: shutdown.signal,
      setup: reporter => {
        reporter.on('test:summary', ({success, counts}) => {
          passed = success && counts.passed > 0;
        });
      },
    });
    await pipeline(tests.compose(spec), process.stdout, {end: false});
    if (!passed && !process.exitCode) process.exitCode = 1;
  });
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
