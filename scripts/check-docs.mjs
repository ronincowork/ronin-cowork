#!/usr/bin/env node
/**
 * check-docs — every claim a document makes about the tree must be true.
 *
 * ~20 of the 44 lines in BROKEN.md were "document says X, tree says not-X", and four
 * hand-sweeps on 2026-08-12 each found new instances — sweeps do not converge; gates do.
 * The precedent is check-tomodachi.mjs (vocabulary), this is the same idea for prose:
 * extract `file.js`, `symbol()` and `path/` shapes from tier-1/2 documents and assert
 * each names something that exists. Runs in `npm run verify`, and standalone:
 *
 *   node scripts/check-docs.mjs          # report failures, exit 1 if any
 *   node scripts/check-docs.mjs --all    # also print every claim it checked (tuning)
 *
 * PRECISION BEATS COVERAGE. A check that cries wolf gets disabled, so only
 * unambiguous shapes are claims; everything else is skipped, deliberately:
 *   - fenced code blocks (examples, not claims), `>` blockquotes (history is exempt,
 *     owner's ruling 2026-08-13), lines carrying [planned] (named before built, by design)
 *   - spans with spaces/globs/placeholders (`npm run verify`, `grid_<name>_…`)
 *   - host paths (`~/...`, `/tmp/...`), URLs, npm scopes and tmux options (`@...`),
 *     css selectors and dotfiles (`#fab`, `.ttext`, `.env`) — check-dead's territory
 *   - extensionless slashed spans whose first segment is not a real top-level dir
 *     (`cowork/services` is prose, `ronin_bin/tejun` is a claim)
 * Residual LEGAL mentions of absent things ("deleted, verified absent") go in IGNORE
 * below with the reason beside them — no new markup in the documents themselves.
 */
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ALL = process.argv.includes('--all');

let failed = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failed++;
};
const ok = (msg) => console.log(`  ok    ${msg}`);

/* ---------------------------------------------------------------- the tree */

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'public-staging']);
const files = []; // repo-relative file paths
const dirs = new Set(); // repo-relative dir paths
// A SYMLINK is a real path and a false document. `ronin_session_boot/all/SHELVES.md` ->
// `docs/SHELVES.md` is the boot shelf handing a session a document that lives elsewhere,
// so a claim naming either path is TRUE (it stays in `files`) while scanning both would
// check one document twice and demand an exemption per link as the shelf grows. Kept for
// resolution, skipped as a source.
const links = new Set();
(function walk(rel) {
  for (const name of readdirSync(path.join(REPO, rel))) {
    if (SKIP_DIRS.has(name)) continue;
    const r = rel ? `${rel}/${name}` : name;
    let st;
    try {
      if (lstatSync(path.join(REPO, r)).isSymbolicLink()) links.add(r);
      st = statSync(path.join(REPO, r));
    } catch {
      continue; // dangling symlink
    }
    if (st.isDirectory()) {
      dirs.add(r);
      if (!links.has(r)) walk(r); // never follow a linked directory — same document twice
    } else files.push(r);
  }
})('');
// Generated directories are excluded from the walk (and may not exist until npm/stage
// has run), but prose legitimately names them — they are legal dir claims by fiat.
for (const d of ['node_modules', 'dist', 'public-staging']) dirs.add(d);
const basenames = new Set(files.map((f) => path.basename(f)));
const topDirs = new Set([...dirs].filter((d) => !d.includes('/')));

// Where a `symbol()` claim must be defined or used.
const CODE_DIRS = ['src', 'public/js', 'public', 'scripts', 'bin', 'ronin_bin', 'deploy'];
const CODE_EXTRA = ['setup.sh', 'package.json'];
const codeHaystack = files
  .filter((f) => CODE_DIRS.some((d) => f.startsWith(d + '/')) || CODE_EXTRA.includes(f))
  .map((f) => {
    try {
      return readFileSync(path.join(REPO, f), 'utf8');
    } catch {
      return '';
    }
  })
  .join('\n');

