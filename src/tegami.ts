/**
 * THE LETTER'S AXIS HALF — cowork's, because the axis is set at birth and a ladder is not.
 *
 * ONE SESSION-AUTHORED AXIS, plus one derived block:
 *
 *   session_role  WHAT the session is doing right now. Seeded at birth and MUTABLE by two
 *                 writers: the session itself with `write_tegami`, and the owner from the
 *                 tile. A committed change injects that role's reading into the running
 *                 session (`src/role-watch.ts`).
 *   teams         DERIVED, machinery-owned, ADDITIVE — one entry per team the session is
 *                 on: the team's name, its `team_role`, and its objective, read from the
 *                 tags and the team_rosters store. Never authored by the agent
 *                 (`write_tegami` refuses it and regenerates it), refreshed at birth, on
 *                 a tag change, and on every whole-letter save — so a changed team
 *                 objective reaches the session on its next reread, lazily, with no push.
 *
 * There is NO identity axis on the session any more (R35, 2026-08-23): the old
 * `family_role` was dismantled with the teams cut. A session's identity, where it has
 * one, is contextual — the `team_role` of whichever team you are looking at it through —
 * and it lives on the roster only. A blank is stored as an empty string.
 *
 * Neither is a MICHI concern: michi is the ladder, and a session has a role and a task
 * whether or not it ever puts a ladder up.
 *
 * So the letter has two halves with different owners, in one file:
 *
 *   cowork (here)  seed the file at birth with both axes already filled; read them back
 *                  out for the roster. Nothing else in the block is parsed.
 *   michi          the ladder, `at`, `ladder_state`, `docs`, the SHINGO chip, `quietMs`,
 *                  the `/api/sessions/:name/tegami` routes, and the sweep.
 *
 * **Why this is not a KYOKAI breach.** The seam forbids core importing service code or
 * a service's dependencies (`scripts/check-kyokai.mjs`); it says nothing about a file.
 * And the file was already half ours: `src/stores.ts` declares the `session` store as
 * holding TEGAMI, `src/session-dir.ts` resolves the per-session directory as core "so a
 * service reaches its tenancy through this module rather than through another service's"
 * (the KYOKAI ruling, 2026-08-13), and `ronin_bin/read_tegami` + `ronin_bin/write_tegami`
 * — the only two doors an agent has — ship from this repo and derive this same path.
 * What was missing was a server-side read, which is all the free build ever needed.
 *
 * **Seeding is safe against michi.** `michi/tegami.ts`'s own `seedTegami` writes with
 * `flag: 'wx'` and treats EEXIST as success, returning the existing path. So on a build
 * with michi, we seed first and its seed steps aside onto the file we wrote — same
 * shell, same shape, plus the axes it would have left blank. Nothing in the services repo
 * has to change for this to be correct. (When it is next touched, michi's seed half is
 * dead code and should go; its `addBirthLines` still names the file, which is why we do
 * not add a birth line of our own and double-brief every session on a services install.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RIREKI_DIR, sessionKey } from './session-dir.js';
import { listSessionRoles } from './definitions.js';
import { readTeamRoster } from './team-rosters.js';
import type { SessionInfo } from './tmux.js';

const exec = promisify(execFile);

export interface TegamiCheckout {
  repo: string;
  branch: string;
  /**
   * DESK FIELDS, OPTIONAL — written by the tool that opened the desk (Track 1's
   * `desk open`), never asked of the agent: the worktree mounted on the branch and the
   * team line it hands in to. Everything else about a desk (dirty, ahead/behind, parked,
   * pending, last hand-in, blocked) is DERIVED at read time by `src/desk-state.ts` —
   * mechanical facts stay tool-owned, not prose the session maintains.
   */
  worktree?: string;
  line?: string;
}

/**
 * GIT'S LOCATION VARIABLES, REMOVED. `GIT_DIR` and its relatives OVERRIDE `-C`, so a
 * process that inherited them answers about the wrong repository — and git EXPORTS them
 * to every hook it runs. A session born under a hook (a pre-push gate spawning work, a
 * wrapper around `git`) therefore recorded the hook's repository in its birth letter
 * instead of its own checkout, silently and plausibly. Asking about a named directory
 * must not depend on where the caller happened to be invoked from.
 */
const GIT_LOCATION_VARS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR',
  'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
] as const;

export function envWithoutGitLocation(from: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...from };
  for (const k of GIT_LOCATION_VARS) delete env[k];
  return env;
}

