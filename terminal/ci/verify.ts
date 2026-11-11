import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const terminal = fileURLToPath(new URL('../', import.meta.url));
const lab = join(terminal, '.lab');
await mkdir(lab, {recursive: true});
const temp = await mkdtemp(join(lab, 'verify-'));
try {
  for (const args of [['node_modules/typescript/bin/tsc', '--noEmit'], ['--test', 'test/*.test.ts']]) {
    const child = spawn(process.execPath, args, {cwd: terminal, stdio: 'inherit',
      env: {...process.env, TEMP: temp, TMP: temp, TMPDIR: temp}});
    const [code] = await once(child, 'exit');
    if (code !== 0) {
      process.exitCode = code ?? 1;
      break;
    }
  }
} finally {
  await rm(temp, {recursive: true, force: true});
}
