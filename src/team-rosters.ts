/**
 * TEAM ROSTERS — the durable record of each team, one file per team.
 *
 * THE TEAM IS THE ORGANIZING CONCEPT (owner, 2026-08-23), and this file is its durable
 * half. A roster holds what outlives every member: the team's `team_role`, its
 * objective, and the defaults that seed a launch into it — root, repos, branch — plus
 * the wipeboard it sits above and its lifecycle state.
 *
 * WHAT IT NEVER HOLDS: a member list or a lead pointer. Membership lives on the
 * sessions (`@ronin-tags`) and leadership beside it (`@ronin-lead`), both dying with
 * the session — "the team roster doesn't actually know who is on its team unless you do
 * it virtually, because each session is defining whose team it's on" (the owner's own
 * words, and the KOTOBA row's). A roster with zero live members is a normal, openable
 * state: the plan without the execution.
 *
 * ABOVE THE WIPEBOARD, NOT INSIDE IT. The wipeboard stays the team's high-churn
 * conversation surface exactly as WIPEBOARD_TEAMS landed it; the roster links to it by
 * token (`wipeboard:`, defaulting to the team's own name). A wipeboard with no roster
 * is a custom board and therefore NOT a team.
 *
 * Format is the house catalog format — `- **key:** value` lines, prose free around
 * them — parsed with the same helpers every other catalog uses.
 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { entryValue, isKeyLine } from './catalog.js';
import { splitDefinitionList } from './definitions.js';
import { storeDir } from './stores.js';

export interface TeamRoster {
  /** The team's name — the tag sessions carry, and the filename. */
  name: string;
  /** The team's own defining role. Mutable; blank is valid (owner, 2026-08-23). */
  team_role: string;
  objective: string;
  /** Launch DEFAULTS, never constraints: they seed the form when a session is raised
   *  into this team. */
  project_root: string;
  repos: string[];
  branch: string;
  /** The board underneath this team. Defaults to the team's own token. */
  wipeboard: string;
  state: 'active' | 'archived';
}

const dir = () => storeDir('team_rosters');

/** A team name obeys the tag rules: lowercase, boring, typeable. */
export const isValidTeamName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
export const isReservedTeamName = (s: string): boolean => s === 'unassigned';
export const isCreatableTeamName = (s: string): boolean => isValidTeamName(s) && !isReservedTeamName(s);

/** Canonical source path for one durable roster, including proposed-roster attribution. */
export const teamRosterFile = (name: string): string => path.join(dir(), `${name}.md`);

/** The mark a blank field is WRITTEN as, so the file reads as a page and not a form with
 *  holes. It is a rendering, and `parse` must read it back as the blank it stands for —
 *  until 2026-08-26 it did not, and one edit turned every untouched blank into a literal
 *  "—" (a project_root named "—", refused at the next launch). */
const BLANK = '—';

function parse(name: string, raw: string): TeamRoster {
  const lines = raw.split('\n');
  const get = (k: string) => {
    const v = entryValue(lines, k).trim();
    return v === BLANK || v === '-' ? '' : v;
  };
  return {
    name,
    team_role: get('team_role'),
    objective: get('objective'),
    project_root: get('project_root'),
    repos: splitDefinitionList(get('repos')),
    branch: get('branch'),
    wipeboard: get('wipeboard') || name,
    state: /^archived$/i.test(get('state')) ? 'archived' : 'active',
  };
}

/** One roster, or null when the team has no durable record (a tag-only team). */
export async function readTeamRoster(name: string): Promise<TeamRoster | null> {
  if (!isValidTeamName(name)) return null;
  try {
    return parse(name, await readFile(teamRosterFile(name), 'utf8'));
  } catch {
    return null;
  }
}

/** Every roster on this box, zero-member teams included — the League list. */
export async function listTeamRosters(): Promise<TeamRoster[]> {
  let names: string[];
  try {
    names = await readdir(dir());
  } catch {
    return []; // no store yet — the ordinary fresh state
  }
  const out: TeamRoster[] = [];
  for (const f of names.sort()) {
    if (!f.endsWith('.md') || f.startsWith('.')) continue;
    const name = f.replace(/\.md$/, '');
    const r = await readTeamRoster(name);
    if (r) out.push(r);
  }
  return out;
}

/** The metadata a write may state. Members and leads are refused BY NAME in the route —
 *  they are derived facts and a roster carrying them would be the drift this store
 *  exists to prevent. */
export interface RosterEdit {
  team_role?: string;
  objective?: string;
  project_root?: string;
  repos?: string[];
  branch?: string;
  wipeboard?: string;
  state?: 'active' | 'archived';
}

const KEYS: (keyof RosterEdit)[] = ['team_role', 'objective', 'project_root', 'repos', 'branch', 'wipeboard', 'state'];

