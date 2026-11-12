import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startLab } from '../lab/run.ts';

if (!['linux', 'win32'].includes(process.platform)) throw new Error('Run this PTY test on Windows or Linux/WSL.');
const labPython = process.env.HEARTWOOD_SYNAPSE_PYTHON;
if (!labPython) throw new Error('Set HEARTWOOD_SYNAPSE_PYTHON to the lab Python executable.');
const python = process.platform === 'win32' ? process.env.HEARTWOOD_PTY_PYTHON ?? 'python' : labPython;
const lab = await startLab(Number(process.env.HEARTWOOD_PTY_PORT ?? '18021'), true);
try {
  const child = spawn(python, ['-B', 'integration/terminal-pty.py', process.execPath, lab.origin, lab.directory], {
    stdio: 'inherit',
    env: {...process.env, HEARTWOOD_TEST_REGISTRATION_TOKEN: lab.token},
  });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await lab.stop();
}
