import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const env: NodeJS.ProcessEnv = {...process.env, HEARTWOOD_SYNAPSE_PYTHON: '', HEARTWOOD_LAB_ADMIN_TOKEN: ''};
delete env.HEARTWOOD_LANG;

function runLab(script: string, args: string[] = []) {
  const path = fileURLToPath(new URL('../lab/' + script, import.meta.url));
  const result = spawnSync(process.execPath, [path, ...args], {env, encoding: 'utf8', timeout: 5000});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  return result.stderr;
}

test('the lab localizes a startup error before it launches Synapse', () => {
  assert.match(runLab('run.ts'), /^Set HEARTWOOD_SYNAPSE_PYTHON /);
  assert.match(runLab('run.ts', ['--lang', 'tr']), /Python yolunu belirt\./);
});

test('the token helper localizes errors without printing a stack trace or the supplied value', () => {
  assert.equal(runLab('registration-token.ts', ['--lang', 'tr']).trim(), 'HEARTWOOD_LAB_ADMIN_TOKEN gerekli.');
  const invalid = runLab('registration-token.ts', ['--lang', 'sensitive-value']);
  assert.match(invalid, /^Invalid language selection\./);
  assert.doesNotMatch(invalid, /sensitive-value|registration-token\.ts/);
});
