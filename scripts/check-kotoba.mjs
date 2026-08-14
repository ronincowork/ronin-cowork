#!/usr/bin/env node
/**
 * check-kotoba — KOTOBA.md must be true about the code, not just about itself.
 *
 * check-docs asserts that prose claims about the tree resolve; this is the other
 * direction, for the one file that IS the vocabulary: a term KOTOBA presents as
 * existing structure must exist, and a [planned] marker must be telling the truth.
 * KOTOBA's own header is the law being enforced: "If a term is used in code … and it
 * is not in this file, either add it here deliberately or stop using it."
 *
 *   node scripts/check-kotoba.mjs        # standalone; also runs in `npm run verify`
 *
 * Four checks, all high-precision by design (a gate that cries wolf gets disabled):
 *
 *   1. KOSHI GHOSTS, both directions — every `koshi_<job>` KOTOBA names must exist in
 *      code, and every koshi_* token in code must appear in KOTOBA. This is the class
 *      that produced koshi_koe/koshi_summary (named, never built) and
 *      koshi_intake/koshi_helpdesk (built, never named).
 *   2. [planned] IS TRUE — a term marked [planned] must not name a shipped module
 *      (src/<term>.ts, src/<term>/, bin/<term>, public/js/<term>.js). This is the
 *      class that kept TOMODACHI marked [planned] after src/services/counting/ shipped.
 *      The check sees module names only: a thing built inside another module (SOROBAN
 *      lives in src/services/counting/) is beyond it — that limit is documented, not hidden.
 *   3. THE INTERNAL-NAMES LIST matches KOTOBA_GLOSSARY.md exactly — KOTOBA promises
 *      the glossary "repeats it verbatim and may not carry a thirteenth".
 *   4. LOAD-BEARING NOUNS HAVE ROWS — nouns that carry weight in code must be indexed.
 *      "Load-bearing" is not a mechanical property, so this is a maintained list (the
 *      koshi-model nouns today); extend it when a new subsystem coins its vocabulary.
 *
 * Exemptions mirror check-docs (owner's rulings, 2026-08-13): `>` blockquotes are
 * history; [planned] rows are exempt from existence (check 2 asserts the marker
 * itself); [proposed] rows are words under discussion, not claims.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failed++;
};
const ok = (msg) => console.log(`  ok    ${msg}`);

const kotoba = readFileSync(path.join(REPO, 'KOTOBA.md'), 'utf8');
const glossary = readFileSync(path.join(REPO, 'KOTOBA_GLOSSARY.md'), 'utf8');

// Where implementations live. The gate scripts themselves are excluded — they name
// ghost tokens in their own comments and tests.
const CODE_DIRS = ['src', 'public/js', 'bin'];
const codeFiles = [];
(function walk(rel) {
  for (const name of readdirSync(path.join(REPO, rel))) {
    const r = `${rel}/${name}`;
    const st = statSync(path.join(REPO, r));
    if (st.isDirectory()) walk(r);
    else codeFiles.push(r);
  }
})('src');
for (const d of CODE_DIRS.slice(1)) {
  (function walk(rel) {
    for (const name of readdirSync(path.join(REPO, rel))) {
      const r = `${rel}/${name}`;
      const st = statSync(path.join(REPO, r));
      if (st.isDirectory()) walk(r);
      else codeFiles.push(r);
    }
  })(d);
}
const code = codeFiles
  .map((f) => {
    try {
      return readFileSync(path.join(REPO, f), 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');

const token = (t) => new RegExp(`\\b${t}\\b`); // koshi_help must not ride on koshi_helpdesk

console.log('check-kotoba — the vocabulary is true about the code');

/* ---- 1. koshi ghosts, both directions ---- */