/* ------------------------------------------------------------ what is scanned */

const md = (f) => f.endsWith('.md');

// EVERY markdown document in the tree is scanned. This used to be a hand-kept list of
// sources, and a hand-kept list is a promise someone has to remember: a new SOP, a new
// library page, a new boot document all arrived UNGATED, and the check reported "all
// claims hold" while saying nothing about them. That is the same failure the check
// exists to prevent, one level up — a document quietly disagreeing with the tree — so
// the set is a rule now and a new document is gated by existing.
//
// The walk already skips .git, node_modules, dist and public-staging. EXEMPT is the only
// other way out, it is per-file, and every entry says why. Prefer an IGNORE entry (a
// named thing legally absent) over an exemption (a whole document unchecked).
const EXEMPT = new Map([
  // KOTOBA's Record column cites the WHOLE product — the house tree, RONIN_SERVICES, the
  // private working notes — and this check can only see one repo, so its paths are not
  // claims this check can rule on. check-kotoba still holds KOTOBA to the code.
  ['KOTOBA.md', 'Record column cites repos this check cannot see (check-kotoba covers it)'],
  // The glossary calls itself "companion to KOTOBA.md" and cites the same span of repos,
  // so it inherits the exemption rather than earning a second reason. One entry, not two:
  // the boot shelf's copy is a symlink, and symlinks are not sources.
  ['KOTOBA_GLOSSARY.md', 'companion to KOTOBA.md — same cross-repo citations'],
]);
const SOURCES = files.filter((f) => md(f) && !EXEMPT.has(f) && !links.has(f));

