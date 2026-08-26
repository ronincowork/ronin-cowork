#!/usr/bin/env node
/**
 * check-lexicon — the floor is complete, and no lexicon spells a key nobody reads.
 *
 *   node scripts/check-lexicon.mjs
 *
 * Three findings, two of them fatal:
 *
 *   FAIL  a key the client reads (`t('key', …)` in public/js)
 *         is missing from `ronin_catalogs/lexicons/professional_en.md` — the floor is
 *         complete BY DEFINITION, so this is the build's mistake, in the same commit as
 *         the view that added the key.
 *   FAIL  a shipped lexicon other than the floor carries a bare key the floor does not
 *         — a typo, since every word has to fall through to something. Prefixed keys
 *         (`kind.*`, `role.*`, `team_role.*`, `behaviour.*`) are exempt: they name
 *         catalog tokens, and the definition's own label is their floor.
 *   note  keys the floor carries that no view reads yet — allowed, because the surfaces
 *         that will read them (the campaign board) are not built; reported so the list
 *         cannot rot in silence.
 *
 * No sweep, by ruling (2026-08-27): a view that still holds its strings as literals is
 * not a finding here. This checks what IS read through `t()`, nothing about what is not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'public', 'js');
const LEX = path.join(ROOT, 'ronin_catalogs', 'lexicons');
const FLOOR = 'professional_en';
const FIELDS = new Set(['label', 'blurb', 'base', 'order', 'hidden']);
const PREFIXED = /^(kind|role|team_role|behaviour)\./;

const keysOf = (file) => {
  const out = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^-\s*\*\*([\w.-]+):\*\*/.exec(line.trim());
    if (m && !FIELDS.has(m[1])) out.add(m[1]);
  }
  return out;
};

const lexicons = fs.readdirSync(LEX).filter((f) => f.endsWith('.md') && f !== 'README.md');
const floor = keysOf(path.join(LEX, `${FLOOR}.md`));

// What the client reads: t('key' …) with a literal first argument.
const read = new Set();
for (const f of fs.readdirSync(JS).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(JS, f), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([\w.-]+)'/g)) read.add(m[1]);
}

const fails = [];
for (const k of read) if (!PREFIXED.test(k) && !floor.has(k)) fails.push(`the client reads \`${k}\` and ${FLOOR}.md does not carry it`);
for (const f of lexicons) {
  const name = f.replace(/\.md$/, '');
  if (name === FLOOR) continue;
  for (const k of keysOf(path.join(LEX, f))) {
    if (!PREFIXED.test(k) && !floor.has(k)) fails.push(`${f} spells \`${k}\`, which ${FLOOR}.md does not carry — nothing to fall through to`);
  }
}
const unread = [...floor].filter((k) => !read.has(k) && !PREFIXED.test(k));

for (const line of fails) console.log(`  FAIL  ${line}`);
if (unread.length) console.log(`  note  ${unread.length} floor key(s) no view reads yet: ${unread.join(', ')}`);
console.log(fails.length ? `check-lexicon: ${fails.length} failure(s)` : `check-lexicon: the floor holds (${floor.size} keys, ${read.size} read by the client, ${lexicons.length} lexicons)`);
process.exit(fails.length ? 1 : 0);
