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
  name: string;
  campaign_id: string;
  title: string;
  kind: TeamKind;
  objective: string;
  project_root: string;
  repos: string[];
  branch: string;
  branches: Record<string, string>;
  wipeboard: string;
  state: 'active' | 'archived';
  references: string[];
  routines: Record<string, boolean>;
  behaviours: TeamBehaviours;
  agent_defaults: TeamAgentDefaults;
}

const dir = () => storeDir('team_rosters');

export const isValidTeamName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
export const isReservedTeamName = (s: string): boolean => s === 'unassigned';
export const isCreatableTeamName = (s: string): boolean => isValidTeamName(s) && !isReservedTeamName(s);

export const isValidCampaignId = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

const campaignDir = (campaign_id: string): string =>
  campaign_id ? path.join(dir(), campaign_id) : dir();

export const teamRosterFile = (name: string, campaign_id = ''): string => {
  if (campaign_id && !isValidCampaignId(campaign_id)) {
    throw new Error(`"${campaign_id}" is not a valid campaign_id.`);
  }
  return path.join(campaignDir(campaign_id), `${name}.md`);
};

const BLANK = '—';

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

async function readAt(name: string, campaign_id: string): Promise<TeamRoster | null> {
  try {
    return parse(name, await readFile(teamRosterFile(name, campaign_id), 'utf8'), campaign_id);
  } catch {
    return null;
  }
}

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

const KEYS: (keyof RosterEdit)[] = [
  'title', 'kind', 'objective', 'project_root', 'repos', 'branch', 'branches', 'wipeboard', 'state',
  'references', 'routines', 'behaviours', 'agent_defaults',
];

function render(name: string, r: TeamRoster): string {
  const line = (k: string, v: string) => `- **${k}:** ${v || BLANK}`;
  return [
    `# ${name}`,
    '',
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

async function freeBoardToken(name: string, campaign_id: string): Promise<string> {
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

export async function createTeamRoster(name: string, edit: RosterEdit, campaign_id = ''): Promise<TeamRoster> {
  if (!isCreatableTeamName(name)) throw new Error(`"${name}" is not available as a team name.`);
  if (campaign_id && !isValidCampaignId(campaign_id)) throw new Error(`"${campaign_id}" is not a valid campaign_id.`);
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

export async function writeTeamRoster(name: string, edit: RosterEdit, campaign_id?: string): Promise<TeamRoster> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster. Create it first.`);
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

export async function deleteTeamRoster(name: string, campaign_id?: string): Promise<void> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster.`);
  await unlink(teamRosterFile(name, existing.campaign_id));
}
