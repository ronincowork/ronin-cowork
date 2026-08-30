#!/usr/bin/env node
/**
 * check-dead — deletions get a detector.
 *
 *   node scripts/check-dead.mjs                    # gate public/
 *   node scripts/check-dead.mjs public-staging     # gate a staged client instead
 *
 * Every big deletion in this repo left orphans in code: dead exports, DOM lookups
 * hunting ids no markup has, CSS for elements that no longer exist. Nothing in this
 * stack notices on its own — there is no bundler and no tree-shaker, the browser
 * loads whatever is there, `node --check` parses it, and tsc never sees `public/`.
 * This script is the thing that notices. The rule it enforces:
 *
 *   A DELETION IS NOT DONE UNTIL CHECK-DEAD IS QUIET.
 *
 * Four checks, all high-precision (a false positive kills a check faster than a
 * false negative — anything uncertain is skipped, not guessed at):
 *
 *   1. public/js/  — exports no other module imports AND the defining module never
 *                    uses itself (module graph shared with check-modules via
 *                    lib/js-parse.mjs)
 *   2. src/        — value exports (function/const/class/let) dead by the same
 *                    test; type/interface exports are deliberately out (zero
 *                    runtime cost, and internal-use types would flood it)
 *   3. public/js/  — getElementById / querySelector('#…') ids that exist neither
 *                    in index.html nor as a JS-assigned id
 *   4. style.css   — #id selectors dead by the same test
 *
 * What it deliberately does NOT catch:
 *   - code that is reachable but semantically dead — e.g. a ws-protocol branch no
 *     client sends anymore. That takes a human reading both halves of the
 *     protocol; this script only finds the static half once the other half goes.
 *   - a vestigial `export` keyword on a name the file itself still uses — the
 *     code is alive, only the keyword is stale, and flagging those buried the
 *     four real corpses under 68 lines of noise on this script's first run.
 *   - a dead function that references itself (recursion counts as a use). Rare
 *     enough to accept for the precision the same-file test buys everywhere else.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { noComments, codeOnly, parseImports, parseExports } from './lib/js-parse.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The client root can be swapped for public-staging/ — the stage-first flow needs the
// gate on the candidate, not only on what is already live.
const PUB = path.resolve(ROOT, process.argv[2] || 'public');
const JS = path.join(PUB, 'js');
const PUBREL = path.relative(ROOT, PUB) || '.';
const problems = [];

/* ---------------- ignore lists — every entry must carry its argument ---------------- */

// src/ files executed directly (npm start, libexec/koshi, bin/bench, ronin_bin/tejun-rireki run
// them via tsx). Their exports are entry points, not API — nobody imports an entry.
const SRC_ENTRY_FILES = new Set(['index.ts', 'koshi.ts', 'bench.ts', 'scroll-cli.ts']);

// src/ value exports the first run (2026-08-13) found dead that are NOT in the batch
// Empty, and that is the point. It held thirteen names for one day — the parked DVR
// and warm-delete machinery, waiting on a delete-or-keep ruling. The owner ruled on
// 2026-08-13: **delete. We don't keep.** Every name went with its code, and two of the
// thirteen (`currentFaults`, `clearFaults`) turned out to name nothing at all — the
// ignore list had itself gone stale in a day, which is the argument against ignore
// lists in one line.
//
// A name added here needs a reason beside it AND a line in co-working/user_repo/
// BROKEN.md, because an entry here is a fault held open, not a fault fixed. THIS LIST
// MUST ONLY EVER SHRINK. Parked code is not kept alive by an exemption: the tape is in
// git, and reviving a plan means writing it against the tree that exists then.
const SRC_EXPORT_IGNORE = new Set([]);

