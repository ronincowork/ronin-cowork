/**
 * THE TWO DEFINITION DIRECTORIES — `job_roles/` and `session_tasks/`.
 *
 * A launch picks three axes: a required `project_root`, an optional `job_role` (who the
 * session is, fixed for its life) and an optional `session_task` (what it is doing now,
 * mutable). The last two are defined here, and they share one storage law.
 *
 * ONE FILE PER THING, rather than one growing markdown document. That is what makes a
 * role or a task the unit of ownership:
 *
 *   ronin_catalogs/job_roles/<token>.md          ours, replaced on upgrade
 *   <catalogs store>/job_roles/<token>.md        yours, survives upgrade AND uninstall
 *
 *   ronin_catalogs/session_tasks/<token>.md      ours
 *   <catalogs store>/session_tasks/<token>.md    yours
 *
 * The merged directory IS the manifest. There is no second generated file, so there is
 * nothing to drift from — the same reason the session-boot shelf lists a directory rather
 * than storing a list of paths.
 *
 * WHOLE-DEFINITION SHADOWING, keyed by filename. Your `developer.md` replaces ours
 * WHOLE — never field by field. Field-merging would mean a field could never be removed
 * and that neither file, read on its own, told you what you were running. A new token
 * adds a definition; `- **hidden:** yes` withdraws one of ours without our having to
 * delete a shipped file.
 *
 * SHADOWING AND CASCADING ARE DIFFERENT OPERATIONS, and conflating them is the trap this
 * comment exists to mark. Shadowing decides WHICH definition of `developer` you get.
 * Only after that has resolved to one file do its launch fields cascade against the
 * system and the selected task (`src/launch-profile.ts`). One is about identity, the
 * other is about defaults.
 *
 * ORDER IS STATED, NEVER ENUMERATED. A directory has no file order — readdir's is
 * whatever the filesystem says today — so a board built on enumeration would reshuffle
 * itself for no reason anyone could see. `- **order:** 10` is the answer; definitions
 * without one follow the ordered ones, by label.
 *
 * MALFORMED IS NAMED, NEVER HALF-MERGED. A file with no `- **key:** value` line at all is
 * not a definition; it is reported by name and omitted. `scripts/check-catalogs.ts` fails
 * the build for a malformed STOCK file, which is where that mistake is ours to fix.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { STOCK_DIR, entryValue, isKeyLine, type Origin } from './catalog.js';
import { storeDir } from './stores.js';

/** The two directories, and the only two. Each is a token in its own right. */
export type DefinitionKind = 'job_roles' | 'session_tasks';

export interface Definition {
  /** The token — the filename without `.md`. Never the `#` heading. */
  name: string;
  /** Which scope defined this — `user` means shadowed or added, never shipped. */
  origin: Origin;
  /** Yours, standing in a shipped definition's place — "changed", not "added". */
  shadowed: boolean;
  /** The file it was read from. Named in every refusal, so a bad field is traced to the
   *  file that states it rather than to "the catalog". */
  file: string;
  /** The value of one `- **key:** value` line, or '' when this definition is silent. */
  get: (key: string) => string;
  /**
   * Does this definition STATE the key at all?
   *
   * The cascade turns on this and not on `get`, because absence and emptiness are
   * different answers: an absent `mcp:` inherits, and there is no way to write "inherit"
   * as a value. A key line with an empty value is a half-written line, not a statement,
   * so it reads as absent too.
   */
  has: (key: string) => boolean;
}

/** README.md is the directory's own explainer, one level up from being data. */
const isDefinitionFile = (n: string): boolean =>
  n.endsWith('.md') && !n.startsWith('.') && n !== 'README.md';

/** The tombstone: how a user file withdraws a shipped definition. */
const isHidden = (d: Definition): boolean => /^yes$/i.test(d.get('hidden'));

/**
 * Every definition in one directory, keyed by token. A directory that is not there is the
 * ORDINARY state for the user half — a fresh install has never written one — and reads as
 * empty rather than as a fault.
 */
