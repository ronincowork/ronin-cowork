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

/**
 * A Campaign id is a PATH SEGMENT here, so this is a guard before it is a validator.
 * `campaign_config` owns the canonical rule; what this file must guarantee is that an id
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
function parse(name: string, raw: string, campaign_id = ''): TeamRoster {
  const lines = raw.split('\n');
  const get = (k: string) => {
    const v = entryValue(lines, k).trim();
    return v === BLANK || v === '-' ? '' : v;
  };
  return {
    name,
    campaign_id: campaign_id || get('campaign_id'),
    title: get('title') || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    team_role: get('team_role'),
    objective: get('objective'),
    project_root: get('project_root'),
    repos: splitDefinitionList(get('repos')),
    branch: get('branch'),
    wipeboard: get('wipeboard') || name,
    state: /^archived$/i.test(get('state')) ? 'archived' : 'active',
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
  team_role?: string;
  objective?: string;
  project_root?: string;
  repos?: string[];
  branch?: string;
  wipeboard?: string;
  state?: 'active' | 'archived';
}

/**
 * `campaign_id` is deliberately NOT here. Moving a Cowork between Campaigns changes its
 * namespace, its wipeboard address and which Project roots it may reference — the plan
 * calls that a deliberate migration operation and a non-goal for this cut, so it is set
 * once at create and never reachable through an edit.
 */
const KEYS: (keyof RosterEdit)[] = ['title', 'team_role', 'objective', 'project_root', 'repos', 'branch', 'wipeboard', 'state'];

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
    team_role: edit.team_role ?? '',
    objective: edit.objective ?? '',
    project_root: edit.project_root ?? '',
    repos: edit.repos ?? [],
    branch: edit.branch ?? '',
    wipeboard: edit.wipeboard || name,
    state: edit.state ?? 'active',
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
 * `team_role` is MUTABLE by ruling — changing it does not ripple into running sessions;
 * it surfaces lazily in each member's letter block on their next reread.
 */
export async function writeTeamRoster(name: string, edit: RosterEdit, campaign_id?: string): Promise<TeamRoster> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster. Create it first.`);
  // The record's OWN Campaign addresses the file from here on: an unscoped edit must land
  // on the record it just read, not back on the flat path it may not live at.
  const where = existing.campaign_id;
  let raw = await readFile(teamRosterFile(name, where), 'utf8');
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
  const target = teamRosterFile(name, where);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, raw, 'utf8');
  await rename(tmp, target);
  const back = await readTeamRoster(name, where);
  if (!back) throw new Error(`Refused: "${name}" does not read back after the edit.`);
  return back;
}

/**
 * RENAME — the roster file moves; the wipeboard follows only by the landed adoption
 * rules (the team wins its name), which happen on the board side, not here. Live
 * members' tags are the callers' to retag — membership is theirs, not this file's.
 */
export async function renameTeamRoster(from: string, to: string, campaign_id?: string): Promise<TeamRoster> {
  if (!isCreatableTeamName(to)) throw new Error(`"${to}" is not available as a team name.`);
  const existing = await readTeamRoster(from, campaign_id);
  if (!existing) throw new Error(`Team "${from}" has no roster.`);
  // A rename stays INSIDE the Campaign — it changes the name half of the identity and
  // never the Campaign half, which would be a reassignment and is a non-goal this cut.
  const where = existing.campaign_id;
  if (await readTeamRoster(to, where)) throw new Error(`Team "${to}" already has a roster.`);
  const raw = await readFile(teamRosterFile(from, where), 'utf8');
  await writeFile(teamRosterFile(to, where), raw.replace(new RegExp(`^# ${from}$`, 'm'), `# ${to}`), 'utf8');
  await unlink(teamRosterFile(from, where));
  const back = await readTeamRoster(to, where);
  if (!back) throw new Error(`Refused: "${to}" does not read back after the rename.`);
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
