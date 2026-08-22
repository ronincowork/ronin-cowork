#!/usr/bin/env node
/**
 * TOMODACHI's two structural verifies, from the build-out's `record` leg.
 * Runs in `npm run verify`, so neither can rot silently.
 *
 *   1. NO ALPHA — feed real session names, project paths, wipeboard names and a git
 *      remote through the sanitiser and assert not one input substring survives.
 *   2. KOTOBA IS THE AUTHORITY — every literal in the allow-list must appear in
 *      KOTOBA.md. The list is code (see record.ts on why), and this is what keeps
 *      the code honest to the house vocabulary.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failed++;
};
const ok = (msg) => console.log(`  ok    ${msg}`);

// A CROSS-REPO CHECK, and this half is the other repo's. The sanitiser it exercises is
// TOMODACHI's — `src/services/counting/record.ts`, which ships in RONIN_SERVICES; the
// vocabulary it checks against is KOTOBA, which ships here. On a cowork-alone tree the
// subject simply is not present, so this SKIPS with its reason out loud rather than
// crashing the verify chain (BYOIN's rule: never a silent omission, never a false pass).
const RECORD = path.join(REPO, 'src/services/counting/record.ts');
if (!existsSync(RECORD)) {
  console.log('TOMODACHI — sanitiser and vocabulary');
  console.log('  SKIP  src/services/counting/record.ts is not in this tree — the free build');
  console.log('        ships no services. This check belongs to RONIN_SERVICES; run it there.');
  process.exit(0);
}

// tsx runs the TS directly — the same way the server does, no build step.
const mod = await import('tsx/esm/api').then(({ tsImport }) =>
  tsImport('../src/services/counting/record.ts', import.meta.url),
);
const { term, VOCAB, setCatalog, today } = mod;

console.log('TOMODACHI — sanitiser and vocabulary');

/* ---- 1. no alpha ---- */
setCatalog(['forkit', 'buildout', 'cutcode', 'land', 'tag', 'wipeboard', 'read', 'evaluate']);

const HOSTILE = [
  'market-identity',
  'back-harvest',
  'ad-facts',
  'calendar-cadence',
  'parserwork',
  'kojin',
  '/home/gosnond/sumo_claw/kojin',
  'git@github.com:gosmond3/tmux-ronin.git',
  'dohyo',
  'seller_labs_be',
  'my-secret-project',
];
const KINDS = [...Object.keys(VOCAB), 'macro'];

for (const input of HOSTILE) {
  for (const kind of KINDS) {
    const out = term(kind, input);
    if (out === null) continue;
    if (out === input) fail(`term('${kind}', '${input}') returned its input verbatim`);
    // No fragment of the input may survive either — not a prefix, not a path segment.
    const fragments = input.split(/[^a-zA-Z0-9]+/).filter((f) => f.length > 2);
    for (const f of fragments) {
      if (out.toLowerCase().includes(f.toLowerCase())) {
        fail(`term('${kind}', '${input}') leaked the fragment '${f}' as '${out}'`);
      }
    }
  }
}
ok(`${HOSTILE.length} hostile inputs × ${KINDS.length} kinds — nothing survived`);

// The other half: a house noun MUST survive, or the sanitiser is just a shredder.
const survives = [
  ['session_task', 'CutCode'],
  ['family_role', 'developer'],
  ['dial', 'write'],
  ['macro', 'forkit'],
  ['lock', 'unlocked'],
  ['end', 'harakiri'],
];
for (const [kind, value] of survives) {
  if (term(kind, value) !== value) fail(`term('${kind}', '${value}') should pass through unchanged`);
}
ok('house nouns pass through unchanged');

if (term('macro', 'my-own-macro') !== 'custom') fail("an unknown macro must become 'custom'");
if (term('session_task', 'Whatever') !== 'other') fail("an unknown task must become 'other'");
if (term('family_role', 'whatever') !== 'other') fail("an unknown role must become 'other'");
if (term('session_task', null) !== null) fail('null in, null out');
ok('unknown → custom / other; null → null');

/* ---- 2. KOTOBA is the authority ---- */
// The two definition DIRECTORIES, not one catalog file: since the schema cut, a role and
// a task are each one file and the filename is the token. Both the NAMES and the TEXT go
// into the haystack — the names because a token is a filename here, and the text because
// the prose the old combined catalog carried (the launch modes, the field notes) moved
// into each directory's README rather than disappearing.
const defs = (kind) => {
  const dir = path.join(REPO, 'ronin_catalogs', kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `${f.replace(/\.md$/, '')}\n${readFileSync(path.join(dir, f), 'utf8')}`)
    .join('\n');
};
const kotoba = readFileSync(path.join(REPO, 'KOTOBA.md'), 'utf8');
const haystack = kotoba + '\n' + defs('session_tasks') + '\n' + defs('family_roles');

// Two categories are deliberately NOT house vocabulary, so KOTOBA does not index them
// and checking them against it would be theatre: `model` is vendor model names, `client`
// is a device descriptor. Exempting the whole category is honest; letting an individual
// value pass on an incidental substring match elsewhere in the file is not.
const EXEMPT_KINDS = new Set(['model', 'client']);
// Bucket words we coined for the payload rather than nouns the house speaks.
const EXEMPT = new Set([
  'other', 'custom', 'hit', 'empty',
  // OBOERU's scope buckets — coined for the payload, and combinations of axis names
  // rather than nouns the house speaks in their own right.
  'root', 'role', 'task', 'root+role', 'root+task', 'root+role+task', 'universal',
]);
// Tab ids that are house surface names but not yet indexed. `stats` is registered with
// @kotoba (see the kotoba wipeboard); `hotwords` predates TOMODACHI. Remove from this list
// as KOTOBA gains the rows — that is the point of it being a list rather than a shrug.
const PENDING_KOTOBA = new Set(['stats', 'hotwords']);

for (const [kind, values] of Object.entries(VOCAB)) {
  if (EXEMPT_KINDS.has(kind)) continue;
  for (const v of values) {
    if (EXEMPT.has(v) || PENDING_KOTOBA.has(v)) continue;
    if (!haystack.includes(v)) {
      fail(`VOCAB.${kind} has '${v}', which is neither in KOTOBA.md nor a definition filename`);
    }
  }
}
ok('every allow-list literal is a documented house noun');

/* ---- 3. the day is a local date and nothing finer ---- */
const d = today(new Date(2026, 7, 9, 23, 59, 59));
if (d !== '2026-08-09') fail(`today() should be a local YYYY-MM-DD, got '${d}'`);
if (/[T:]/.test(d)) fail('today() leaked a clock');
ok('the day key is a local date, no finer');

console.log(failed ? `\nTOMODACHI: ${failed} failure(s)\n` : '\nTOMODACHI: all checks passed\n');
process.exit(failed ? 1 : 0);