/** The checkout the newborn is actually standing in; absence is a legal non-git root. */
export async function checkoutAt(dir: string): Promise<TegamiCheckout> {
  const git = async (...args: string[]) =>
    (await exec('git', ['-C', dir, ...args], {
      timeout: 2_000, env: envWithoutGitLocation(),
    })).stdout.trim();
  try {
    const top = await git('rev-parse', '--show-toplevel');
    const remote = await git('config', '--get', 'remote.origin.url').catch(() => '');
    const branch = await git('branch', '--show-current').catch(() => '') ||
      await git('rev-parse', '--short', 'HEAD').catch(() => '');
    return { repo: remote || top, branch, worktree: top };
  } catch {
    return { repo: '', branch: '' };
  }
}

/** The session's letter. One file, one name, no alternatives to search. */
export function tegamiPath(key: string): string {
  return path.join(RIREKI_DIR, key, 'tegami.md');
}

/**
 * The session_role lines, READ FROM THE DEFINITIONS — never restated here.
 *
 * `ronin_catalogs/session_roles/` is the authority on what a session_role is. A second
 * copy in this file would be correct exactly until someone edited one of them, and the
 * whole point of a letter that teaches at the moment of use is that what it teaches is
 * current. If the directory cannot be read we print no list at all rather than a stale one.
 */
async function taskLines(): Promise<string> {
  try {
    const rows = (await listSessionRoles())
      .filter((k) => k.name && k.remit)
      .map((k) => `> \`${k.name}\` — ${k.remit}`);
    return rows.length ? rows.join('\n') + '\n>' : '';
  } catch {
    return '';
  }
}

/** One derived teams entry — the letter's window onto a roster. */
export interface TeamEntry {
  team: string;
  team_role: string;
  objective: string;
}

/**
 * THE TEAMS BLOCK, DERIVED — tags in, roster facts out.
 *
 * The authority never moves: membership lives on the session (its tags), the
 * `team_role` and objective live on the team's roster, and this join is computed fresh
 * every time it is asked for. A team with no roster file is still a team — it renders
 * with blank role and objective, because membership is real whether or not the durable
 * record has been written yet.
 */
export async function deriveTeams(tags: string[]): Promise<TeamEntry[]> {
  return Promise.all(
    tags.map(async (team) => {
      const r = await readTeamRoster(team).catch(() => null);
      return { team, team_role: r?.team_role ?? '', objective: r?.objective ?? '' };
    }),
  );
}

/**
 * The file a newborn session finds waiting for it.
 *
 * Both axes are filled from the launch rather than left blank: the launcher already knows
 * what it launched, and making the session guess a fact the owner stated is how a roster
 * ends up showing "unknown" for sessions nobody was ever unsure about. Either may be
 * legitimately empty, and an empty one is written as `""` rather than omitted — a key
 * that is present and empty says "asked and answered none", which is the truth.
 *
 * The ladder is michi's and is seeded EMPTY here — a gate we cannot service (no chip, no
 * monitor) would light every tile amber waiting on a go-ahead nobody is watching for.
 */
function seedShell(
  name: string,
  role: string,
  repos: TegamiCheckout[],
  teams: TeamEntry[],
  tasks: string,
): string {
  return `# TEGAMI — ${name}
> **This file is your ladder, and it is a good way to communicate that you understand your
> role, the input you need from the user, and your planned phases and legs.** What you keep
> here is shown on the user's tile and on their session_roster for quick reference. Keep it true
> and save it when it changes — a stale ladder is worse than none.
>
> At the end of a turn, consider updating it with \`write_tegami\`. Not keeping it current is
> poor quality.
>
> YOUR **session_role** is already set below — it is the button the owner pressed to start
> you, so it is a statement of what you were asked for, not a guess. **Change it when the
> work changes**: a session that finishes planning and starts building has changed its
> session_role, not become a new session. It is the SESSION's role, not the agent's: same
> binary, different work. When you change it, Ronin hands you that role's own reading — so
> re-marking yourself is how you get told what the new work needs.
>
> YOUR **teams** block is DERIVED and not yours to write: one entry per team you are on —
> the team's name, its team_role, and its objective, read live from the team rosters.
> \`write_tegami\` regenerates it on every save and a tag change refreshes it, so reread
> your letter to see a team objective that moved. A session on no team is a rōnin, which
> is an ordinary state and not a gap.
>
> YOUR **repos** list is started from the checkout the new-session box put you in. It is
> not limited to that project_root: add, remove, or change entries as you work across other
> repositories. Keep every worktree and branch current. The worktree is the important
> live coordinate: it tells the owner which private desk this session is actually using;
> the branch remains supporting Git detail.
>
${tasks}
> YOUR **ladder** — the rungs, and which one you are on. Phases hold legs. Name a phase
> before you know its legs; a phase with nothing under it yet is normal. Leave out what you
> cannot see: a short ladder is a true ladder, and a guessed one is a lie. Statuses are
> \`PLANNED\` · \`ACTIVE\` · \`DONE\`, **one ACTIVE at a time**. Add a gate wherever the work
> genuinely stops and needs someone — that is how the owner knows you want them.
>
> YOUR **ladder_state** — \`write_tegami --on_tangent\` when you step off the ladder,
> \`--on_track\` when you are back. Riffing, a side job, ten minutes in nobody's plan — all
> normal, and your plan is not dead while you are away from it.
>
> YOUR DOCS — the buildouts, handoffs and plans this session is working on.
> \`write_tegami --doc <path>\` puts one on your list, \`--undoc <path>\` takes it off.
> The owner opens them from the ▧ Docs tab in commons, so **a doc you did not list is a
> doc they cannot reach without asking you for the path.**
>
> Your own words go in "objective" and "title". Read it with \`read_tegami\`; where the file
> lives is Ronin's business. The words: reading-list/TEGAMI.md in the Ronin repo.

\`\`\`json
{ "objective": "",
  "session_role": ${JSON.stringify(role)},
  "teams": ${JSON.stringify(teams)},
  "repos": ${JSON.stringify(repos.filter((checkout) => checkout.repo || checkout.branch))},
  "ladder": [] }
\`\`\`
`;
}

