import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startLab } from '../lab/run.ts';

if (process.platform !== 'linux') throw new Error('Run this PTY test on Linux or WSL.');
const python = process.env.HEARTWOOD_SYNAPSE_PYTHON;
if (!python) throw new Error('Set HEARTWOOD_SYNAPSE_PYTHON to the lab Python executable.');
const lab = await startLab(Number(process.env.HEARTWOOD_PTY_PORT ?? '18021'), true);
try {
  const child = spawn(python, ['integration/terminal-pty.py', process.execPath, lab.origin, lab.directory], {
    stdio: 'inherit',
    env: {...process.env, HEARTWOOD_TEST_REGISTRATION_TOKEN: lab.token},
  });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await lab.stop();
}
