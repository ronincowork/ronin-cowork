#!/usr/bin/env node
/**
 * check-place — nothing names a machine, a person, or a place.
 *
 * A ronin_machine is fungible: any box, any username, any home directory. That survives
 * exactly as long as nobody writes a location down, and hand-sweeps do not converge —
 * four of them over BROKEN.md each found new instances. So it is a gate. The rule and
 * the two roots are `docs/stores.md`.
 *
 *   node scripts/check-place.mjs        # standalone; also runs in `npm run verify`
 *
 * TWO HALVES, because the damage arrives two ways:
 *
 *   CODE  — a module spelling a store path, an absolute /home/… literal, or a hostname.
 *           Nothing else in the gate family reads source for this: check-dead looks for
 *           things that are gone, check-kotoba for vocabulary.
 *   PROSE — a document stating where a store lives. `check-docs` deliberately SKIPS
 *           host paths (`~/…`) and URLs — precision beats coverage, and widening it is
 *           how a gate goes quiet — so this class is invisible to it by design. Which is
 *           why 18 documents were stating this box's legacy defaults as the truth.
 *
 * THE RULE IS DERIVED, NOT LISTED. It does not enumerate store paths — it forbids naming
 * ANY home-rooted Ronin location at all. That covers the stores we have, the ones we have
 * not invented yet, and the retired names, without a list of dead strings to maintain: a
 * ledger of what used to be true is the same defect as a legacy fallback.
 *
 * PRECISION BEATS COVERAGE, same contract as check-docs. `>` blockquotes are history and
 * exempt everywhere. Everything else that is exempt is in ALLOW below with a reason
 * beside it — an entry without a reason is how this rots.
 *
 * A DELIBERATE LIMIT: a bare `$HOME`/`homedir()` join is NOT an error by itself. setup.sh
 * legitimately places things in ~/.config, config.ts legitimately defaults a working
 * directory to $HOME, and project-roots.ts expands `~` in the user's own data. Flagging
 * the join would need an allowlist longer than the rule, so what is flagged is the thing
 * that actually hurts: naming a STORE, a USER, or a HOST.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failed++; };
const ok = (msg) => console.log(`  ok    ${msg}`);

const { STORES } = await tsImport('../src/stores.ts', import.meta.url);

/**
 * Files allowed to name a place, and why. Keyed by repo-relative path.
 * NEVER add one without the reason — and never to silence a real finding.
 */
const ALLOW = {
  // The front-door install commands run on a FRESH machine, before any resolver
  // exists — a person types them literally, so the path must be shown.
  'README.md': 'the install commands a person types before ronin-store exists',
  // The two bindings of the store table ARE the place the paths are written down.
  'src/stores.ts': 'the table itself',
  'bin/ronin-store': 'the bash binding of the table',
  // The gate cannot scan for a pattern it may not contain.
  'scripts/check-place.mjs': 'this file',
  // The contract explains the two roots and recounts the incident by name.
  'docs/stores.md': 'the contract — the one place allowed to show the layout',
  // DAIKUSAN draws the map: one place is allowed to draw it, and it points at the table.
  'DAIKUSAN.md': 'the map of what ships and what accumulates',
  // A dead machine, named as history in a doc about standing up new ones.
  'CLAUDE.local.md': "this box's own deployment record, and old dohyo as history",
  // The SOROBAN sanitiser's hostile inputs. These literals ARE the test — a sweep that
  // "fixes" them silently guts the proof that nothing leaks. See scripts/check-tomodachi.mjs.
  'scripts/check-tomodachi.mjs': 'hostile inputs — the literals are the test data',
};

/* ------------------------------------------------------- the derived patterns */

/**
 * A path in Ronin's own data namespace: anything under `~/ronin…` or `~/.ronin…`, which
 * is where every store lives and where every retired one lived. Whether it names a current
 * store, a location we have retired, or one nobody has invented yet does not matter — none
 * may be written down. Ask the table: storeDir('<id>'), or "$(ronin-store <id>)".
 *
 * NOT the install: `~/.config/systemd/user/`, `~/Library/LaunchAgents/` and
 * `~/.claude/settings.json` are setup.sh's business and are named freely. Only the data
 * namespace is closed.
 *
 * Deliberately NOT a list of known store paths. A list needs every retired name kept in
 * it forever, and a ledger of what used to be true is the same defect as a legacy
 * fallback: something to maintain, and wrong the moment nobody does.
 */
const HOME_RONIN = /(?:~|\$HOME|\$\{HOME\})\/\.?ronin(?:_[A-Za-z0-9_.-]+|\/[A-Za-z0-9_./-]*|\b)/i;

/** A person's home directory, spelled out. There is no legitimate use of this. */
const ABS_HOME = /\/(?:home|Users)\/[a-z_][a-z0-9_-]*/i;
/** A machine: a tailnet name, or a bare IPv4 that is not loopback/any/broadcast. */
const HOSTNAME = /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i;
const IPV4 = /\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b|255\.255\.255\.255\b)(?:\d{1,3}\.){3}\d{1,3}\b/;

/* ---------------------------------------------------------------- the sweep */

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

// Tier 1 and 2 prose — what a user or an agent is handed. Tier 3 (co-working/user_repo/wip/)
// is never scanned, same boundary check-docs draws: plans name unbuilt things by nature.
const PROSE = [
  ...walk('docs', []),
  ...walk('reading-list', []),
  ...walk('ronin_catalogs', []),
  'KOTOBA.md',
  'KOTOBA_GLOSSARY.md',
  'CLAUDE.md',
  'README.md',
  'DAIKUSAN.md',
  'DOCS.md',
].filter((f) => /\.md$/i.test(f));

/** History is exempt everywhere: a blockquote may legally name a dead box. */
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