async function readDir(base: string, origin: Origin): Promise<Map<string, Definition>> {
  let names: string[];
  try {
    names = await readdir(base);
  } catch {
    return new Map();
  }
  const out = new Map<string, Definition>();
  for (const name of names.sort()) {
    if (!isDefinitionFile(name)) continue;
    const file = path.join(base, name);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue; // vanished mid-read, or a dangling link
    }
    const lines = raw.split('\n');
    if (!lines.some(isKeyLine)) {
      // Named, not swallowed. A file in a definition directory that states nothing is
      // either a mistake or a note somebody meant to put elsewhere, and either way the
      // owner needs to hear which file it was.
      console.error(`[ronin] ${file}: no \`- **key:** value\` lines — not a definition, skipped.`);
      continue;
    }
    const token = name.replace(/\.md$/, '');
    out.set(token, {
      name: token,
      origin,
      shadowed: false,
      file,
      get: (key: string) => entryValue(lines, key),
      has: (key: string) => entryValue(lines, key) !== '',
    });
  }
  return out;
}

/**
 * Both halves, merged, with provenance intact.
 *
 * Ordered by the stated `order:` and then by label, NOT by which half a definition came
 * from: a role of the owner's belongs wherever they numbered it, not in a tail after
 * ours. Definitions with no `order:` follow every ordered one, alphabetically by label,
 * so the board is stable across machines and across an upgrade that adds a file.
 */
export async function readDefinitions(kind: DefinitionKind): Promise<Definition[]> {
  const [stock, user] = await Promise.all([
    readDir(path.join(STOCK_DIR, kind), 'stock'),
    readDir(path.join(storeDir('catalogs'), kind), 'user'),
  ]);
  const merged = new Map<string, Definition>();
  for (const [token, d] of stock) merged.set(token, d);
  for (const [token, d] of user) {
    // Yours in ours' place — the one case a surface must be able to say out loud.
    merged.set(token, { ...d, shadowed: stock.has(token) });
  }
  const rank = (d: Definition): number => {
    const n = Number(d.get('order'));
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  };
  const label = (d: Definition): string => (d.get('label') || d.name).toLowerCase();
  return [...merged.values()]
    .filter((d) => !isHidden(d))
    .sort((a, b) => rank(a) - rank(b) || label(a).localeCompare(label(b)));
}

/** One definition by token, or undefined. The refusal message is the caller's to word. */
export async function findDefinition(kind: DefinitionKind, token: string): Promise<Definition | undefined> {
  if (!token) return undefined;
  return (await readDefinitions(kind)).find((d) => d.name === token);
}

/**
 * A comma list, with the em dash read as an empty list rather than as a member.
 *
 * `- **session_tasks:** —` and `- **match:** —` are how a definition says "none" in a
 * file a person reads. Without this the dash became a match word that could never match
 * and a task named `—` that could never resolve.
 */
export const splitDefinitionList = (v: string): string[] =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—' && s !== '-');

/* ---------- the rows a surface draws ---------- */

/**
 * PRESENTATION ONLY, and deliberately so.
 *
 * These rows carry what the ＋ New board needs to DRAW itself — icons, labels, blurbs,
 * shelf membership, provenance. They carry no resolved launch field, because a launch
 * field is only true of a PAIR: `mcpAlways` is on for `personalassistant` with a blank
 * task and off for `developer` with `CutCode`, and a row cannot answer for a pair it does
 * not know about.
 *
 * So the form asks for the resolved profile when the pick changes (`GET /api/launch-profile`)
 * rather than re-implementing the cascade in the client. One cascade, in one language,
 * in one file (`src/launch-profile.ts`) — a second copy in `public/js/` would be correct
 * exactly until somebody edited one of them.
 */
interface Row {
  name: string;
  origin: Origin;
  shadowed: boolean;
  icon: string;
  label: string;
  blurb: string;
  ask: string;
  remit: string;
  /** `[text](url)` — whose work powers this, when it is somebody else's. */
  credit?: { text: string; url: string };
}

export interface JobRoleRow extends Row {
  /** Which tasks sit on this role's shelf, in the order the definition lists them. */
  session_tasks: string[];
}

export interface SessionTaskRow extends Row {
  /** Intent words, for the smart fill. */
  match: string[];
}

/** `[text](https://url)` → {text, url}. http(s) only — a definition is DATA, and data
 *  must not be able to mint a `javascript:` link into the launcher. */
