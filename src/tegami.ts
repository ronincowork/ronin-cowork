import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from './spawn-broker.js';
import { RIREKI_DIR, sessionKey } from './session-dir.js';
import { readTeamRoster } from './team-rosters.js';
import { getProjectRoot, listSessions, type SessionInfo } from './tmux.js';
import { mandate, type Mandate } from './agent-defaults.js';
import { enqueueMessage } from './message-queue.js';

export interface TegamiCheckout {
  repo: string;
  branch: string;
  worktree?: string;
  line?: string;
}

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

export async function checkoutAt(dir: string): Promise<TegamiCheckout> {
  const git = async (...args: string[]) =>
    (await execFile('git', ['-C', dir, ...args], {
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

export function tegamiPath(key: string): string {
  return path.join(RIREKI_DIR, key, 'tegami.md');
}

export interface TeamEntry {
  team: string;
  team_role: 'lead' | 'member';
  objective: string;
  /** Only in a lead's own entry: every session on the Team, leads marked. */
  members?: string[];
}

export async function deriveTeams(name: string, tags: string[]): Promise<TeamEntry[]> {
  const sessions = await listSessions();
  const leads = sessions.find((s) => s.name === name)?.leads ?? [];
  return Promise.all(
    tags.map(async (team) => {
      const r = await readTeamRoster(team).catch(() => null);
      const entry: TeamEntry = { team, team_role: leads.includes(team) ? 'lead' : 'member', objective: r?.objective ?? '' };
      if (entry.team_role === 'lead') {
        entry.members = sessions.filter((s) => s.tags.includes(team)).map((s) => (s.leads.includes(team) ? `${s.name} (lead)` : s.name));
      }
      return entry;
    }),
  );
}

function seedShell(
  name: string,
  repos: TegamiCheckout[],
  teams: TeamEntry[],
  sessionMandate: Mandate,
): string {
  return `# TEGAMI — ${name}
> Your work record is what the owner reads on your tile. Keep it true.
> - **objective:** one sentence on what you are doing now:
>   \`work-record update_record --objective "…"\`.
> - **repos:** the worktrees and branches you work in: \`work-record workspace add|remove\`.
> - **holds:** the work items you hold; their status shows here. Work items:
>   the Work Item capability.
> - **watches:** the work items you track without holding: \`item watch <id>\`; you hear
>   the moves under each (status, flag, a new child, a holder change).
> - **teams**, **configuration:** Ronin writes these and tells you when they change.

\`\`\`json
{ "objective": "",
  "mandate": ${JSON.stringify(sessionMandate)},
  "teams": ${JSON.stringify(teams)},
  "repos": ${JSON.stringify(repos.filter((checkout) => checkout.repo || checkout.branch))},
  "holds": [],
  "watches": [] }
\`\`\`
`;
}

function letterBlock(text: string): { match: RegExpMatchArray; body: Record<string, unknown> } | null {
  const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const body = JSON.parse(match[1]) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { match, body: body as Record<string, unknown> }
      : null;
  } catch {
    return null;
  }
}

async function replaceLetterBlock(file: string, text: string, parsed: ReturnType<typeof letterBlock>, body: Record<string, unknown>): Promise<void> {
  if (!parsed) throw new Error('work record has no valid JSON block');
  const block = JSON.stringify(body, null, 2);
  const start = parsed.match.index! + parsed.match[0].indexOf(parsed.match[1]);
  const out = text.slice(0, start) + block + text.slice(start + parsed.match[1].length);
  const tmp = `${file}.project.${process.pid}`;
  await fs.writeFile(tmp, out, 'utf8');
  await fs.rename(tmp, file);
}

/** One Agent's holder and watch lists, as its letter keeps them: work item ids. The items
 * themselves live in the work item store. */
export interface LetterHolds {
  key: string;
  name: string;
  objective: string;
  holds: string[];
  watches: string[];
  /** The Teams its letter names, lead or member: what an ending Agent's items go back to. */
  teams: string[];
}

function holdsOfBody(key: string, text: string, body: Record<string, unknown>): LetterHolds {
  const name = text.match(/^# TEGAMI — (.+)$/m)?.[1]?.trim() || key;
  const ids = (list: unknown) => Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  return { key, name, objective: typeof body.objective === 'string' ? body.objective : '', holds: ids(body.holds), watches: ids(body.watches),
    teams: Array.isArray(body.teams) ? body.teams.map((entry) => (entry as TeamEntry)?.team).filter((team): team is string => typeof team === 'string') : [] };
}

export async function readLetterHolds(key: string): Promise<LetterHolds | null> {
  const text = await fs.readFile(tegamiPath(key), 'utf8').catch(() => null);
  const parsed = text === null ? null : letterBlock(text);
  return parsed ? holdsOfBody(key, text!, parsed.body) : null;
}

/** Every letter on the machine that can hold work, live or archived. */
export async function listLetterHolds(): Promise<LetterHolds[]> {
  const keys = await fs.readdir(RIREKI_DIR).catch(() => [] as string[]);
  const letters = await Promise.all(keys.map((key) => readLetterHolds(key)));
  return letters.filter((letter): letter is LetterHolds => letter !== null);
}

/** Replace one letter's holder list. */
export const writeLetterHolds = (key: string, holds: string[]): Promise<LetterHolds> => writeLetterList(key, 'holds', holds);
/** Replace one letter's watch list. */
export const writeLetterWatches = (key: string, watches: string[]): Promise<LetterHolds> => writeLetterList(key, 'watches', watches);

async function writeLetterList(key: string, list: 'holds' | 'watches', ids: string[]): Promise<LetterHolds> {
  const file = tegamiPath(key);
  const text = await fs.readFile(file, 'utf8');
  const parsed = letterBlock(text);
  if (!parsed) throw new Error(`the work record at ${file} has no readable JSON block`);
  parsed.body[list] = ids;
  await replaceLetterBlock(file, text, parsed, parsed.body);
  return holdsOfBody(key, text, parsed.body);
}

export async function seedTegami(
  name: string,
  checkout: TegamiCheckout | TegamiCheckout[] = { repo: '', branch: '' },
  teams: TeamEntry[] = [],
  sessionMandate: Mandate = mandate(undefined),
): Promise<string | null> {
  try {
    const file = tegamiPath(await sessionKey(name));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, seedShell(name, Array.isArray(checkout) ? checkout : [checkout], teams, mandate(sessionMandate)), { flag: 'wx' });
    return file;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'EEXIST') return tegamiPath(await sessionKey(name));
    console.error(`[ronin] tegami seed ${name}:`, e);
    return null;
  }
}

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

export type SessionWithAxes = SessionInfo;

export async function withAxes(list: SessionInfo[]): Promise<SessionWithAxes[]> {
  const { campaignResolver, machineCampaignId } = await import('./campaign-scope.js');
  const resolve = await campaignResolver();
  const machine = await machineCampaignId();
  return Promise.all(
    list.filter((s) => !machine || resolve(s.campaign_id) === machine).map(async (s) => ({
      ...s,
      campaign_id: resolve(s.campaign_id),
    })),
  );
}

/** Write one Ronin-derived key of this session's record. Returns whether it changed; with
 * `by`, a change by anyone else is acked. */
async function writeDerived(name: string, key: string, value: unknown, by: string): Promise<boolean> {
  const file = tegamiPath(await sessionKey(name));
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  const parsed = letterBlock(text);
  if (!parsed || JSON.stringify(parsed.body[key] ?? null) === JSON.stringify(value)) return false;
  await replaceLetterBlock(file, text, parsed, { ...parsed.body, [key]: value });
  await ackRecord(name, by);
  return true;
}

/** Derive this session's teams block again. */
export async function writeTeams(name: string, tags: string[], by = name): Promise<boolean> {
  return writeDerived(name, 'teams', await deriveTeams(name, tags), by);
}

/** The configuration line (owner, 2026-10-21): the title and Workspace Folder Ronin keeps for
 * this Agent. Behaviors are not here; adding one sends its own message with the teaching. */
export async function writeConfiguration(name: string, by = name): Promise<boolean> {
  const title = (await listSessions()).find((s) => s.name === name)?.title ?? '';
  return writeDerived(name, 'configuration', { title, project_root: await getProjectRoot(name) }, by);
}

/** A Team changed (owner, 2026-10-21): its roster was written, or `moved` joined, left or was
 * made lead. Every record on it is derived again; each one that changed is acked, and the
 * lead's is acked on every change, since the lead keeps the Team. */
export async function teamChanged(teams: string[], by: string, moved = ''): Promise<void> {
  for (const s of await listSessions()) {
    const lead = s.leads.some((t) => teams.includes(t));
    if (!lead && s.name !== moved && !s.tags.some((t) => teams.includes(t))) continue;
    if (!(await writeTeams(s.name, s.tags, by)) && lead) await ackRecord(s.name, by);
  }
}

/** `name` ended: every lead's members list is derived again, and a lead whose list lost it is acked. */
export async function memberEnded(name: string): Promise<void> {
  for (const s of await listSessions()) if (s.leads.length) await writeTeams(s.name, s.tags, name);
}

/** THE ACK (owner, 2026-10-07): a write to an Agent's work record by anyone else pushes it one
 * fixed line; the Agent reads its record. A write by the Agent itself is not acked. */
export async function ackRecord(name: string, by: string): Promise<void> {
  if (by !== name) await enqueueMessage(name, 'Your work record changed; please read it (work-record read).', 'house', 'Work record');
}

/** Change only the current mandate in an Agent-authored work record. Birth remains immutable.
 * No ack of its own: the Configuration's Update sends the one message, the new brief (owner, 2026-10-24). */
export async function writeMandate(name: string, current: Mandate): Promise<Mandate> {
  const file = tegamiPath(await sessionKey(name));
  const text = await fs.readFile(file, 'utf8');
  const parsed = letterBlock(text);
  if (!parsed) throw new Error(`@${name} has no readable work record`);
  const next = mandate(current);
  parsed.body.mandate = next;
  await replaceLetterBlock(file, text, parsed, parsed.body);
  return next;
}

/** Change the Agent-authored objective through the Configuration surface. */
export async function writeObjective(name: string, objective: string, by: string): Promise<string> {
  const file = tegamiPath(await sessionKey(name));
  const text = await fs.readFile(file, 'utf8');
  const parsed = letterBlock(text);
  if (!parsed) throw new Error(`@${name} has no readable work record`);
  const next = objective.trim().slice(0, 2000);
  parsed.body.objective = next;
  await replaceLetterBlock(file, text, parsed, parsed.body);
  await ackRecord(name, by);
  return next;
}
