/**
 * THE LETTER'S AXIS HALF — cowork's, because the axes are set at birth and a ladder is not.
 *
 * TWO FIELDS, TWO AUTHORITIES, one record:
 *
 *   family_role      WHO the session is. Seeded at birth from the button the owner pressed,
 *                 and then IMMUTABLE — `write_tegami` preserves it and refuses an
 *                 attempted change, and no live-session control offers to change it.
 *                 A session does not stop being a Developer halfway through.
 *   session_task  WHAT it is doing right now. Seeded at birth and MUTABLE by two writers:
 *                 the session itself with `write_tegami`, and the owner from the tile.
 *                 A committed change injects that task's reading into the running
 *                 session (`src/task-watch.ts`).
 *
 * Blanks are stored as empty strings and are never inferred from each other: a session
 * with a role and no task is a real, ordinary launch.
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
import { listSessionTasks } from './definitions.js';
import type { SessionInfo } from './tmux.js';

const exec = promisify(execFile);

export interface TegamiCheckout {
  repo: string;
  branch: string;
}

/** The checkout the newborn is actually standing in; absence is a legal non-git root. */
export async function checkoutAt(dir: string): Promise<TegamiCheckout> {
  const git = async (...args: string[]) =>
    (await exec('git', ['-C', dir, ...args], { timeout: 2_000 })).stdout.trim();
  try {
    const top = await git('rev-parse', '--show-toplevel');
    const remote = await git('config', '--get', 'remote.origin.url').catch(() => '');
    const branch = await git('branch', '--show-current').catch(() => '') ||
      await git('rev-parse', '--short', 'HEAD').catch(() => '');
    return { repo: remote || top, branch };
  } catch {
    return { repo: '', branch: '' };
  }
}

/** The session's letter. One file, one name, no alternatives to search. */
export function tegamiPath(key: string): string {
  return path.join(RIREKI_DIR, key, 'tegami.md');
}

/**
 * The task lines, READ FROM THE DEFINITIONS — never restated here.
 *
 * `ronin_catalogs/session_tasks/` is the authority on what a task is. A second copy in
 * this file would be correct exactly until someone edited one of them, and the whole
 * point of a letter that teaches at the moment of use is that what it teaches is
 * current. If the directory cannot be read we print no list at all rather than a stale one.
 *
 * TASKS ONLY, and roles deliberately not: this list exists so a session can pick its NEXT
 * value, and the role is the one field it may not change. Listing roles here would be an
 * invitation to do the one thing the letter refuses.
 */
async function taskLines(): Promise<string> {
  try {
    const rows = (await listSessionTasks())
      .filter((k) => k.name && k.remit)
      .map((k) => `> \`${k.name}\` — ${k.remit}`);
    return rows.length ? rows.join('\n') + '\n>' : '';
  } catch {
    return '';
  }
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
  task: string,
  checkout: TegamiCheckout,
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
> YOUR **family_role** is already set below, and it does not change. It is WHO you are for
> this whole session — the hat the owner started you in. \`write_tegami\` preserves it and
> refuses an attempted change, so do not try to edit it; if the role is genuinely wrong,
> that is a new session, not a new value.
>
> YOUR **session_task** is already set below — it is the button the owner pressed to start
> you, so it is a statement of what you were asked for, not a guess. **Change it when the
> work changes**: a session that finishes planning and starts building has changed task,
> not become a new session, and not changed role either. It is the SESSION's task, not the
> agent's: same binary, different work. When you change it, Ronin hands you that task's own
> reading — so re-marking yourself is how you get told what the new work needs.
>
> YOUR **repos** list is started from the checkout the new-session box put you in. It is
> not limited to that project_root: add, remove, or change entries as you work across other
> repositories. Keep every branch current. The branch is the important live coordinate:
> it tells the owner where this session's work is landing.
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
  "family_role": ${JSON.stringify(role)},
  "session_task": ${JSON.stringify(task)},
  "repos": ${JSON.stringify(checkout.repo || checkout.branch ? [checkout] : [])},
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
  task: string,
  checkout: TegamiCheckout = { repo: '', branch: '' },
): Promise<string | null> {
  try {
    const file = tegamiPath(await sessionKey(name));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seedShell(name, role, task, checkout, await taskLines()), { flag: 'wx' });
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
async function readAxis(name: string, key: 'family_role' | 'session_task'): Promise<string> {
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

/** WHAT the session is doing now — the mark, and the mutable axis. */
export const readSessionTask = (name: string): Promise<string> => readAxis(name, 'session_task');

/** WHO the session is — birth-fixed, and never written by anything after the seed. */
export const readFamilyRole = (name: string): Promise<string> => readAxis(name, 'family_role');

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
 * **IT TOUCHES ONE KEY, and `family_role` is not it.** The role is birth-fixed; this route
 * cannot change it, `write_tegami` refuses to change it, and there is no live-session
 * control that offers to. That is the whole of the immutability rule on this side: the
 * only writer that ever sets `family_role` is the seed.
 *
 * **SURGICAL, not a rewrite.** It replaces the `session_task` VALUE inside the fenced
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
export async function writeSessionTask(name: string, task: string): Promise<string | null> {
  const clean = task.trim();
  const file = tegamiPath(await sessionKey(name));
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch {
    // No letter — a session Ronin never launched. Marking it is a reasonable thing to
    // want, so seeding one is the honest way to grant it, not a silent failure.
    return (await seedTegami(name, '', clean)) ? clean : null;
  }
  const block = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!block) return null;
  const body = block[1];
  const key = /"session_task"\s*:\s*"(?:[^"\\]|\\.)*"/;
  const next = key.test(body)
    ? body.replace(key, `"session_task": ${JSON.stringify(clean)}`)
    : body.replace(/\{/, `{ "session_task": ${JSON.stringify(clean)},`);
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
 * SURGICAL AND TIMID, the same discipline as `writeSessionTask` above and for the same reason: a
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

/** A session, plus both axes out of its letter. */
export type SessionWithAxes = SessionInfo & { family_role: string; session_task: string };

/**
 * Every producer of a client-facing session list runs through here — `/api/sessions`,
 * `/api/home`, and both ws pushes — so the mark can never be present on one surface and
 * missing on another. One letter read per session per list; the same cost michi's row
 * field already pays, on lists that are already a tmux round trip.
 *
 * BOTH AXES RIDE THE LIST, and they are drawn differently: the TASK is the mark (its
 * icon, on every surface that lists sessions), and the ROLE is context (the session's
 * details, where it does not compete with a mark that changes).
 */
export async function withAxes(list: SessionInfo[]): Promise<SessionWithAxes[]> {
  return Promise.all(
    list.map(async (s) => ({
      ...s,
      family_role: await readFamilyRole(s.name),
      session_task: await readSessionTask(s.name),
    })),
  );
}