// THE CONNECTOR SURFACE — and why it is a marker, not a list.
//
// cowork exports things only RONIN_SERVICES imports: the stock-catalog dir KOE reads,
// the counting sink the assembler wires, the raw-keys path a tape-fed tile types
// through. This repo cannot see those callers, so every one of them reads as dead here
// — six of them did, and a byoin_check that always fails is a byoin_check nobody runs.
//
// The fix is NOT another ignore list (this file's own argument: a list goes stale in a
// day and holds faults open). It is a marker in the doc block, `@service`, which says
// out loud what the export is FOR and travels with the code when it moves. An export
// nothing here imports and nothing there needs simply has no marker, and still dies.
// KYOKAI is the umbrella over this boundary; docs/connector-contract.md is the contract.
const SERVICE_MARK = /@service\b/;

// public/js/ exports allowed to have no importer. Empty today; a name added here
// needs a reason on its line, e.g. kept for the devtools console.
const JS_EXPORT_IGNORE = new Set([]);

// DOM ids looked up in JS that this check cannot see being created. Empty today —
// every dynamic id is a literal `.id = '…'` assignment, which the harvest below finds.
const ID_LOOKUP_IGNORE = new Set([]);

// CSS #ids allowed without a live element. Empty today.
const CSS_ID_IGNORE = new Set([]);

/* ---------------- check 1: public/js exports nobody imports ---------------- */

// A name is dead only when nobody imports it AND its own file never uses it past
// the declaration: one \b-match is the declaration itself, a second is a use.
const usedInOwnFile = (code, name) => (code.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length > 1;

const mod = {};
for (const f of fs.readdirSync(JS).filter((f) => f.endsWith('.js'))) {
  const raw = fs.readFileSync(path.join(JS, f), 'utf8');
  const src = noComments(raw);
  mod[f.replace(/\.js$/, '')] = { raw, code: codeOnly(raw), imports: parseImports(src), exports: parseExports(src) };
}
const importedFrom = {}; // module name -> Set of names some other module imports from it
for (const m of Object.values(mod)) {
  for (const imp of m.imports) {
    (importedFrom[imp.from] ??= new Set());
    for (const n of imp.names) importedFrom[imp.from].add(n);
  }
}
for (const [name, m] of Object.entries(mod)) {
  if (name === 'main') continue; // the entry module — index.html loads it, nothing imports it
  for (const ex of m.exports) {
    if (JS_EXPORT_IGNORE.has(ex)) continue;
    if (importedFrom[name]?.has(ex) || usedInOwnFile(m.code, ex)) continue;
    problems.push(`${PUBREL}/js/${name}.js exports '${ex}' — nothing imports it and ${name}.js never uses it`);
  }
}

/* ---------------- check 2: src/ value exports nobody references ---------------- */

const srcFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    // src/services/ is the installed, gitignored RONIN_SERVICES overlay, not this
    // repository's source. Its own repo owns dead-export checks for those modules.
    // Do not let an installed or deliberately disabled service make Cowork's gate
    // depend on machine-local overlay state. The connector boundary is still checked
    // from this side: core exports used only by services must carry @service below,
    // and check-kyokai validates the mounted seam when an overlay is present.
    if (e.isDirectory() && dir === path.join(ROOT, 'src') && e.name === 'services') continue;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
})(path.join(ROOT, 'src'));

const srcCode = srcFiles.map((p) => ({
  rel: path.relative(ROOT, p),
  base: path.basename(p),
  code: codeOnly(fs.readFileSync(p, 'utf8')),
  // Comments and all — the @service marker lives in the doc block, which codeOnly strips.
  raw: fs.readFileSync(p, 'utf8'),
}));

/** Is this export marked @service — part of the connector surface RONIN_SERVICES imports?
 * The marker must sit in the doc block immediately above the export, so it names ONE
 * export rather than blessing a whole file. */
