import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Pair = { en: string; tr: string };
type DocumentScope = { pairs: Pair[]; bilingual: { path: string }[] };

const root = fileURLToPath(new URL('../../', import.meta.url));
const scope: DocumentScope = JSON.parse(readFileSync(new URL('./document-pairs.json', import.meta.url), 'utf8'));
const errors: string[] = [];

function markdown(text: string): string {
  let fence: string | undefined;
  return text.split(/\r?\n/).map(line => {
    if (fence) {
      const closingFence = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)?.[1];
      if (closingFence?.[0] === fence[0] && closingFence.length >= fence.length) fence = undefined;
      return '';
    }
    fence = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    return fence ? '' : line;
  }).join('\n').replace(/<!--[^]*?-->/g, '');
}

function headings(text: string): Set<string> {
  const anchors = new Set<string>();
  for (const heading of text.matchAll(/^ {0,3}#{1,6}[ \t]+(.+)$/gm)) {
    const slug = heading[1].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/ /g, '-').replace(/[^\p{L}\p{M}\p{N}_-]/gu, '');
    let anchor = slug;
    for (let index = 1; anchors.has(anchor); index++) anchor = `${slug}-${index}`;
    anchors.add(anchor);
  }
  for (const anchor of text.matchAll(/<a\s+(?:id|name)=["']([^"']+)["']/gi)) anchors.add(anchor[1]);
  return anchors;
}

function checkLink(source: string, destination: string): void {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) return;

  const [, rawPath, rawAnchor] = destination.match(/^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/)!;
  let target: string;
  let anchor: string;
  try {
    const path = decodeURIComponent(rawPath);
    target = path ? resolve(root, dirname(source), path) : resolve(root, source);
    anchor = decodeURIComponent(rawAnchor ?? '');
  } catch {
    errors.push(`${source}: invalid link encoding in ${destination}`);
    return;
  }
  const targetFromRoot = relative(root, target);
  if (targetFromRoot === '..' || targetFromRoot.startsWith(`..${sep}`) || isAbsolute(targetFromRoot)) {
    errors.push(`${source}: link leaves the repository: ${destination}`);
    return;
  }
  const info = statSync(target, { throwIfNoEntry: false });
  if (!info) {
    errors.push(`${source}: missing link target: ${destination}`);
  } else if (anchor && info.isFile() && /\.md$/i.test(target) && !headings(markdown(readFileSync(target, 'utf8'))).has(anchor)) {
    errors.push(`${source}: missing Markdown anchor: ${destination}`);
  }
}

function checkDocument(path: string, languageLinks?: string): void {
  const absolute = resolve(root, path);
  if (!statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    errors.push(`${path}: missing document`);
    return;
  }
  if (!/\.md$/i.test(path)) return;

  const text = markdown(readFileSync(absolute, 'utf8'));
  if (languageLinks) {
    const [first, second] = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (first !== languageLinks && !(first?.startsWith('# ') && second === languageLinks)) {
      errors.push(`${path}: expected ${languageLinks} at the start or immediately after the title`);
    }
  }

  // Check inline links, images and reference definitions. Ignore examples in code spans and fences.
  const prose = text.replace(/(`+)([^\n]*?)\1/g, 'code');
  const links = prose.matchAll(/\]\(\s*(?:<([^>\n]+)>|((?:[^\s()]|\([^()\n]*\))+))(?=[\s)])/g);
  const references = prose.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm);
  for (const [, angleDestination, plainDestination] of [...links, ...references]) {
    checkLink(path, angleDestination ?? plainDestination);
  }
}

function reviewPairs(base: string | undefined, head: string | undefined): void {
  if (!base && !head) return;
  let changed: Set<string>;
  try {
    if (!base || !head) throw new Error('Missing comparison ref');
    const paths = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    changed = new Set(paths.split('\0'));
  } catch {
    console.warn('::warning::Could not compare PR revisions. Review changed documents in both languages.');
    return;
  }
  for (const { en, tr } of scope.pairs) {
    if (changed.has(en) !== changed.has(tr)) {
      const [edited, counterpart] = changed.has(en) ? [en, tr] : [tr, en];
      console.warn(`::warning file=${edited}::Review the counterpart ${counterpart} and update it if the meaning changed.`);
    }
  }
}

for (const { en, tr } of scope.pairs) {
  for (const path of [en, tr]) {
    const from = resolve(root, dirname(path));
    const link = (to: string) => relative(from, resolve(root, to)).split(sep).map(encodeURIComponent).join('/');
    checkDocument(path, `[English](${link(en)}) | [Türkçe](${link(tr)})`);
  }
}
for (const { path } of scope.bilingual) checkDocument(path);
reviewPairs(process.env.HEARTWOOD_DOCS_BASE, process.env.HEARTWOOD_DOCS_HEAD);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${scope.pairs.length} documentation pairs and ${scope.bilingual.length} bilingual files.`);
}
