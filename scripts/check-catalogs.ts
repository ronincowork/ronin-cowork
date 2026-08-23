/**
 * CHECK-CATALOGS — a byoin_check: the stock catalogs, held to their own rules. Lives
 * in `npm run verify`, which is where BYOIN reads its byoin_check list.
 *
 * Three questions, all asked from the running code's point of view:
 *
 *   1. SURFACING. Does every bare `## name` entry in a stock catalog — and every stock
 *      DEFINITION FILE in `role_families/` and `session_roles/` — actually come out of the
 *      reader that serves it? The readers drop what they cannot use, and silence is the
 *      failure mode. A dropped stock entry FAILS the check. (A user file on this box
 *      can legitimately hide one; the message says so when that is the likely cause.)
 *
 *   2. THE HUMAN HALF. Does every stock macro carry `label:` and `blurb:` as well as the
 *      agent's instruction? Two readers, two pieces of writing, neither substituting for
 *      the other (owner, 2026-08-17). See `macroCopy` below for why it is a gate.
 *
 *   3. DEAD LINKS. Does every repo file a stock catalog points an agent at exist in
 *      this install? A catalog is agent instructions, so a dead link is an errand that
 *      cannot be run. Counted as warns while ronin_library/ is built up one screened
 *      piece at a time; they harden to failures when the owner rules the shelf ready.
 *
 * Uses the SAME parser and readers as the server (src/catalog.ts, src/macros.ts,
 * src/project-roots.ts) — a check with its own parser would drift, silently.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOCK_DIR, splitSections, readEntries } from '../src/catalog.js';
import { listRoleFamilies, listSessionRoles, listTeamRoles, type DefinitionKind } from '../src/definitions.js';
import { resolveLaunchProfile, type LaunchProfile } from '../src/launch-profile.js';
import { findDefinition } from '../src/definitions.js';
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

/**
 * THE HUMAN HALF. Every macro is written twice, for two readers who need opposite things:
 * the prose under the heading is the AGENT'S instruction (it opens with the rule the agent
 * must not break) and `label:`/`blurb:` are what a PERSON reads to decide whether they want
 * it. The owner's ruling, 2026-08-17: *"we need to split out the description and the agent
 * instruction into two different things because they don't overlap, and the macro should
 * carry both."*
 *
 * Both halves have to be REQUIRED or they drift, and the drift is silent in the worst
 * direction: with no gate, the only thing that notices a missing blurb is a person reading
 * a card, and the old repair for that was a fallback to the instruction — showing "never
 * fork on your own initiative" to somebody who tapped a button to find out what it does.
 * The fallback is gone (public/js/tilemacros.js), so a missing blurb is now a visibly
 * unfinished card. This is the check that stops one shipping.
 *
 * ALL THIRTEEN, not the four previewed. `preview:` is a display toggle and it changes
 * monthly; the copy is the entry's, and the next surface is a library people browse to
 * adopt macros from. Copy written for four would have to be written again for all of them.
 */