const isServiceExport = (raw, name) => {
  const at = raw.search(new RegExp(`^export\\s+(?:const|let|var|function|async function|class)\\s+${name}\\b`, 'm'));
  if (at < 0) return false;
  const before = raw.slice(0, at);
  const doc = before.slice(before.lastIndexOf('/**'));
  return before.lastIndexOf('/**') >= 0 && SERVICE_MARK.test(doc);
};
for (const f of srcCode) {
  if (SRC_ENTRY_FILES.has(f.base)) continue;
  const exports = [...f.code.matchAll(/^export\s+(?:const|let|var|function|async function|class)\s+([\w$]+)/gm)].map((m) => m[1]);
  for (const ex of exports) {
    if (SRC_EXPORT_IGNORE.has(ex)) continue;
    if (isServiceExport(f.raw, ex)) continue; // the connector surface — see SERVICE_MARK
    const used = srcCode.some((g) => g !== f && new RegExp(`\\b${ex}\\b`).test(g.code));
    if (used || usedInOwnFile(f.code, ex)) continue;
    problems.push(`${f.rel} exports '${ex}' — no src/ file references it, its own included`);
  }
}

/* ---------------- ids that exist: markup + literal JS assignment ---------------- */

const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const liveIds = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
for (const m of Object.values(mod)) {
  // `.id = 'x'` assignment (not `.id ===` comparison, which is data, not DOM)
  for (const a of m.raw.matchAll(/\.id\s*=(?!=)\s*['"]([\w-]+)['"]/g)) liveIds.add(a[1]);
  // the ui.sheet primitive takes its element id as `sheet({ id: 'x', … })` — the one
  // object-literal spelling that creates a DOM id (js/ui.js sets el.id from it)
  for (const a of m.raw.matchAll(/sheet\(\{\s*id:\s*['"]([\w-]+)['"]/g)) liveIds.add(a[1]);
  // id="x" inside an HTML template string
  for (const a of m.raw.matchAll(/\bid\s*=\s*\\?["']([\w-]+)\\?["']/g)) liveIds.add(a[1]);
}

/* ---------------- check 3: JS lookups of ids that exist nowhere ---------------- */

for (const [name, m] of Object.entries(mod)) {
  const src = noComments(m.raw);
  const lookups = [
    ...[...src.matchAll(/getElementById\(\s*['"]([\w-]+)['"]/g)].map((x) => x[1]),
    ...[...src.matchAll(/querySelector(?:All)?\(\s*['"]([^'"]+)['"]/g)].flatMap((x) => [...x[1].matchAll(/#([\w-]+)/g)].map((y) => y[1])),
  ];
  for (const id of lookups) {
    if (ID_LOOKUP_IGNORE.has(id)) continue;
    if (!liveIds.has(id)) problems.push(`${PUBREL}/js/${name}.js looks up '#${id}' — no markup or JS creates that id`);
  }
}

/* ---------------- check 4: CSS #id selectors for ids that exist nowhere ---------------- */

// Selector text is exactly the runs that precede a '{' (declarations precede ';' or
// '}'), so hex colors never appear here. Runs starting with '@' are at-rule preludes.
const css = noComments(fs.readFileSync(path.join(PUB, 'style.css'), 'utf8'));
const deadCss = new Map(); // id -> first offending selector run
let buf = '';
for (const c of css) {
  if (c === '{') {
    const run = buf.trim();
    if (run && !run.startsWith('@')) {
      for (const m of run.matchAll(/#([A-Za-z_][\w-]*)/g)) {
        const id = m[1];
        if (!liveIds.has(id) && !CSS_ID_IGNORE.has(id) && !deadCss.has(id)) deadCss.set(id, run.replace(/\s+/g, ' '));
      }
    }
    buf = '';
  } else if (c === '}' || c === ';') buf = '';
  else buf += c;
}
for (const [id, run] of deadCss) problems.push(`${PUBREL}/style.css selects '#${id}' (“${run.slice(0, 60)}”) — no markup or JS creates that id`);

/* ---------------- verdict ---------------- */

console.log(`check-dead: ${Object.keys(mod).length} client module(s), ${srcCode.length} src file(s), style.css, index.html`);
if (problems.length) {
  console.log('');
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(`\nFAILED — ${problems.length} dead item(s). A deletion is not done until check-dead is quiet.`);
  process.exit(1);
}
console.log('  ok — no dead exports, no dead id lookups, no dead #id CSS');
