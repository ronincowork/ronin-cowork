/**
 * TEAM ROSTERS — the durable record of each team, one file per team.
 *
 * THE TEAM IS THE ORGANIZING CONCEPT (owner, 2026-08-23), and this file is its durable
 * half. A roster holds what outlives every member: the team's kind, objective, kit and
 * defaults that seed a launch into it, plus its wipeboard and lifecycle state.
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
import { entryValue, isKeyLine } from './resources.js';
import { storeDir } from './resources.js';
import { teamAgentDefaults, type TeamAgentDefaults } from './agent-defaults.js';
import { completeRoutineChoices } from './routines.js';

async function completeRoutines(value: unknown): Promise<Record<string, boolean>> {
  const { listRoutines } = await import('./resource-adapters.js');
  return completeRoutineChoices(await listRoutines(), value);
}

export type TeamKind = 'open' | 'coding' | 'work' | 'personal' | 'household' | 'social' | 'school';
export interface TeamBehaviours { books: string[]; required: boolean }

export interface TeamRoster {
  /** The team's name — the tag sessions carry, and the filename. */
  name: string;
  /**
   * THE CAMPAIGN THIS COWORK BELONGS TO — one, never an array (CAMPAIGN_SCOPING).
   *
   * A team name resolves INSIDE its Campaign, so identity here is `campaign_id + name`
   * and the storage nests to match: `team_rosters/<campaign_id>/<name>.md`. Two Campaigns
   * may each hold a Cowork called `dev` and neither shadows the other.
   *
   * '' MEANS UNMARKED, and it is a real answer rather than a gap: a roster written before
   * Campaigns existed sits flat in the store with no id, and the compatibility read maps
   * it to the initial Campaign. That mapping is deliberately NOT done here — this store
   * reports what is written and never guesses an id it did not stamp, because a store
   * that invents identity is a second writer by the back door.
   */
  campaign_id: string;
  /** Readable owner-facing name; the stable name remains the filename and membership key. */
  title: string;
  /** What this Team is for. It is the Team's own value; a Campaign is kindless. */
  kind: TeamKind;
  objective: string;
  /** Launch DEFAULTS, never constraints: they seed the form when a session is raised
   *  into this team. */
  project_root: string;
  /** The repositories a coordinated promotion carries, comma-separated in the file.
   *  Empty means the project_root's repository alone (docs/team-promotion.md). */
  repos: string[];
  branch: string;
  /** Per-repository branches for a team working without Worktrees ({repo: branch}); absent
   *  means as checked out. With Worktrees on the branch is Ronin's and this is not read. */
  branches: Record<string, string>;
  /** The board underneath this team. Defaults to the team's own token. */
  wipeboard: string;
  state: 'active' | 'archived';
  references: string[];
  routines: Record<string, boolean>;
  behaviours: TeamBehaviours;
  agent_defaults: TeamAgentDefaults;
}

const dir = () => storeDir('team_rosters');

/** A team name obeys the tag rules: lowercase, boring, typeable. */
export const isValidTeamName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
export const isReservedTeamName = (s: string): boolean => s === 'unassigned';
export const isCreatableTeamName = (s: string): boolean => isValidTeamName(s) && !isReservedTeamName(s);

/**
 * A Campaign id is a PATH SEGMENT here, so this is a guard before it is a validator.
 * `machine settings campaign record` owns the canonical rule; what this file must guarantee is that an id
 * arriving from a route can never climb out of the store — `..`, a slash or an absolute
 * path would write a roster anywhere on the box. Same shape as a team name, and the
 * narrowness is the point rather than a coincidence.
 */
export const isValidCampaignId = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

/**
 * Where one Campaign's rosters live. An unmarked roster ('' ) sits FLAT in the store root,
 * which is where every roster written before Campaigns already is — so the legacy layout
 * is not a special case to migrate around, it is simply the '' Campaign's directory.
 */
const campaignDir = (campaign_id: string): string =>
  campaign_id ? path.join(dir(), campaign_id) : dir();

/**
 * Canonical source path for one durable roster, including proposed-roster attribution.
 * Identity is `campaign_id + name`, so both are needed to name a file; omitting the
 * Campaign addresses the unmarked/legacy record, which is the compatibility path.
 */
export const teamRosterFile = (name: string, campaign_id = ''): string => {
  if (campaign_id && !isValidCampaignId(campaign_id)) {
    throw new Error(`"${campaign_id}" is not a valid campaign_id.`);
  }
  return path.join(campaignDir(campaign_id), `${name}.md`);
};

/** The mark a blank field is WRITTEN as, so the file reads as a page and not a form with
 *  holes. It is a rendering, and `parse` must read it back as the blank it stands for —
 *  until 2026-08-26 it did not, and one edit turned every untouched blank into a literal
 *  "—" (a project_root named "—", refused at the next launch). */
