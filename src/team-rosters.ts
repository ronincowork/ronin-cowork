import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { holdsWritten, rosterListKey } from './holds-hook.js';
import path from 'node:path';
import { entryValue, isKeyLine } from './resources.js';
import { storeDir } from './resources.js';
import { teamAgentDefaults, type LaunchMode, type TeamAgentDefaults } from './agent-defaults.js';
import { launchModeOf, modelsOf, parentSettings, type Models } from './waterfall.js';
import { readWorkspace } from './workspaces.js';
import type { BriefSettings } from './brief-record.js';
import { layerOf } from './brief-settings.js';

export interface TeamRoster {
  name: string;
  campaign_id: string;
  title: string;
  /** What the lead picks up and starts executing (owner, 25 Nov): said to the lead when it is launched. */
  objective: string;
  /** Standing directions to every Agent in the Team (owner, 25 Nov): in each member's brief. */
  instructions: string;
  /** The Workspace this Team is launched in (src/workspaces.ts); its Agents inherit it. */
  workspace: string;
  branch: string;
  branches: Record<string, string>;
  wipeboard: string;
  state: 'active' | 'archived';
  /** This Team's brief settings, integrations and project management (docs/architecture/brief.md, Layers and brief settings). */
  brief: BriefSettings;
  integrations: string[];
  pm?: boolean;
  /** Its settings, copied from its Workspace (or the Campaign) when it was made; each new Agent copies them (src/waterfall.ts). */
  agent_defaults: TeamAgentDefaults;
  launch_mode: LaunchMode;
  models: Models;
  /** Work item ids this Team holds. The items live in the work item store. */
  holds: string[];
  /** Work item ids this Team watches; its lead hears a status change on each (work-items.ts tellWatchers). Its members' items do not make it a watcher. */
  watches: string[];
}

const dir = () => storeDir('team_rosters');

export const isValidTeamName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);
const isReservedTeamName = (s: string): boolean => s === 'unassigned';
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
    ? value.map((entry) => typeof entry === 'string' ? entry.trim().slice(0, max) : '').filter((entry) => Boolean(entry) && entry !== 'mandates')
    : [];
  const layer = layerOf('team', { brief: json('brief'), integrations: json('integrations'), pm: json('pm') });
  return {
    name,
    campaign_id: campaign_id || get('campaign_id'),
    title: get('title') || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    objective: get('objective'),
    instructions: typeof json('instructions') === 'string' ? (json('instructions') as string) : '',
    workspace: get('workspace'),
    branch: get('branch'),
    branches: stringMap(json('branches')),
    wipeboard: get('wipeboard') || name,
    state: /^archived$/i.test(get('state')) ? 'archived' : 'active',
    brief: layer.brief,
    integrations: layer.integrations,
    ...(layer.pm !== undefined ? { pm: layer.pm } : {}),
    agent_defaults: teamAgentDefaults(json('agent_defaults')),
    launch_mode: launchModeOf(get('launch_mode')),
    models: modelsOf(json('models')),
    // An id is on a list once (KAN-261): a list written twice by an old race reads clean.
    holds: [...new Set(strings(json('holds'), 32))],
    watches: [...new Set(strings(json('watches'), 32))],
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
  objective?: string;
  instructions?: string;
  workspace?: string;
  branch?: string;
  branches?: Record<string, string>;
  wipeboard?: string;
  state?: 'active' | 'archived';
  brief?: BriefSettings;
  integrations?: string[];
  pm?: boolean | null;
  agent_defaults?: Partial<TeamAgentDefaults>;
  launch_mode?: LaunchMode;
  models?: Models;
  holds?: string[];
  watches?: string[];
}

const KEYS: (keyof RosterEdit)[] = [
  'title', 'objective', 'instructions', 'workspace', 'branch', 'branches', 'wipeboard', 'state',
  'brief', 'integrations', 'pm', 'agent_defaults', 'launch_mode', 'models', 'holds', 'watches',
];