const claimed = new Set();
{
  let fenced = false;
  for (const line of kotoba.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*>/.test(line)) continue;
    if (line.includes('[planned]') || line.includes('[proposed]')) continue;
    for (const m of line.matchAll(/koshi_[a-z_]+/g)) claimed.add(m[0]);
  }
}
// THE FREE BUILD CAVEAT: the koshi jobs are service code and ship in RONIN_SERVICES;
// the words ship here — KOTOBA's own rule ("the word ships, the thing never does").
// A tree with no src/services/ cannot be asked to carry the jobs, so the named→code
// direction is vacuous there, not failed. code→named still holds (the 目 Koshi tab's
// own tokens must be in KOTOBA).
const servicesShip = existsSync(path.join(REPO, 'src', 'services'));
for (const t of claimed) {
  if (servicesShip && !token(t).test(code)) fail(`KOTOBA names \`${t}\` as existing, and no code has it`);
}

const inCode = new Set([...code.matchAll(/koshi_[a-z_]+/g)].map((m) => m[0]));
for (const t of inCode) {
  if (!token(t).test(kotoba)) fail(`code has \`${t}\` and KOTOBA never mentions it`);
}
ok(`koshi_* checked both ways (${claimed.size} named, ${inCode.size} in code)`);

/* ---- 2. [planned] markers are true ---- */

// Terms whose [planned] legitimately coexists with a same-named module — reason required.
const PLANNED_EXEMPT = {
  // The [planned] names the one-file-per-session TEGAMI contract; src/tegami.ts is
  // MICHI's live scrape machinery, which KOTOBA's own MICHI row calls "not unbuilt".
  tegami: 'src/services/michi/tegami.ts is the scrape, not the contract',
};

for (const line of kotoba.split('\n')) {
  if (!line.includes('[planned]') || !line.startsWith('|')) continue;
  const cell = line.split('|')[1] ?? '';
  const terms = (cell.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter(
    (t) => !(t in PLANNED_EXEMPT),
  );
  for (const t of terms) {
    const built = [`src/${t}.ts`, `src/${t}`, `bin/${t}`, `public/js/${t}.js`].find((p) =>
      existsSync(path.join(REPO, p)),
    );
    if (built) fail(`\`${cell.trim()}\` is marked [planned] but ${built} is shipped`);
  }
}
ok('[planned] rows name nothing that ships as a module');

/* ---- 3. the internal-names list matches the glossary ---- */

const nameList = (text, label) => {
  const m = text.match(/\*\*TEJUN[\s\S]*?\*\*/);
  if (!m) {
    fail(`${label}: could not find the internal-names list (looked for **TEJUN …**)`);
    return new Set();
  }
  return new Set(
    m[0]
      .replaceAll(/[>*]/g, ' ')
      .split('·')
      .map((s) => s.trim())
      .filter((s) => /^[A-Z]+$/.test(s)),
  );
};
const ours = nameList(kotoba, 'KOTOBA.md');
const theirs = nameList(glossary, 'KOTOBA_GLOSSARY.md');
for (const n of ours) if (!theirs.has(n)) fail(`internal name ${n} is in KOTOBA.md, not in KOTOBA_GLOSSARY.md`);
for (const n of theirs) if (!ours.has(n)) fail(`internal name ${n} is in KOTOBA_GLOSSARY.md, not in KOTOBA.md — "may not carry a thirteenth"`);
ok(`internal-names list agrees across both files (${ours.size} names)`);

/* ---- 4. load-bearing nouns have rows ---- */

// Maintained, not derived: nouns a subsystem's code leans on hard enough that a
// missing row means agents argue about them. src/koshi-model.ts today.
const LOAD_BEARING = ['outlet', 'incarnation', 'pace'];
const termCells = kotoba
  .split('\n')
  .filter((l) => l.startsWith('|'))
  .map((l) => (l.split('|')[1] ?? '').toLowerCase());
for (const noun of LOAD_BEARING) {
  if (!termCells.some((c) => c.includes(noun))) {
    fail(`no KOTOBA row for \`${noun}\` (load-bearing in src/koshi-model.ts)`);
  }
}
ok('load-bearing nouns are indexed');

console.log(failed ? `\ncheck-kotoba: ${failed} failure(s)\n` : '\ncheck-kotoba: all checks passed\n');
process.exit(failed ? 1 : 0);