const BLANK = '—';

/**
 * `campaign_id` is read from the DIRECTORY when the roster is nested, and only from the
 * key line when it is flat. The directory is where identity actually lives — a file's own
 * line can be hand-edited to claim another Campaign, and a record that claims one place
 * while sitting in another is exactly the drift the nesting exists to prevent.
 */
/** A {string: string} map, anything else reads as empty. */
function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => key.trim() && typeof entry === 'string' && entry.trim())
    .map(([key, entry]) => [key.trim().slice(0, 128), (entry as string).trim().slice(0, 128)]));
}

function parse(name: string, raw: string, campaign_id = ''): TeamRoster {
  const lines = raw.split('\n');
  const get = (k: string) => {
    const v = entryValue(lines, k).trim();
    return v === BLANK || v === '-' ? '' : v;
  };
  const json = (k: string): unknown => {
    try { return JSON.parse(get(k)); } catch { return undefined; }
  };
  const strings = (value: unknown, max: number): string[] => Array.isArray(value)
    ? value.map((entry) => typeof entry === 'string' ? entry.trim().slice(0, max) : '').filter(Boolean)
    : [];
  const routineMap = json('routines');
  const routines = routineMap && typeof routineMap === 'object' && !Array.isArray(routineMap)
    ? Object.fromEntries(Object.entries(routineMap).filter(([, enabled]) => typeof enabled === 'boolean')) as Record<string, boolean>
    : {};
  const behaviourValue = json('behaviours');
  const behaviourMap = behaviourValue && typeof behaviourValue === 'object' && !Array.isArray(behaviourValue)
    ? behaviourValue as Record<string, unknown> : {};
  const kind = get('kind');
  return {
    name,
    campaign_id: campaign_id || get('campaign_id'),
    title: get('title') || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    kind: ['open', 'coding', 'work', 'personal', 'household', 'social', 'school'].includes(kind)
      ? kind as TeamKind : 'open',
    objective: get('objective'),
    project_root: get('project_root'),
    repos: strings(get('repos').split(','), 160),
    branch: get('branch'),
    branches: stringMap(json('branches')),
    wipeboard: get('wipeboard') || name,
    state: /^archived$/i.test(get('state')) ? 'archived' : 'active',
    references: strings(json('references'), 500),
    routines,
    behaviours: { books: strings(behaviourMap.books, 160), required: behaviourMap.required === true },
    agent_defaults: teamAgentDefaults(json('agent_defaults')),
  };
}

/** The raw read of one file at one address. The only place a roster is parsed off disk. */
async function readAt(name: string, campaign_id: string): Promise<TeamRoster | null> {
  try {
    return parse(name, await readFile(teamRosterFile(name, campaign_id), 'utf8'), campaign_id);
  } catch {
    return null;
  }
}