function render(name: string, r: TeamRoster): string {
  const line = (k: string, v: string) => `- **${k}:** ${v || BLANK}`;
  return [
    `# ${name}`,
    '',
    ...(r.campaign_id ? [line('campaign_id', r.campaign_id)] : []),
    line('title', r.title),
    line('objective', r.objective),
    // JSON, so its line breaks keep (the record is one line per key).
    line('instructions', r.instructions ? JSON.stringify(r.instructions) : ''),
    line('workspace', r.workspace),
    line('branch', r.branch),
    line('branches', JSON.stringify(r.branches)),
    line('wipeboard', r.wipeboard || name),
    line('state', r.state),
    line('brief', JSON.stringify(r.brief)),
    line('integrations', JSON.stringify(r.integrations)),
    ...(r.pm !== undefined ? [line('pm', JSON.stringify(r.pm))] : []),
    line('agent_defaults', JSON.stringify(r.agent_defaults)),
    line('launch_mode', r.launch_mode),
    line('models', JSON.stringify(r.models)),
    line('holds', JSON.stringify([...new Set(r.holds)])),
    line('watches', JSON.stringify([...new Set(r.watches)])),
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
  // A NEW TEAM COPIES ITS WORKSPACE, or its Campaign when it has none (src/waterfall.ts); what `edit` states wins.
  const workspace = edit.workspace ? await readWorkspace(campaign_id, edit.workspace) : null;
  if (edit.workspace && !workspace) throw new Error(`No Workspace "${edit.workspace}" in Campaign ${campaign_id || '(none)'}.`);
  const { settings: handed } = await parentSettings(campaign_id, { workspace });
  const roster: TeamRoster = {
    name,
    campaign_id,
    title: edit.title?.trim() || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '),
    objective: edit.objective ?? '',
    instructions: edit.instructions ?? '',
    workspace: edit.workspace ?? '',
    branch: edit.branch ?? '',
    branches: edit.branches ?? {},
    wipeboard: edit.wipeboard || (await freeBoardToken(name, campaign_id)),
    state: edit.state ?? 'active',
    brief: edit.brief ?? handed.brief,
    integrations: edit.integrations ?? handed.integrations,
    ...(typeof edit.pm === 'boolean' ? { pm: edit.pm } : typeof handed.pm === 'boolean' ? { pm: handed.pm } : {}),
    agent_defaults: teamAgentDefaults({ ...handed.agent_defaults, ...edit.agent_defaults }),
    launch_mode: edit.launch_mode ?? handed.launch_mode,
    models: edit.models ? modelsOf(edit.models) : handed.models,
    holds: edit.holds ?? [],
    watches: edit.watches ?? [],
  };
  await mkdir(campaignDir(campaign_id), { recursive: true });
  const target = teamRosterFile(name, campaign_id);
  const tmp = `${target}.tmp-${process.pid}`;
  await writeFile(tmp, render(name, roster), 'utf8');
  await rename(tmp, target);
  holdsWritten(rosterListKey(campaign_id, name), `team:${name}`, roster.holds);
  return roster;
}

export async function writeTeamRoster(name: string, edit: RosterEdit, campaign_id?: string): Promise<TeamRoster> {
  const existing = await readTeamRoster(name, campaign_id);
  if (!existing) throw new Error(`Team "${name}" has no roster. Create it first.`);
  const where = existing.campaign_id;
  let raw = await readFile(teamRosterFile(name, where), 'utf8');
  // `references` left the shape 2026-09-13 (never used); an old file's line goes on the next edit.
  const lines = raw.split('\n').filter((l) => !/^-\s*\*\*references:\*\*/.test(l.trim()));
  const normalizedEdit: RosterEdit = edit;
  const merged: TeamRoster = {
    ...existing,
    ...Object.fromEntries(KEYS.filter((k) => normalizedEdit[k] !== undefined).map((k) => [k, normalizedEdit[k]])),
  } as TeamRoster;
  for (const k of KEYS) {
    if (normalizedEdit[k] === undefined) continue;
    const nested = ['brief', 'integrations', 'pm', 'agent_defaults', 'models', 'holds', 'watches'].includes(k);
    const v = nested ? JSON.stringify(normalizedEdit[k])
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
  holdsWritten(rosterListKey(where, name), `team:${name}`, back.holds);
  return back;
}

export async function deleteTeamRoster(name: string, campaign_id?: string): Promise<void> {
  const existing = await readTeamRoster(name, campaign_id);
  // Deletion is idempotent so retirement can clean up orphaned legacy/incomplete
  // memberships even when their roster file is already absent.
  if (existing) {
    await unlink(teamRosterFile(name, existing.campaign_id));
    holdsWritten(rosterListKey(existing.campaign_id, name), '', []);
    return;
  }
  // Old stores could contain uppercase filenames that are no longer valid Team ids.
  // They cannot be read as Teams, but an exact safe delete must still retire the file.
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) return;
  const campaigns = campaign_id !== undefined ? [campaign_id] : ['', ...await campaignDirs()];
  await Promise.all(campaigns.map(async (id) => {
    try { await unlink(teamRosterFile(name, id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }));
}
