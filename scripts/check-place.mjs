#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failed++; };
const ok = (msg) => console.log(`  ok    ${msg}`);

const { STORES } = await tsImport('../src/stores.ts', import.meta.url);

const ALLOW = {
  'README.md': 'the install commands a person types before ronin-store exists',
  'src/stores.ts': 'the table itself',
  'bin/ronin-store': 'the bash binding of the table',
  'scripts/ronin-uninstall': 'must work when the install is broken or gone, so it carries the defaults ronin-store would have answered',
  'scripts/check-place.mjs': 'this file',
  'docs/stores.md': 'the contract — the one place allowed to show the layout',
  'DAIKUSAN.md': 'the map of what ships and what accumulates',
  'CLAUDE.local.md': "this box's own deployment record, and old dohyo as history",
  'scripts/check-tomodachi.mjs': 'hostile inputs — the literals are the test data',
};

const HOME_RONIN = /(?:~|\$HOME|\$\{HOME\})\/\.?ronin(?:_[A-Za-z0-9_.-]+|\/[A-Za-z0-9_./-]*|\b)/i;

const ABS_HOME = /\/(?:home|Users)\/[a-z_][a-z0-9_-]*/i;
const HOSTNAME = /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i;
const IPV4 = /\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b|255\.255\.255\.255\b)(?:\d{1,3}\.){3}\d{1,3}\b/;

function walk(rel, out, skip = new Set(['node_modules', '.git', 'dist', 'public-staging'])) {
  let entries;
  try { entries = readdirSync(path.join(REPO, rel)); } catch { return out; }
  for (const name of entries) {
    if (skip.has(name)) continue;
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(path.join(REPO, r)).isDirectory()) walk(r, out, skip);
    else out.push(r);
  }
  return out;
}

const CODE = [
  ...walk('src', []),
  ...walk('public/js', []),
  ...walk('bin', []),
  ...walk('scripts', []),
  ...walk('deploy', []),
  'setup.sh',
  'package.json',
].filter((f) => !/\.(md|png|jpg|svg)$/i.test(f));

const PROSE = [
  ...walk('docs', []),
  ...walk('reading-list', []),
  ...walk('ronin_catalogs', []),
  'CLAUDE.md',
  'README.md',
  'DAIKUSAN.md',
  'DOCS.md',
].filter((f) => /\.md$/i.test(f));

const isHistory = (line) => /^\s*>/.test(line);

function scan(files, checks) {
  for (const file of files) {
    if (ALLOW[file]) continue;
    let text;
    try { text = readFileSync(path.join(REPO, file), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, i) => {
      if (isHistory(line)) return;
      for (const [re, what] of checks) {
        const m = re.exec(line);
        if (m) {
          fail(`${file}:${i + 1} — ${what}: \`${m[0].trim()}\`\n         ${line.trim().slice(0, 110)}`);
          break; // one finding per line; fix it and the next one surfaces
        }
      }
    });
  }
}

console.log('check-place — nothing names a machine, a person, or a place\n');

scan(CODE, [
  [ABS_HOME, 'an absolute home directory — delete it, it resolves on no machine'],
  [HOSTNAME, 'a hostname — resolve it at runtime, the way libexec/ronin-gate does'],
  [IPV4, 'a machine address — resolve it at runtime'],
  [HOME_RONIN, "a Ronin location — ask for it: storeDir('<id>') or \"$(ronin-store <id>)\""],
]);
scan(PROSE, [
  [HOME_RONIN, 'a Ronin location — name the store, not the path (docs/stores.md)'],
]);

console.log('');
if (failed) {
  console.error(`check-place: ${failed} finding(s). The rule is docs/stores.md: resolve, inject, or delete.\n`);
  process.exit(1);
}
ok(`${CODE.length} code files and ${PROSE.length} documents name no machine, person or place`);
console.log('\ncheck-place: clean.\n');