// Legal mentions of things that do not exist — keyed by source path, each entry with
// its reason. This list is the negation convention's escape hatch (owner's ruling
// 2026-08-13): no new markup in the documents, a small list here instead.
const IGNORE = {
  // "that file is gone as of 2026-08-08" — BUNKAI's whole point is that it is absent.
  'CLAUDE.md': ['public/app.js'],
  'CLAUDE.local.md': ['public/app.js'],
  // (public/js/README.md's `app.js` — BUNKAI's dismantled file — rides in the split
  // block below: one key per source, or the later key silently wins.)
  // A host file in ~/.claude, named bare — not a claim about this tree.
  'docs/doctor.md': ['settings.local.json'],
  // The owner's settings file, created at runtime in the `config` store. Same shape as the
  // line above: a real file on the box, never a file in this repo, so it cannot resolve here.
  'docs/user-config.md': ['ronin.json'],
  'docs/README.md': ['ronin.json'],
  'docs/settei.md': ['ronin.json'],
  'docs/env.md': ['ronin.json'],
  'docs/wanted-needed.md': ['ronin.json'],
  // The wipeboard's TTL and grace are SETTEI, so the page that documents them names the
  // owner's config file for the same reason the five above do: created at runtime in the
  // config store, real on the box, never a file in this repo.
  'docs/wipeboards.md': ['ronin.json'],
  // One entry, three reasons — a second `'KOTOBA.md':` key would silently win over this
  // one and orphan whichever comment lost. `app.js` is BUNKAI's dismantled file, named by
  // the row about dismantling it. `ronin.json` and `koshi-outlets.json` are § SETTEI's:
  // created at runtime in a store, real on the box, never in this repo — and the second is
  // cited there precisely to say it is in the WRONG store.
  'KOTOBA.md': ['app.js', 'ronin.json', 'koshi-outlets.json'],

  // ── THE SPLIT'S KNOWN PLACEHOLDERS (MIGRATION_MANIFEST §12, in the house tree) ──
  // Every entry below is a reference to something the free build does not carry YET:
  // a doc to ship or trim, service code that lives in RONIN_SERVICES, or a working
  // directory that needs a store home. Each is removed as its gap is filled — this
  // block shrinking to nothing is the split finishing.
  'docs/shadowing.md': ['HOTWORDS.md', 'src/services/koe/hotwords.ts', 'docs/stores.md', 'docs/repo-to-operator.md', 'DAIKUSAN.md'],
  // 📄's section cites where `docs` lives in the letter — michi's, so it is in
  // RONIN_SERVICES like koe's and rireki's above, real on any box that installed the
  // service and absent from this repo. Caught by CI and not by the box, which is the
  // whole point of the entry: `src/services/` is assembled at boot and gitignored, so a
  // developer's local check-docs passes on files the runner will never see (2026-08-18).
  'docs/tile.md': ['src/services/michi/tegami.ts'],
  // Same shape: counting and rireki are services, so the files these two documents cite
  // for the plan-id hash and the viewer filter are real on an installed box and absent
  // from this repo's runner (2026-08-25).
  'docs/is-this-safe.md': ['src/services/counting/plans.ts'],
  'docs/session-identity.md': ['src/services/rireki/rireki.ts', 'src/services/counting/rollup.ts'],
  'README.md': ['connector-contract.md'],
  'public/js/README.md': ['app.js', 'co-working/user_repo/wip/buildouts/', 'CLAUDE.md', 'docs/commons.md', 'src/services/rireki/', 'co-working/user_repo/README/KEYPAD_README.md', '../../co-working/user_repo/README/KEYPAD_README.md'],
  // (The house-dir literals that lived in ACTIONS/MACROS collapsed into the documents
  // SOP on the_owner's ruling — actions defer to the SOP, which compile inlines.)
  // What remains names the house dirs of a PROJECT_REPO — a location in whatever repo a
  // session works in, never a claim about this tree.
  // `wip/`/`docs/`/`manifest/` are a PROJECT_REPO's dirs. `ronin.json` is SETTEI's file,
  // created at runtime in the config store — real on the box, never in this repo, the
  // same reason docs/user-config.md and docs/README.md carry it below.
  'ronin_catalogs/ACTIONS.md': ['wip/', 'docs/', 'manifest/', 'ronin.json'],
  // The documents page *defines* those house dirs, so it names them most of all. Same
  // reason as the line above: they are a PROJECT_REPO's directories — a location in
  // whatever repo a session works in — and never a claim about this tree.
  'ronin_library/documents.md': ['wip/', 'wip/handoffs/', 'wip/buildouts/', 'manifest/', 'manifest/MANIFEST.md'],
  // The methodology SOP states the same project-repo house-dir contract, and names
  // provider-native instruction files that may exist in the project a session opens.
  // None is a claim that this Cowork source tree carries that project's files.
  'ronin_sops/ronin_methodology.md': ['wip/', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'],
  'ronin_catalogs/PROJECT_ROOTS.md': ['DAIKUSAN.md', 'src/services/rireki/decode.ts:219'],
  // Koshi is a SERVICE, so the outlet table it names ships in RONIN_SERVICES, not here.
  'bin/bench/README.md': ['src/koshi-model.ts'],
  // Named with its repo in the prose — "src/lens.ts in the tmux-ronin repo" — so it is a
  // claim about another tree by construction, not a gap in this one.
  'libexec/rireki/README.md': ['src/lens.ts'],
  // The boot shelf documents levels that are addresses before they hold files — that is
  // the design, not a defect. `gbrain_connected/` is the connected level: made and
  // seeded by gbrain's setup in the owner's session_boot store, real on a box with the
  // service and never in this repo — cowork matches `*_connected/` and deliberately
  // ships no such folder (owner's ruling, 2026-08-20). Same reason on every doc that
  // teaches the level by its live example.
  'ronin_session_boot/README.md': ['root/', 'gbrain_connected/'],
  'docs/session-boot.md': ['gbrain_connected/'],
  'docs/SHELVES.md': ['gbrain_connected/'],
  'docs/ability-pyramid.md': ['gbrain_connected/'],
  'ronin_sops/gbrain.md': ['gbrain_connected/'],
  'ronin_catalogs/TOOLS.md': ['docs/oboeru.md', 'docs/koshi.md'],
};

/* ------------------------------------------------------------- classification */

const EXT = /\.(md|js|mjs|cjs|ts|css|html|sh|json|service|plist|yml|yaml|txt)$/;

/** One backticked span → a checkable claim, or null for "not a claim". */
function classify(raw) {
  let s = raw.trim();
  if (!s || /\s/.test(s)) return null; // commands and prose carry spaces
  if (/^[\w$.]+\(\)$/.test(s)) {
    // `symbol()` — checked before the punctuation guard, which would eat the parens.
    const name = s.slice(0, -2).split('.').pop();
    return /^[A-Za-z_$][\w$]*$/.test(name) ? { kind: 'symbol', target: name } : null;
  }
  if (/[<>{}()|*…§"'`=,;!?]/.test(s)) return null; // templates, placeholders, prose
  if (s.includes('://') || s.startsWith('@')) return null; // urls, scopes, tmux options
  if (/^[~$/#.+-]/.test(s)) return null; // host paths, vars, selectors, dotfiles, flags
  s = s.replace(/:[\d,:-]+$/, ''); // `koshi.ts:68` → the file is the claim
  if (s.endsWith('/')) {
    const d = s.slice(0, -1);
    return /^[\w./-]+$/.test(d) ? { kind: 'dir', target: d } : null;
  }
  if (s.includes('/')) {
    if (!/^[\w./-]+$/.test(s)) return null;
    if (!EXT.test(s) && !topDirs.has(s.split('/')[0])) return null; // `cowork/services`
    return { kind: 'path', target: s };
  }
  if (EXT.test(s) && /^[\w.-]+$/.test(s)) return { kind: 'file', target: s };
  return null;
}

const pathExists = (t) => files.includes(t) || files.some((f) => f.endsWith('/' + t));
const dirExists = (t) => dirs.has(t) || [...dirs].some((d) => d.endsWith('/' + t));

function verify(claim) {
  switch (claim.kind) {
    case 'file':
      return basenames.has(claim.target);
    case 'path':
      return pathExists(claim.target) || dirExists(claim.target);
    case 'dir':
      return dirExists(claim.target);
    case 'symbol':
      return codeHaystack.includes(claim.target);
  }
}

/* ------------------------------------------------------------------- the scan */

console.log('check-docs — prose claims about the tree');

let checked = 0;
for (const src of SOURCES) {
  const ignore = new Set(IGNORE[src] ?? []);
  const lines = readFileSync(path.join(REPO, src), 'utf8').split('\n');
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (/^\s*>/.test(line)) return; // blockquoted history is exempt
    if (line.includes('[planned]')) return; // named before built, by design

    const claims = [];
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const c = classify(m[1]);
      if (c && !ignore.has(m[1].trim()) && !ignore.has(c.target)) claims.push([m[1].trim(), c]);
    }
    // Relative markdown links resolve from the document's own directory.
    for (const m of line.matchAll(/\]\(([^)#\s]+)\)/g)) {
      const t = m[1];
      if (t.includes('://') || t.startsWith('/') || t.startsWith('~') || ignore.has(t)) continue;
      const resolved = path.join(path.dirname(src), t).replaceAll('\\', '/');
      claims.push([t, { kind: 'link', target: resolved }]);
    }

    for (const [span, claim] of claims) {
      checked++;
      const good = claim.kind === 'link' ? files.includes(claim.target) : verify(claim);
      if (ALL) console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${src}:${i + 1}  ${claim.kind}  \`${span}\``);
      if (!good) fail(`${src}:${i + 1} — \`${span}\` (${claim.kind}) names nothing in the tree`);
    }
  });
}

ok(`${checked} claims checked across ${SOURCES.length} documents`);
console.log(failed ? `\ncheck-docs: ${failed} failure(s)\n` : '\ncheck-docs: all claims hold\n');
process.exit(failed ? 1 : 0);
