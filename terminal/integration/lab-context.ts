import { startLab } from '../lab/run.ts';

type Lab = Awaited<ReturnType<typeof startLab>>;

let active: Lab | undefined;

export function requireDisposableLab(): Pick<Lab, 'origin' | 'token' | 'logPath' | 'directory'> {
  if (!active) throw new Error('Disposable Synapse test context required. Run npm run test:integration.');
  return active;
}

export async function withDisposableLab(port: number, run: (lab: Lab) => Promise<void>): Promise<void> {
  const lab = await startLab(port, true);
  active = lab;
  try { await run(lab); }
  finally {
    active = undefined;
    await lab.stop();
  }
}