function credit(v: string): { text: string; url: string } | undefined {
  const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(v.trim());
  return m ? { text: m[1], url: m[2] } : undefined;
}

const row = (d: Definition): Row => ({
  name: d.name,
  origin: d.origin,
  shadowed: d.shadowed,
  icon: d.get('icon'),
  label: d.get('label') || d.name,
  blurb: d.get('blurb'),
  ask: d.get('ask'),
  remit: d.get('remit'),
  credit: credit(d.get('credit')),
});

export async function listJobRoles(): Promise<JobRoleRow[]> {
  return (await readDefinitions('job_roles')).map((d) => ({
    ...row(d),
    session_tasks: splitDefinitionList(d.get('session_tasks')),
  }));
}

export async function listSessionTasks(): Promise<SessionTaskRow[]> {
  return (await readDefinitions('session_tasks')).map((d) => ({
    ...row(d),
    match: splitDefinitionList(d.get('match')),
  }));
}

/* ---------- the one write: which tasks sit on a role's shelf ---------- */

/** A task token is a definition filename's stem — word characters and hyphens. */
const isValidToken = (s: string): boolean => /^[\w-]{1,64}$/.test(s);

/**
 * MOVE A TASK BETWEEN ROLES — the promoted board interaction, and the ONLY write this
 * module offers.
 *
 * Creating or deleting a role, and authoring a task, are the next build-out's. This is
 * membership and nothing else: the interaction the old Job Group shelves already had,
 * kept working against the new storage.
 *
 * EDITING A STOCK ROLE SHADOWS IT WHOLE, and that is a real consequence rather than an
 * implementation detail. Membership used to live in a side manifest precisely so a shelf
 * edit could not stop a house role tracking upgrades; the ruling of 2026-08-22 moved
 * membership into the role definition, so the first time the owner re-shelves a task
 * under `developer`, their `developer.md` becomes the definition and ours stops applying
 * to them. The surface says so — provenance turns to **yours replacing ours** — because
 * the alternative is an upgrade quietly changing a board the owner arranged.
 *
 * The file is COPIED, not regenerated: every other field, every line of prose and every
 * key this version has never heard of survives byte for byte. Only the
 * `- **session_tasks:** …` line is replaced, or appended when there was not one.
 */
export async function writeRoleMembership(role: string, tasks: string[]): Promise<string[]> {
  const def = await findDefinition('job_roles', role);
  if (!def) throw new Error(`"${role}" is not a job_role on this box.`);
  const clean = [...new Set(tasks.map((t) => String(t).trim()).filter(Boolean))];
  for (const t of clean) if (!isValidToken(t)) throw new Error(`"${t}" is not a session_task name.`);
  if (clean.length > 64) throw new Error(`A role may shelve at most 64 tasks; "${role}" was given ${clean.length}.`);
  // Every named task must exist. A shelf pointing at nothing draws nothing, and a board
  // edit that silently loses a button is worse than one that says no.
  const known = new Set((await readDefinitions('session_tasks')).map((d) => d.name));
  for (const t of clean) if (!known.has(t)) throw new Error(`"${t}" is not a session_task on this box.`);

  const raw = await readFile(def.file, 'utf8');
  const line = `- **session_tasks:** ${clean.length ? clean.join(', ') : '—'}`;
  const lines = raw.split('\n');
  const at = lines.findIndex((l) => /^-\s*\*\*session_tasks:\*\*/i.test(l.trim()));
  if (at === -1) {
    // No membership line yet: put it after the last key line, so it lands among the
    // fields rather than in the middle of the prose that explains them.
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (isKeyLine(lines[i])) last = i;
    lines.splice(last + 1, 0, line);
  } else lines[at] = line;

  const dir = path.join(storeDir('catalogs'), 'job_roles');
  const target = path.join(dir, `${role}.md`);
  await mkdir(dir, { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, lines.join('\n'), 'utf8');
  await rename(tmp, target);

  // Read the RESULT back through the ordinary reader before reporting success — the same
  // refusal every catalog write makes. A definition we could not read back is a board
  // that would render empty on the next request.
  const back = await findDefinition('job_roles', role);
  if (!back) throw new Error(`Refused: "${role}" does not read back after the edit.`);
  return splitDefinitionList(back.get('session_tasks'));
}
