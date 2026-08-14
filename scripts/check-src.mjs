#!/usr/bin/env node
/**
 * Line ceiling on src/ — the server's half of the rule check-modules holds for the client.
 *
 *   node scripts/check-src.mjs
 *
 * The monolith regrows wherever no gate holds. The client's ~700-line rule has been
 * enforced since BUNKAI; src/ had no equivalent, which is how index.ts reached 1,886
 * lines (63 routes, both ws bridges, the lookup resolver and the tape-streaming engine
 * in one file) while the client stayed split. Same number for both sides: past ~700
 * lines, split it.
 *
 * THE RATCHET. Files already in breach are grandfathered AT THEIR CURRENT SIZE, recorded
 * below, and frozen at their worst:
 *
 *   - a grandfathered file may never GROW past its record, so the bleeding stops the
 *     day this gate lands, before any extraction;
 *   - the record must FOLLOW THE FILE DOWN — if the file shrinks below its record, this
 *     gate fails until the record is lowered in the same commit, so every extraction
 *     permanently banks its gains (the check-stores "two lists must agree" pattern);
 *   - a record at or under the ceiling, or naming a file that no longer exists, must be
 *     deleted.
 *
 * Growing a grandfathered file is therefore never a warning — the choices are extract
 * first, or offset the addition with a deletion. That is the point.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CEILING = 700;

/** Grandfathered breaches, frozen at their worst. Keys are paths relative to src/.
 *
 * EMPTY, and it got there the honest way: both entries were service files, and the
 * split moved src/services/ out of this repo on 2026-08-14 — they are RONIN_SERVICES'
 * ceiling to keep now. Nothing in cowork's src/ breaches 700 lines. An entry added
 * here is a debt with a number on it; the list only shrinks. */
const GRANDFATHERED = {};

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) files.push(p);
  }
})(SRC);

const problems = [];
const seen = new Set();

for (const f of files) {
  const rel = path.relative(SRC, f);
  seen.add(rel);
  // wc -l semantics (newline count), so a record can be checked by eye with wc.
  const lines = (fs.readFileSync(f, 'utf8').match(/\n/g) ?? []).length;
  const record = GRANDFATHERED[rel];
  const limit = record ?? CEILING;
  if (lines > limit) {
    problems.push(
      record
        ? `src/${rel} is ${lines} lines — past its grandfathered record of ${record}. It may not grow: extract first, or offset with a deletion.`
        : `src/${rel} is ${lines} lines — past the ${CEILING}-line ceiling. Split it.`,
    );
  } else if (record !== undefined && lines <= CEILING) {
    problems.push(`src/${rel} is ${lines} lines — under the ceiling. Delete its grandfather entry in scripts/check-src.mjs.`);
  } else if (record !== undefined && lines < record) {
    problems.push(`src/${rel} shrank to ${lines} lines but its record says ${record}. Ratchet the record down in this commit.`);
  }
}

for (const rel of Object.keys(GRANDFATHERED)) {
  if (!seen.has(rel)) problems.push(`grandfather entry 'src/${rel}' names a file that no longer exists. Delete the entry.`);
}

console.log(`checked ${files.length} file(s) in src/`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nFAILED — ${problems.length} ceiling problem(s). The rule and the ratchet: header of this file.`);
  process.exit(1);
}
const gf = Object.keys(GRANDFATHERED).length;
console.log(`  ok — every file under its ceiling (${CEILING}; ${gf} grandfathered, frozen at their worst)`);