/**
 * Write the letter, once, with the role already in it. Returns the path, or null if it
 * could not be written.
 *
 * `flag: 'wx'` makes the existence check and the write ONE atomic step, so two callers
 * racing can never both decide the file is missing and both write it — and so this is
 * safe to call on a build where michi seeds too. EEXIST is success: somebody got there
 * first and their file stands. We never overwrite a letter; the session owns its own
 * words the moment it has written any.
 */
export async function seedTegami(
  name: string,
  role: string,
  checkout: TegamiCheckout | TegamiCheckout[] = { repo: '', branch: '' },
  teams: TeamEntry[] = [],
): Promise<string | null> {
  try {
    const file = tegamiPath(await sessionKey(name));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seedShell(name, role, Array.isArray(checkout) ? checkout : [checkout], teams, await taskLines()), { flag: 'wx' });
    return file;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'EEXIST') return tegamiPath(await sessionKey(name));
    // Never silent. A seed that fails quietly means a session with no letter and nobody
    // the wiser — the one failure mode that makes the whole readout untrustworthy.
    console.error(`[ronin] tegami seed ${name}:`, e);
    return null;
  }
}

/**
 * One axis out of a session's letter, or '' when it has not said.
 *
 * Deliberately a KEYHOLE read: it pulls the json block and takes one string out of it.
 * A malformed block, a missing file, a letter written by a future michi with keys we
 * have never heard of — all read as '' and none read as an error. The block belongs to
 * the agent and to michi; being unable to parse the rest of it is the normal case here,
 * not a fault, and the roster's job is to draw a blank rather than to complain.
 *
 * There is NO legacy key to fall back to. `session_job` is retired, and a letter carrying
 * it reads as blank on both axes — which is correct: it is a letter from a schema that no
 * longer exists, and inventing a task from it would be reading a fact nobody wrote.
 */
