import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { formatError, HeartwoodError } from '../src/failures.ts';
import { selectLanguage, translator } from '../src/locale.ts';
import type { Language } from '../src/locale.ts';
import { startLab } from './run.ts';

async function run(language: Language): Promise<void> {
  if (process.platform !== 'linux') throw new HeartwoodError('demoPlatform');
  const python = process.env.HEARTWOOD_SYNAPSE_PYTHON;
  if (!python) throw new HeartwoodError('labPythonMissing');
  const closed = new AbortController();
  const cancel = () => closed.abort();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  let lab: Awaited<ReturnType<typeof startLab>> | undefined;
  try {
    lab = await startLab(Number(process.env.HEARTWOOD_DEMO_PORT ?? '18025'), true);
    if (closed.signal.aborted) return;
    const child = spawn(python, ['-B', 'integration/demo.py', process.execPath, lab.origin, lab.directory, language], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {...process.env, HEARTWOOD_TEST_REGISTRATION_TOKEN: lab.token},
    });
    let transcript = '';
    let tooLarge = false;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (tooLarge) return;
      if (transcript.length + chunk.length > 16_384) {
        tooLarge = true;
        child.kill('SIGTERM');
      } else transcript += chunk;
    });
    const stop = () => { child.kill('SIGTERM'); };
    closed.signal.addEventListener('abort', stop, {once: true});
    const timeout = setTimeout(stop, 120_000);
    try {
      const [code] = await once(child, 'close');
      if (closed.signal.aborted) return;
      if (code !== 0 || tooLarge || !transcript) throw new HeartwoodError('demoFailed');
      process.stdout.write(transcript);
    } finally {
      clearTimeout(timeout);
      closed.signal.removeEventListener('abort', stop);
    }
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    if (closed.signal.aborted) process.exitCode = 130;
    await lab?.stop();
  }
}

let language: Language = 'en';
try {
  const selected = selectLanguage(process.argv.slice(2), process.env.HEARTWOOD_LANG);
  language = selected.language;
  if (selected.args.length === 1 && selected.args[0] === '--help') {
    console.log(translator(language).text('demoHelp'));
  } else {
    if (selected.args.length) throw new HeartwoodError('demoArguments');
    await run(language);
  }
} catch (error) {
  console.error(formatError(error, language));
  process.exitCode = 1;
}
