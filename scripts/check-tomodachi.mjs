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
import { readFileSync } from 'node:fs';
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
  ['session_job', 'CutCode'],
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
if (term('session_job', 'Whatever') !== 'other') fail("an unknown job must become 'other'");
if (term('session_job', null) !== null) fail('null in, null out');
ok('unknown → custom / other; null → null');

/* ---- 2. KOTOBA is the authority ---- */
const kotoba = readFileSync(path.join(REPO, 'KOTOBA.md'), 'utf8');
const jobs = readFileSync(path.join(REPO, 'tejun_catalogs', 'SESSION_JOBS.md'), 'utf8');
const haystack = kotoba + jobs;

// Two categories are deliberately NOT house vocabulary, so KOTOBA does not index them
// and checking them against it would be theatre: `model` is vendor model names, `client`
// is a device descriptor. Exempting the whole category is honest; letting an individual
// value pass on an incidental substring match elsewhere in the file is not.
const EXEMPT_KINDS = new Set(['model', 'client']);
// Bucket words we coined for the payload rather than nouns the house speaks.
const EXEMPT = new Set(['other', 'custom', 'root', 'job', 'root+job', 'universal', 'hit', 'empty']);
// Tab ids that are house surface names but not yet indexed. `stats` is registered with
// @kotoba (see the kotoba wipeboard); `hotwords` predates TOMODACHI. Remove from this list
// as KOTOBA gains the rows — that is the point of it being a list rather than a shrug.
const PENDING_KOTOBA = new Set(['stats', 'hotwords']);

for (const [kind, values] of Object.entries(VOCAB)) {
  if (EXEMPT_KINDS.has(kind)) continue;
  for (const v of values) {
    if (EXEMPT.has(v) || PENDING_KOTOBA.has(v)) continue;
    if (!haystack.includes(v)) fail(`VOCAB.${kind} has '${v}', which appears in neither KOTOBA.md nor SESSION_JOBS.md`);
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