async function readAxis(name: string, key: 'session_role'): Promise<string> {
  try {
    const text = await fs.readFile(tegamiPath(await sessionKey(name)), 'utf8');
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const v = (JSON.parse(raw) as Record<string, unknown>)[key];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

/** WHAT the session is doing now — the mark, and the one session-authored axis. */
export const readSessionRole = (name: string): Promise<string> => readAxis(name, 'session_role');

/**
 * THE DESKS a session says it is working at — `repos[]` out of its letter, the same
 * keyhole discipline as `readAxis`: a missing or malformed letter reads as no desks,
 * and an entry keeps only the keys this shape knows. A session with none listed is a
 * legal state (a non-code session), not a fault.
 */
export async function readRepos(name: string): Promise<TegamiCheckout[]> {
  try {
    const text = await fs.readFile(tegamiPath(await sessionKey(name)), 'utf8');
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const v = (JSON.parse(raw) as Record<string, unknown>)['repos'];
    if (!Array.isArray(v)) return [];
    return v
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map((e) => {
        const out: TegamiCheckout = { repo: String(e.repo ?? '').trim(), branch: String(e.branch ?? '').trim() };
        if (typeof e.worktree === 'string' && e.worktree.trim()) out.worktree = e.worktree.trim();
        if (typeof e.line === 'string' && e.line.trim()) out.line = e.line.trim();
        return out;
      })
      .filter((e) => e.repo || e.branch);
  } catch {
    return [];
  }
}

/**
 * THE OWNER'S HAND ON THE TASK — set what a session is doing, from the tile.
 *
 * The session writes this field itself with `write_tegami`, and normally should: it is
 * the party that knows the work changed. But the owner is looking at the tile and can
 * see the agent is not doing what its mark says — an agent that never re-marked itself,
 * or one that was told to do something else mid-flight. Leaving the roster to be wrong
 * until the agent notices makes the mark decoration. So: two writers, one field, the
 * owner's hand last.
 *
 * **IT TOUCHES ONE KEY.** The `teams` block beside it is machinery-owned and derived;
 * this write leaves it exactly as found (a tag change is what refreshes it, through
 * `writeTeams` below).
 *
 * **SURGICAL, not a rewrite.** It replaces the `session_role` VALUE inside the fenced
 * block and touches nothing else — the ladder, `docs`, `at`, `objective`, the agent's
 * own spacing and every key we have never heard of survive byte for byte. Re-serialising
 * the block from a parse would silently reformat an agent's file, and would drop any key
 * this version does not know about; a letter is the session's own words and Ronin is a
 * guest in it.
 *
 * Three refusals, all of which leave the file exactly as found:
 *   · no letter at all → seed one carrying this task and a blank role (a session born
 *     outside Ronin never had a role to preserve, and inventing one would be a lie)
 *   · no json block → refuse. The letter is malformed or hand-mangled, and guessing
 *     where the payload starts is how you destroy a ladder.
 *   · the edit would not re-parse → refuse. Checked before anything is written.
 *
 * The write itself is tmp-then-rename, the same atomic swap `write_tegami` uses, so a
 * reader never sees a half-written letter. Two writers racing can still lose one edit —
 * that is true of `write_tegami` against itself today, and a lock is not worth the
 * machinery for a field a human changes by hand a few times a day.
 */
export async function writeSessionRole(name: string, task: string): Promise<string | null> {
  const clean = task.trim();
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    // No letter — a session Ronin never launched. Marking it is a reasonable thing to
    // want, so seeding one is the honest way to grant it, not a silent failure.
    return (await seedTegami(name, clean)) ? clean : null;
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return null;
  const body = block[1];
  const key = /"session_role"\s*:\s*"(?:[^"\\]|\\.)*"/;
  const next = key.test(body)
    ? body.replace(key, `"session_role": ${JSON.stringify(clean)}`)
    : body.replace(/\{/, `{ "session_role": ${JSON.stringify(clean)},`);
  try {
    JSON.parse(next); // the guard: never leave a letter the tile cannot read
  } catch {
    return null;
  }
  const out = text.slice(0, block.index! ) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.task`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return clean;
}

/**
 * THE SHELF — park a brief a session could not be handed at birth.
 *
 * Almost every vendor takes its initial prompt as an argument, so almost every session is
 * born already holding its brief and this is never reached. Two cases still need somewhere
 * to put words: a vendor that takes no initial prompt, and anything only knowable AFTER
 * the session exists (a services birth line names the letter, and the letter's path is
 * keyed on the session's own creation time — so it cannot be known before there is one).
 *
 * It is a FILE, beside the session's letter, because the alternative is typing into the
 * tile and that is the one thing this may never do. `writeGate` tells the person it is
 * there; nothing else acts on it.
 */
export async function parkBrief(name: string, text: string): Promise<string | null> {
  try {
    const file = path.join(RIREKI_DIR, await sessionKey(name), 'brief.md');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    return file;
  } catch (e) {
    console.error(`[ronin] parking the brief for ${name}:`, e);
    return null;
  }
}

/**
 * LOUD — say on the session's own ladder that its brief was not delivered.
 *
 * A session whose brief never landed looks completely alive from anywhere you can see it:
 * a name, a dial, a running tile. It is the one birth failure with no visible symptom, and
 * until now it was a line in the operator's journal that nobody reads (LAUNCH_READY.md).
 *
 * A GATE IS THE RIGHT SHAPE BY DEFINITION — it means *the work stopped and needs someone* —
 * and it is already drawn on the tile header and in the roster, so nothing new is invented
 * to show it. Ruled by the QB, 2026-08-20.
 *
 * IT IS NEVER TYPED INTO THE TILE. Writing an explanation into the pane is the exact sin
 * this whole buildout exists to end; this writes the file the tile already reads.
 *
 * SURGICAL AND TIMID, the same discipline as `writeSessionRole` above and for the same reason: a
 * letter is the session's own words and Ronin is a guest in it. It replaces the `ladder`
 * VALUE and nothing else, and it refuses outright unless the ladder is empty or is a single
 * gate — the only two states this can honestly own. The moment an agent has put a real
 * ladder up, those are its words and this stays out. Passing '' clears the gate again,
 * which is how a hold that resolves stops leaving a stale rung behind.
 */
export async function writeGate(name: string, gate: string): Promise<boolean> {
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return false; // no letter — every launch seeds one, so this is a box in a bad way
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return false;
  const body = block[1];
  // A FLAT array only: `[…]` with no nested brackets. A ladder carrying phases has
  // `"legs": [ … ]` inside it, so it simply does not match and we leave it alone. That is
  // the guard, and it is deliberately a shape test rather than a parse of the whole letter.
  const ladder = body.match(/"ladder"\s*:\s*\[[^[\]]*\]/);
  if (!ladder) return false;
  let rungs: unknown;
  try {
    rungs = (JSON.parse(`{${ladder[0]}}`) as { ladder: unknown }).ladder;
  } catch {
    return false;
  }
  if (!Array.isArray(rungs)) return false;
  // Empty, or one rung that is a gate. Anything else belongs to the session.
  const ours = rungs.length === 0 || (rungs.length === 1 && !!(rungs[0] as { gate?: unknown })?.gate);
  if (!ours) return false;

  const value = gate ? JSON.stringify([{ gate, status: 'ACTIVE' }]) : '[]';
  const next = body.replace(ladder[0], `"ladder": ${value}`);
  try {
    JSON.parse(next); // the guard: never leave a letter the tile cannot read
  } catch {
    return false;
  }
  const out =
    text.slice(0, block.index!) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.gate`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return true;
}

/** A session, plus its axis out of its letter. */
export type SessionWithAxes = SessionInfo & { session_role: string };

/**
 * Every producer of a client-facing session list runs through here — `/api/sessions`,
 * `/api/home`, and both ws pushes — so the mark can never be present on one surface and
 * missing on another. One letter read per session per list; the same cost michi's row
 * field already pays, on lists that are already a tmux round trip.
 *
 * THE MARK RIDES THE LIST: the session_role's icon, on every surface that lists
 * sessions. Team context is not read here — it is contextual per team, and the surfaces
 * that need it ask the teams routes.
 */
export async function withAxes(list: SessionInfo[]): Promise<SessionWithAxes[]> {
  // THE CAMPAIGN IS RESOLVED HERE, once per list rather than once per row: an Agent born
  // before Campaigns carries no id, and every surface must see it as the Campaign the
  // migration seeded rather than as belonging to nothing. This is the compatibility read
  // (src/campaign-scope.ts), and it is the ONLY place a session list applies it — which is
  // what makes the fallback removable in one edit when the window closes.
  const { campaignResolver, machineCampaignId } = await import('./campaign-scope.js');
  const resolve = await campaignResolver();
  const machine = await machineCampaignId();
  return Promise.all(
    list.filter((s) => !machine || resolve(s.campaign_id) === machine).map(async (s) => ({
      ...s,
      session_role: await readSessionRole(s.name),
      campaign_id: resolve(s.campaign_id),
    })),
  );
}

/**
 * REFRESH THE LETTER'S DERIVED TEAMS BLOCK — the machinery's own write.
 *
 * Called when membership changes (the tags route) and at birth via the seed; the third
 * refresher is `write_tegami` itself, which regenerates the block on every whole-letter
 * save. Surgical exactly like `writeSessionRole`: it replaces the `teams` VALUE inside
 * the fenced block and touches nothing else. A letter with no block, or none at all, is
 * left alone — the agent's own next save will carry the fresh derivation.
 */
export async function writeTeams(name: string, tags: string[]): Promise<boolean> {
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    return false;
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return false;
  const body = block[1];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return false;
  }
  const teams = await deriveTeams(tags);
  parsed['teams'] = teams;
  // Re-serialise ONLY via targeted replacement where possible; the teams value is
  // machinery data, so replacing its serialized form is safe. When the key is absent we
  // insert it after the opening brace.
  const key = /"teams"\s*:\s*(\[[^\]]*(?:\{[^}]*\}[^\]]*)*\])/;
  const value = JSON.stringify(teams);
  const next = key.test(body)
    ? body.replace(key, `"teams": ${value}`)
    : body.replace(/\{/, `{ "teams": ${value},`);
  try {
    JSON.parse(next);
  } catch {
    return false;
  }
  const out = text.slice(0, block.index!) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.teams`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return true;
}