function render(name: string, r: TeamRoster): string {
  const line = (k: string, v: string) => `- **${k}:** ${v || BLANK}`;
  return [
    `# ${name}`,
    '',
    line('team_role', r.team_role),
    line('objective', r.objective),
    line('project_root', r.project_root),
    line('repos', r.repos.join(', ')),
    line('branch', r.branch),
    line('wipeboard', r.wipeboard || name),
    line('state', r.state),
    '',
  ].join('\n');
}

/**
 * CREATE — Build Team's first act. Refuses a name that already has a roster: creating
 * over a team is a different intent from editing one, and the refusal keeps them apart.
 */
export async function createTeamRoster(name: string, edit: RosterEdit): Promise<TeamRoster> {
  if (!isCreatableTeamName(name)) throw new Error(`"${name}" is not available as a team name.`);
  if (await readTeamRoster(name)) throw new Error(`Team "${name}" already has a roster — edit it instead.`);
  const roster: TeamRoster = {
    name,
    team_role: edit.team_role ?? '',
    objective: edit.objective ?? '',
    project_root: edit.project_root ?? '',
    repos: edit.repos ?? [],
    branch: edit.branch ?? '',
    wipeboard: edit.wipeboard || name,
    state: edit.state ?? 'active',
  };
  await mkdir(dir(), { recursive: true });
  const target = teamRosterFile(name);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, render(name, roster), 'utf8');
  await rename(tmp, target);
  return roster;
}

/**
 * EDIT — the metadata as a unit. Only stated keys change; the file is re-read and only
 * the `- **key:**` lines are replaced, so prose the owner wrote around them survives.
 * `team_role` is MUTABLE by ruling — changing it does not ripple into running sessions;
 * it surfaces lazily in each member's letter block on their next reread.
 */
export async function writeTeamRoster(name: string, edit: RosterEdit): Promise<TeamRoster> {
  const existing = await readTeamRoster(name);
  if (!existing) throw new Error(`Team "${name}" has no roster. Create it first.`);
  let raw = await readFile(teamRosterFile(name), 'utf8');
  const lines = raw.split('\n');
  const merged: TeamRoster = {
    ...existing,
    ...Object.fromEntries(KEYS.filter((k) => edit[k] !== undefined).map((k) => [k, edit[k]])),
  } as TeamRoster;
  for (const k of KEYS) {
    if (edit[k] === undefined) continue;
    const v = k === 'repos' ? (edit.repos ?? []).join(', ') : String(edit[k] ?? '');
    const lineText = `- **${k}:** ${v || BLANK}`;
    const at = lines.findIndex((l) => new RegExp(`^-\\s*\\*\\*${k}:\\*\\*`).test(l.trim()));
    if (at === -1) {
      let last = -1;
      for (let i = 0; i < lines.length; i++) if (isKeyLine(lines[i])) last = i;
      lines.splice(last + 1, 0, lineText);
    } else lines[at] = lineText;
  }
  raw = lines.join('\n');
  const target = teamRosterFile(name);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, raw, 'utf8');
  await rename(tmp, target);
  const back = await readTeamRoster(name);
  if (!back) throw new Error(`Refused: "${name}" does not read back after the edit.`);
  return back;
}

/**
 * RENAME — the roster file moves; the wipeboard follows only by the landed adoption
 * rules (the team wins its name), which happen on the board side, not here. Live
 * members' tags are the callers' to retag — membership is theirs, not this file's.
 */
export async function renameTeamRoster(from: string, to: string): Promise<TeamRoster> {
  if (!isCreatableTeamName(to)) throw new Error(`"${to}" is not available as a team name.`);
  const existing = await readTeamRoster(from);
  if (!existing) throw new Error(`Team "${from}" has no roster.`);
  if (await readTeamRoster(to)) throw new Error(`Team "${to}" already has a roster.`);
  const raw = await readFile(teamRosterFile(from), 'utf8');
  await writeFile(teamRosterFile(to), raw.replace(new RegExp(`^# ${from}$`, 'm'), `# ${to}`), 'utf8');
  await unlink(teamRosterFile(from));
  const back = await readTeamRoster(to);
  if (!back) throw new Error(`Refused: "${to}" does not read back after the rename.`);
  return back;
}

/**
 * DISSOLVE — the roster file is deleted. The wipeboard is NOT (nothing on a button
 * deletes a file, owner 2026-08-07): it reverts to being a custom board, or the owner
 * removes it by hand.
 */
export async function deleteTeamRoster(name: string): Promise<void> {
  if (!(await readTeamRoster(name))) throw new Error(`Team "${name}" has no roster.`);
  await unlink(teamRosterFile(name));
}