/** The Campaign directories in the store — every subdirectory whose name is a legal id. */
async function campaignDirs(): Promise<string[]> {
  try {
    const entries = await readdir(dir(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && isValidCampaignId(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * One roster, or null when the team has no durable record (a tag-only team).
 *
 * WITH a Campaign, the lookup is exact: a name resolves inside its Campaign and nowhere
 * else, which is the whole point of nesting.
 *
 * WITHOUT one — the compatibility path every caller still takes until they are threaded —
 * it reads the unmarked record, then looks across the Campaigns. Finding the SAME team
 * name in two Campaigns THROWS rather than picking one: that is the collision this leg
 * exists to make impossible, and a caller that reaches it is a caller nobody has given
 * Campaign context to yet. Silently returning either one would be the drift.
 */
export async function readTeamRoster(name: string, campaign_id?: string): Promise<TeamRoster | null> {
  if (!isValidTeamName(name)) return null;
  if (campaign_id !== undefined) {
    if (campaign_id && !isValidCampaignId(campaign_id)) return null;
    return readAt(name, campaign_id);
  }
  const unmarked = await readAt(name, '');
  const found = unmarked ? [unmarked] : [];
  for (const id of await campaignDirs()) {
    const r = await readAt(name, id);
    if (r) found.push(r);
  }
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new Error(
      `Team "${name}" exists in more than one Campaign (${found.map((r) => r.campaign_id || 'unmarked').join(', ')}). ` +
        'Ask for it by Campaign — a team name resolves inside its Campaign.',
    );
  }
  return found[0];
}

/**
 * Every roster on this box, zero-member teams included — the League list.
 *
 * Both layouts in one pass: the unmarked records flat in the store root, and each
 * Campaign's directory beneath it. Every row carries its own `campaign_id`, so FILTERING
 * BY CAMPAIGN IS THE CALLER'S — the compatibility mapping of '' onto the initial Campaign
 * lives in one place up in the routes, not scattered through the store.
 */
export async function listTeamRosters(): Promise<TeamRoster[]> {
  const out: TeamRoster[] = [];
  const readDirOf = async (campaign_id: string) => {
    let names: string[];
    try {
      names = await readdir(campaignDir(campaign_id));
    } catch {
      return; // no store yet — the ordinary fresh state
    }
    for (const f of names.sort()) {
      if (!f.endsWith('.md') || f.startsWith('.')) continue;
      const r = await readAt(f.replace(/\.md$/, ''), campaign_id);
      if (r) out.push(r);
    }
  };
  await readDirOf('');
  for (const id of await campaignDirs()) await readDirOf(id);
  return out;
}

/** The metadata a write may state. Members and leads are refused BY NAME in the route —
 *  they are derived facts and a roster carrying them would be the drift this store
 *  exists to prevent. */
export interface RosterEdit {
  title?: string;
  kind?: TeamKind;
  objective?: string;
  project_root?: string;
  repos?: string[];
  branch?: string;
  branches?: Record<string, string>;
  wipeboard?: string;
  state?: 'active' | 'archived';
  references?: string[];
  routines?: Record<string, boolean>;
  behaviours?: TeamBehaviours;
  agent_defaults?: Partial<TeamAgentDefaults>;
}

/**
 * `campaign_id` is deliberately NOT here. Moving a Cowork between Campaigns changes its
 * namespace, its wipeboard address and which Project roots it may reference — the plan
 * calls that a deliberate migration operation and a non-goal for this cut, so it is set
 * once at create and never reachable through an edit.
 */
const KEYS: (keyof RosterEdit)[] = [
  'title', 'kind', 'objective', 'project_root', 'repos', 'branch', 'branches', 'wipeboard', 'state',
  'references', 'routines', 'behaviours', 'agent_defaults',
];

function render(name: string, r: TeamRoster): string {
  const line = (k: string, v: string) => `- **${k}:** ${v || BLANK}`;
  return [
    `# ${name}`,
    '',
    // Written even though a nested file's directory already carries it: a stamped-but-not-
    // yet-moved record has nowhere else to say which Campaign it belongs to, and a file
    // that names its own Campaign reads correctly to a human holding just the file.
    ...(r.campaign_id ? [line('campaign_id', r.campaign_id)] : []),
    line('title', r.title),
    line('kind', r.kind),
    line('objective', r.objective),
    line('project_root', r.project_root),
    line('repos', r.repos.join(', ')),
    line('branch', r.branch),
    line('branches', JSON.stringify(r.branches)),
    line('wipeboard', r.wipeboard || name),
    line('state', r.state),
    line('references', JSON.stringify(r.references)),
    line('routines', JSON.stringify(r.routines)),
    line('behaviours', JSON.stringify(r.behaviours)),
    line('agent_defaults', JSON.stringify(r.agent_defaults)),
    '',
  ].join('\n');
}

/**
 * THE BOARD TOKEN A NEW COWORK GETS, and why the collision is solved by ALLOCATION rather
 * than by namespacing the wipeboard store.
 *
 * The plan says a team wipeboard "must avoid collisions between equal Cowork names in two
 * Campaigns" and does not say how. Nesting the store — `wipeboards/<campaign_id>/<name>/` —
 * is genuinely ambiguous, because a wipeboard IS a directory: nothing on disk distinguishes
 * a Campaign directory called `health` from a board called `health`, and `house` plus every
 * roster-less board would have to be special-cased out of the migration.
 *
 * So nothing about the wipeboard store changes. A roster's `wipeboard:` is ALREADY an
 * opaque pointer that may point anywhere — "names do not decide anything… the board is that
 * team's because the roster says so" (docs/wipeboards.md) — so the fix is to hand a new
 * Cowork a token nothing else holds. `dev` in the first Campaign keeps `dev`; `dev` in the
 * second gets `health-dev`. Uniqueness is what the requirement actually needs; the token
 * never has to be decomposed back into its parts, so it needs no parseable separator.
 *
 * Nothing already on disk moves, no post or cursor is touched, and `house` and the
 * roster-less boards keep the addresses they have.
 */
async function freeBoardToken(name: string, campaign_id: string): Promise<string> {
  // Dynamic, mirroring how wipeboards.ts reaches back here: a static edge in both
  // directions is the cycle `check-modules` refuses.
  const { boardExists } = await import('./wipeboards.js');
  const taken = new Set((await listTeamRosters()).map((r) => r.wipeboard).filter(Boolean));
  const free = async (token: string) => !taken.has(token) && !(await boardExists(token));
  if (await free(name)) return name;
  if (campaign_id && (await free(`${campaign_id}-${name}`))) return `${campaign_id}-${name}`;
  for (let n = 2; n < 100; n++) {
    const candidate = campaign_id ? `${campaign_id}-${name}-${n}` : `${name}-${n}`;
    if (await free(candidate)) return candidate;
  }
  throw new Error(`No free wipeboard token for "${name}".`);
}

/**
 * CREATE — Build Team's first act. Refuses a name that already has a roster: creating
 * over a team is a different intent from editing one, and the refusal keeps them apart.
 */
export async function createTeamRoster(name: string, edit: RosterEdit, campaign_id = ''): Promise<TeamRoster> {
  if (!isCreatableTeamName(name)) throw new Error(`"${name}" is not available as a team name.`);
  if (campaign_id && !isValidCampaignId(campaign_id)) throw new Error(`"${campaign_id}" is not a valid campaign_id.`);
  // Scoped to the Campaign it is being created in: the same team name in ANOTHER Campaign
  // is not a collision, it is the whole feature.
  if (await readTeamRoster(name, campaign_id)) throw new Error(`Team "${name}" already has a roster — edit it instead.`);
  const roster: TeamRoster = {
    name,
    campaign_id,
    title: edit.title?.trim() || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    kind: edit.kind ?? 'open',
    objective: edit.objective ?? '',
    project_root: edit.project_root ?? '',
    repos: edit.repos ?? [],
    branch: edit.branch ?? '',
    branches: edit.branches ?? {},
    // An explicit token is the owner's and is taken as given; only the DEFAULT is allocated,
    // because the default is the only thing that could collide with another Campaign's
    // same-named Cowork.
    wipeboard: edit.wipeboard || (await freeBoardToken(name, campaign_id)),
    state: edit.state ?? 'active',
    references: edit.references ?? [],
    routines: await completeRoutines(edit.routines),
    behaviours: edit.behaviours ?? { books: [], required: false },
    agent_defaults: teamAgentDefaults(edit.agent_defaults),
  };
  await mkdir(campaignDir(campaign_id), { recursive: true });
  const target = teamRosterFile(name, campaign_id);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, render(name, roster), 'utf8');
  await rename(tmp, target);
  return roster;
}

/**
 * EDIT — the metadata as a unit. Only stated keys change; the file is re-read and only
 * the `- **key:**` lines are replaced, so prose the owner wrote around them survives.
 * Nested record fields are encoded as JSON on their key line so the Markdown remains
 * hand-editable while arrays, booleans and maps round-trip without a second format.
 */
export async function writeTeamRoster(name: string, edit: RosterEdit, campaign_id?: string): Promise<TeamRoster> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster. Create it first.`);
  // The record's OWN Campaign addresses the file from here on: an unscoped edit must land
  // on the record it just read, not back on the flat path it may not live at.
  const where = existing.campaign_id;
  let raw = await readFile(teamRosterFile(name, where), 'utf8');
  const lines = raw.split('\n');
  const normalizedEdit: RosterEdit = edit.routines === undefined
    ? edit
    : { ...edit, routines: await completeRoutines(edit.routines) };
  const merged: TeamRoster = {
    ...existing,
    ...Object.fromEntries(KEYS.filter((k) => normalizedEdit[k] !== undefined).map((k) => [k, normalizedEdit[k]])),
  } as TeamRoster;
  for (const k of KEYS) {
    if (normalizedEdit[k] === undefined) continue;
    const nested = ['references', 'routines', 'behaviours', 'agent_defaults'].includes(k);
    const v = nested ? JSON.stringify(normalizedEdit[k])
      : k === 'repos' ? (normalizedEdit.repos ?? []).join(', ')
      : String(normalizedEdit[k] ?? '');
    const lineText = `- **${k}:** ${v || BLANK}`;
    const at = lines.findIndex((l) => new RegExp(`^-\\s*\\*\\*${k}:\\*\\*`).test(l.trim()));
    if (at === -1) {
      let last = -1;
      for (let i = 0; i < lines.length; i++) if (isKeyLine(lines[i])) last = i;
      lines.splice(last + 1, 0, lineText);
    } else lines[at] = lineText;
  }
  raw = lines.join('\n');
  const target = teamRosterFile(name, where);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, raw, 'utf8');
  await rename(tmp, target);
  const back = await readTeamRoster(name, where);
  if (!back) throw new Error(`Refused: "${name}" does not read back after the edit.`);
  return back;
}

/**
 * DISSOLVE — the roster file is deleted. The wipeboard is NOT (nothing on a button
 * deletes a file, owner 2026-08-07): it reverts to being a custom board, or the owner
 * removes it by hand.
 */
export async function deleteTeamRoster(name: string, campaign_id?: string): Promise<void> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster.`);
  await unlink(teamRosterFile(name, existing.campaign_id));
}
