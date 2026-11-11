import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startLab } from '../lab/run.ts';

const lab = await startLab(Number(process.env.HEARTWOOD_TEST_PORT ?? '18019'), true);
try {
  const temp = join(lab.directory, 'temp');
  await mkdir(temp);
  const child = spawn(process.execPath, ['--test', 'integration/synapse.test.ts'], {
    stdio: 'inherit',
    env: {...process.env, TEMP: temp, TMP: temp, TMPDIR: temp,
      HEARTWOOD_TEST_ORIGIN: lab.origin, HEARTWOOD_TEST_REGISTRATION_TOKEN: lab.token,
      HEARTWOOD_TEST_SERVER_LOG: lab.logPath},
  });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await lab.stop();
}