async function macroCopy(): Promise<void> {
  for (const m of await listMacros()) {
    if (m.origin !== 'stock') continue; // a user's own file is theirs; the client handles a blank
    for (const field of ['label', 'blurb'] as const) {
      if (!m[field].trim()) {
        fail(
          `MACROS.md: macro "${m.name}" has no \`- **${field}:**\` — every entry carries the ` +
            `human copy as well as the agent's instruction, and no surface may show the ` +
            `instruction to a person in its place`,
        );
      }
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

/**
 * THE DEFINITION DIRECTORIES — the same surfacing question, asked of files rather than of
 * `## name` blocks. A stock `.md` that the reader will not return is either malformed (no
 * key lines at all) or hidden, and both are worth naming.
 */
async function surfacingDefinitions(
  kind: DefinitionKind,
  served: () => Promise<{ name: string }[]>,
): Promise<void> {
  const want = (await readdir(path.join(STOCK_DIR, kind)))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.replace(/\.md$/, ''));
  const got = new Set((await served()).map((e) => e.name));
  for (const name of want) {
    if (!got.has(name)) {
      fail(
        `${kind}/${name}.md: does not surface from its reader — ` +
          `malformed (no \`- **key:** value\` lines), or hidden by a user file on this box`,
      );
    }
  }
}

/**
 * EVERY SHIPPED BUTTON RESOLVES. The cascade refuses contradictions
 * (`src/launch-profile.ts`), and a refusal we shipped is a launch button that cannot be
 * pressed. A family is presentation (R35) and contributes nothing to a launch, so the
 * button set is simply every session_role — but each family's shelf is still checked:
 * every member it names must exist, and its `default_lead_role`, when stated, must be
 * in its own family (the pin has nothing to pin to otherwise).
 */
async function definitionsResolve(): Promise<void> {
  const families = await listRoleFamilies();
  const tasks = await listSessionRoles();
  for (const f of families) {
    for (const tk of f.session_roles) {
      if (!(await findDefinition('session_roles', tk))) {
        fail(`role_families/${f.name}.md: its session_roles names "${tk}", which is not a session_role on this box`);
      }
    }
    if (f.default_lead_role && !f.session_roles.includes(f.default_lead_role)) {
      fail(
        `role_families/${f.name}.md: its default_lead_role "${f.default_lead_role}" is not in its own family — the pin has nothing to pin to`,
      );
    }
  }
  for (const tk of tasks) {
    const taskDef = await findDefinition('session_roles', tk.name);
    let profile: LaunchProfile;
    try {
      profile = resolveLaunchProfile(taskDef);
    } catch (e) {
      fail(`launch profile ${tk.name}: ${String((e as Error).message)}`);
      continue;
    }
    // A profile that launches an agent with no first message is a button that starts a
    // session and tells it nothing.
    if (profile.agent && !profile.opening) {
      fail(`launch profile ${tk.name}: launches an agent with no \`opening:\``);
    }
  }
  // The blank launch profile resolves too — a bare team launch has no session_role.
  try {
    resolveLaunchProfile(undefined);
  } catch (e) {
    fail(`launch profile (blank): ${String((e as Error).message)}`);
  }
}

const FILES = ['MACROS.md', 'ACTIONS.md', 'TOOLS.md', 'PROJECT_ROOTS.md'];

await surfacingDefinitions('role_families', listRoleFamilies);
await surfacingDefinitions('session_roles', listSessionRoles);
await surfacingDefinitions('team_roles', listTeamRoles);
await definitionsResolve();
await surfacing('MACROS.md', listMacros);
await surfacing('ACTIONS.md', () => readEntries('ACTIONS.md'));
await surfacing('TOOLS.md', () => readEntries('TOOLS.md'));
await macroCopy();

// The launch table: an install with no session_launch_specs cannot spawn a configured session.
// Provider cells are exact launch contracts, not display-only labels. OpenAI must expose
// real model choices, and every choice must pass its heading unchanged to Codex. This
// catches the old `openai · default -> codex` placeholder without freezing today's model
// family into code: adding or retiring a catalog column needs no parser/test code path.
const launchSpecs = await listSessionLaunchSpecs();
if (launchSpecs.length === 0) fail('PROJECT_ROOTS.md: the launch table yields no session_launch_specs');
const openaiSpecs = launchSpecs.filter((s) => s.provider === 'openai');
if (openaiSpecs.length < 2) fail('PROJECT_ROOTS.md: OpenAI must offer more than one real model choice');
for (const spec of openaiSpecs) {
  if (spec.model === 'default') fail('PROJECT_ROOTS.md: OpenAI model heading "default" hides the model being launched');
  const expected = `codex --model ${spec.model} --dangerously-bypass-approvals-and-sandbox`;
  if (spec.cmd !== expected) {
    fail(`PROJECT_ROOTS.md: openai · ${spec.model} must launch "${expected}", got "${spec.cmd}"`);
  }
}

for (const f of FILES) await deadLinks(f);

if (fails) {
  console.error(`check-catalogs: ${fails} failure(s), ${warns} dead link(s)`);
  process.exit(1);
}
console.log(`check-catalogs: ok — every stock entry surfaces${warns ? `; ${warns} dead link(s) awaiting ronin_library material` : ''}`);
