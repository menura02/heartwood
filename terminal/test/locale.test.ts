import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { aliases, commandName, startupMode, verificationCode } from '../src/commands.ts';
import { catalog, selectLanguage } from '../src/locale.ts';
import { failureCatalog } from '../src/failures.ts';
import { labCatalog } from '../lab/messages.ts';

const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
function run(args: string[], lang?: string) {
  const env = {...process.env};
  delete env.HEARTWOOD_LANG;
  if (lang !== undefined) env.HEARTWOOD_LANG = lang;
  return spawnSync(process.execPath, [cli, ...args], {env, encoding: 'utf8'});
}

test('CLI defaults to English and explicit locale wins over environment', () => {
  const english = run(['--help']);
  assert.equal(english.status, 0);
  assert.match(english.stdout, /^Usage:/);
  assert.match(english.stdout, /\/identity/);
  const turkish = run(['--lang', 'tr', '--help'], 'en');
  assert.equal(turkish.status, 0);
  assert.match(turkish.stdout, /^Kullanım:/);
  assert.match(turkish.stdout, /\/identity/);
  assert.match(turkish.stdout, /\/kimlik/);
  assert.match(run(['--help'], 'tr').stdout, /^Kullanım:/);
  assert.match(run(['--help', '--lang', 'en'], 'invalid').stdout, /^Usage:/);
  assert.deepEqual(selectLanguage(['login', '--lang', 'tr', 'alice'], 'en'), {
    language: 'tr', args: ['login', 'alice'],
  });
});

test('invalid options and login errors are localized without echoing user data', () => {
  for (const args of [['--lang', 'private-string', '--help'], ['--lang'], ['--lang', 'en', '--lang', 'tr']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /language/i);
    assert.doesNotMatch(result.stderr, /private-string/);
  }
  assert.equal(run(['--help'], '').status, 1);
  const input = run(['--lang', 'tr', 'login', 'demo', 'http://127.0.0.1:18008', 'alice']);
  assert.equal(input.status, 1);
  assert.match(input.stderr, /etkileşimli terminal/);
});

test('all locale catalogs have matching nonempty keys and named placeholders', () => {
  const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
    .map(match => match[1]).sort();
  for (const translations of [catalog, failureCatalog, labCatalog]) {
    assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.tr).sort());
    for (const [key, english] of Object.entries(translations.en)) {
      const turkish = (translations.tr as Record<string, string>)[key];
      assert.ok(english.trim() && turkish.trim(), key);
      assert.deepEqual(placeholders(english), placeholders(turkish), key);
    }
  }
});

test('legacy aliases dispatch to the same canonical command and keep verification input strict', () => {
  for (const [canonical, legacy] of Object.entries(aliases)) {
    assert.equal(commandName(canonical), canonical);
    assert.equal(commandName(legacy), canonical);
  }
  assert.equal(commandName('/constructor'), undefined);
  assert.equal(startupMode('kayıt'), 'register');
  assert.equal(startupMode('kayit'), 'register');
  assert.equal(startupMode('giriş'), 'login');
  assert.equal(startupMode('giris'), 'login');
  for (const command of ['/verify', '/dogrula']) {
    assert.equal(verificationCode(command + ' @alice:localhost aaaa bbbb '), 'aaaa bbbb ');
  }
});
