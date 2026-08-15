/**
 * CHECK-CATALOGS — a byoin_check: the stock catalogs, held to their own rules. Lives
 * in `npm run verify`, which is where BYOIN reads its byoin_check list.
 *
 * Two questions, both asked from the running code's point of view:
 *
 *   1. SURFACING. Does every bare `## name` entry in a stock catalog actually come out
 *      of the reader that serves it? The readers drop what they cannot use — a session
 *      job with no `opening` simply vanishes from the launcher — and silence is the
 *      failure mode. A dropped stock entry FAILS the check. (A user file on this box
 *      can legitimately hide one; the message says so when that is the likely cause.)
 *
 *   2. DEAD LINKS. Does every repo file a stock catalog points an agent at exist in
 *      this install? A catalog is agent instructions, so a dead link is an errand that
 *      cannot be run. Counted as warns while ronin_library/ is built up one screened
 *      piece at a time; they harden to failures when the owner rules the shelf ready.
 *
 * Uses the SAME parser and readers as the server (src/catalog.ts, src/macros.ts,
 * src/project-roots.ts) — a check with its own parser would drift, silently.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK_DIR, splitSections, readEntries, listSessionJobs } from '../src/catalog.js';
import { listMacros } from '../src/macros.js';
import { listSessionLaunchSpecs } from '../src/project-roots.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
let warns = 0;
const fail = (msg: string) => {
  console.error(`  FAIL  ${msg}`);
  fails++;
};
const warn = (msg: string) => {
  console.warn(`  warn  ${msg}`);
  warns++;
};

const stockNames = async (file: string): Promise<string[]> => {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  return splitSections(raw, 'stock')
    .filter((s) => s.head === s.name) // a heading with a space is prose, never an entry
    .map((s) => s.name);
};

/** Every stock bare entry must surface from the reader, by name. */
async function surfacing(file: string, served: () => Promise<{ name: string }[]>): Promise<void> {
  const want = await stockNames(file);
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${file}: stock entry "${name}" does not surface from its reader — ` +
          `half-written (dropped by a filter), or hidden by a user file on this box`,
      );
    }
  }
}

/** Repo paths a catalog names. An agent reads these as errands, so they must resolve. */
async function deadLinks(file: string): Promise<void> {
  const raw = await readFile(path.join(STOCK_DIR, file), 'utf8');
  const re = /(?:^|[\s(`])((?:docs|reading-list|co-working|ronin_catalogs|ronin_library|hostside|scripts|bin)\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])/gm;
  const seen = new Set<string>();
  for (const m of raw.matchAll(re)) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    try {
      await stat(path.join(REPO, p));
    } catch {
      warn(`${file}: names ${p} — not in this install`);
    }
  }
}

const FILES = ['SESSION_JOBS.md', 'MACROS.md', 'ACTIONS.md', 'TOOLS.md', 'PROJECT_ROOTS.md'];

await surfacing('SESSION_JOBS.md', listSessionJobs);
await surfacing('MACROS.md', listMacros);
await surfacing('ACTIONS.md', () => readEntries('ACTIONS.md'));
await surfacing('TOOLS.md', () => readEntries('TOOLS.md'));

// The launch table: an install with no session_launch_specs cannot spawn a configured session.
if ((await listSessionLaunchSpecs()).length === 0) fail('PROJECT_ROOTS.md: the launch table yields no session_launch_specs');

for (const f of FILES) await deadLinks(f);

if (fails) {
  console.error(`check-catalogs: ${fails} failure(s), ${warns} dead link(s)`);
  process.exit(1);
}
console.log(`check-catalogs: ok — every stock entry surfaces${warns ? `; ${warns} dead link(s) awaiting ronin_library material` : ''}`);
