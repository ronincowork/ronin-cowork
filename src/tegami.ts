/**
 * THE LETTER'S ROLE HALF — cowork's, because a role is set at birth and a ladder is not.
 *
 * `session_job` is what a session IS DOING. It is fixed mechanically the moment the
 * session is launched — the owner pressed a button on the ＋ New session board and that
 * button IS the role — and the session may change it afterwards with `write_tegami`.
 * Neither of those is a MICHI concern: michi is the ladder, and a session has a role
 * whether or not it ever puts a ladder up.
 *
 * So the letter has two halves with different owners, in one file:
 *
 *   cowork (here)  seed the file at birth with `session_job` already filled; read the
 *                  role back out for the roster. Nothing else in the block is parsed.
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
 * shell, same shape, plus a role it would have left blank. Nothing in the services repo
 * has to change for this to be correct. (When it is next touched, michi's seed half is
 * dead code and should go; its `addBirthLines` still names the file, which is why we do
 * not add a birth line of our own and double-brief every session on a services install.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { RIREKI_DIR, sessionKey } from './session-dir.js';
import { listSessionJobs } from './catalog.js';
import type { SessionInfo } from './tmux.js';

/** The session's letter. One file, one name, no alternatives to search. */
export function tegamiPath(key: string): string {
  return path.join(RIREKI_DIR, key, 'tegami.md');
}

/**
 * The role lines, READ FROM THE CATALOG — never restated here.
 *
 * `ronin_catalogs/SESSION_JOBS.md` is the authority on what a kind is. A second copy in
 * this file would be correct exactly until someone edited one of them, and the whole
 * point of a letter that teaches at the moment of use is that what it teaches is
 * current. If the catalog cannot be read we print no list at all rather than a stale one.
 */
async function roleLines(): Promise<string> {
  try {
    const rows = (await listSessionJobs())
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
 * `session_job` is filled, not blank: the launcher already knows what it launched, and
 * making the session guess a fact the owner stated is how a roster ends up showing
 * "unknown" for sessions nobody was ever unsure about. The ladder is michi's and is
 * seeded EMPTY here — a gate we cannot service (no chip, no monitor) would light every
 * tile amber waiting on a go-ahead nobody is watching for.
 */
function seedShell(name: string, job: string, roles: string): string {
  return `# TEGAMI — ${name}
> **This file is your ladder, and it is a good way to communicate that you understand your
> role, the input you need from the user, and your planned phases and legs.** What you keep
> here is shown on the user's tile and on their session_roster for quick reference. Keep it true
> and save it when it changes — a stale ladder is worse than none.
>
> At the end of a turn, consider updating it with \`write_tegami\`. Not keeping it current is
> poor quality.
>
> YOUR **session_job** is already set below — it is the button the owner pressed to start
> you, so it is a statement of what you were asked for, not a guess. Change it when the work
> changes: a session that finishes planning and starts building has changed job, not become
> a new session. It is the SESSION's job, not the agent's: same binary, different work.
>
${roles}
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
  "session_job": ${JSON.stringify(job)},
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
export async function seedTegami(name: string, job: string): Promise<string | null> {
  try {
    const file = tegamiPath(await sessionKey(name));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seedShell(name, job, await roleLines()), { flag: 'wx' });
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
 * The role a session says it is doing, or '' when it has not said.
 *
 * Deliberately a KEYHOLE read: it pulls the json block and takes one string out of it.
 * A malformed block, a missing file, a letter written by a future michi with keys we
 * have never heard of — all read as '' and none read as an error. The block belongs to
 * the agent and to michi; being unable to parse the rest of it is the normal case here,
 * not a fault, and the roster's job is to draw a blank rather than to complain.
 */
export async function readRole(name: string): Promise<string> {
  try {
    const text = await fs.readFile(tegamiPath(await sessionKey(name)), 'utf8');
    const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    const raw = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const job = (JSON.parse(raw) as { session_job?: unknown }).session_job;
    return typeof job === 'string' ? job.trim() : '';
  } catch {
    return '';
  }
}

/**
 * THE OWNER'S HAND ON THE ROLE — set what a session is doing, from the tile.
 *
 * The session writes this field itself with `write_tegami`, and normally should: it is
 * the party that knows the work changed. But the owner is looking at the tile and can
 * see the agent is not doing what its mark says — an agent that never re-marked itself,
 * or one that was told to do something else mid-flight. Leaving the roster to be wrong
 * until the agent notices makes the mark decoration. So: two writers, one field, the
 * owner's hand last.
 *
 * **SURGICAL, not a rewrite.** It replaces the `session_job` VALUE inside the fenced
 * block and touches nothing else — the ladder, `docs`, `at`, `objective`, the agent's
 * own spacing and every key we have never heard of survive byte for byte. Re-serialising
 * the block from a parse would silently reformat an agent's file, and would drop any key
 * this version does not know about; a letter is the session's own words and Ronin is a
 * guest in it.
 *
 * Three refusals, all of which leave the file exactly as found:
 *   · no letter at all → seed one carrying this role (a session born outside Ronin)
 *   · no json block → refuse. The letter is malformed or hand-mangled, and guessing
 *     where the payload starts is how you destroy a ladder.
 *   · the edit would not re-parse → refuse. Checked before anything is written.
 *
 * The write itself is tmp-then-rename, the same atomic swap `write_tegami` uses, so a
 * reader never sees a half-written letter. Two writers racing can still lose one edit —
 * that is true of `write_tegami` against itself today, and a lock is not worth the
 * machinery for a field a human changes by hand a few times a day.
 */
export async function writeRole(name: string, job: string): Promise<string | null> {
  const clean = job.trim();
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
  const key = /"session_job"\s*:\s*"(?:[^"\\]|\\.)*"/;
  const next = key.test(body)
    ? body.replace(key, `"session_job": ${JSON.stringify(clean)}`)
    : body.replace(/\{/, `{ "session_job": ${JSON.stringify(clean)},`);
  try {
    JSON.parse(next); // the guard: never leave a letter the tile cannot read
  } catch {
    return null;
  }
  const out = text.slice(0, block.index! ) + block[0].replace(body, next) + text.slice(block.index! + block[0].length);
  const tmp = `${file}.job`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
  return clean;
}

/** A session, plus the role out of its letter. */
export type SessionWithRole = SessionInfo & { session_job: string };

/**
 * Every producer of a client-facing session list runs through here — `/api/sessions`,
 * `/api/home`, and both ws pushes — so the mark can never be present on one surface and
 * missing on another. One letter read per session per list; the same cost michi's row
 * field already pays, on lists that are already a tmux round trip.
 */
export async function withRoles(list: SessionInfo[]): Promise<SessionWithRole[]> {
  return Promise.all(list.map(async (s) => ({ ...s, session_job: await readRole(s.name) })));
}
