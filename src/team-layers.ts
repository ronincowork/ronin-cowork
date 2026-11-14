/**
 * A TEAM'S FOUR LAYERS (owner, 2026-11-09; KAN-331): what a lead reads of its Team on its work
 * record, one line each, each pointing at the command that reads it whole:
 *
 *   Workspace  title, objective, repos, folders,  work-record workspace list
 *              integrations (providers)
 *   Plans      name, status, Team                 plan read <name>
 *   Canvases   name                               canvas read <name>
 *   Epics      epic, holder, status               item read <id>
 *
 * Each layer is read live from where it lives (the Workspace definition, the Workspace's plans
 * folder, the work items) and nothing is stored: pointers only, never a plan's text. Every member
 * of the Team reads the same four lines (owner, 2026-11-09); only the lead is told of a change.
 *
 * THE NOTICE: a change on any layer sends each lead whose layers changed the usual "Your work
 * record changed" (tegami.ts ackRecord), once per quiet spell (DEBOUNCE_MS), so an ordered plan
 * that makes several epics is one notice. The triggers are the work-item hook (sockets.ts
 * onItemChanged), the plans routes, the Workspace PUT and a Team change (tegami.ts teamChanged);
 * each only asks for a re-read. What a lead is told is decided by comparing its layers as the read
 * prints them (`shown`), before and after, so a write that moves nothing the lead can read tells
 * it nothing (KAN-498).
 * Canvases are names only on the line, so a canvas added or removed tells the lead and editing a
 * canvas's entries tells nobody (owner, 2026-11-09). Members are never told.
 */
import { listSessions } from './tmux.js';
import { readTeamRoster, type TeamRoster } from './team-rosters.js';
import { readWorkspace, type Workspace } from './workspaces.js';
import { readItem } from './work-items.js';
import { liveRows, type ItemRow } from './work-items-index.js';
import { rosterReading, teamWork } from './work-items-read.js';

/** A Workspace integration as the Workspace record keeps it (KAN-338): its provider and its facts. */
export type LayerIntegration = { provider: string } & Record<string, unknown>;
/** `dirs`: each repo's and folder's directory, from the Workspace Folder registry (project-roots.ts).
 * `integrations`: the Workspace's rows as they are, [] when it has none. */
export interface LayerWorkspace { name: string; title: string; objective: string; repos: string[]; folders: string[]; dirs: Record<string, string>; integrations: LayerIntegration[] }
/** `team`: the Team the plan is for (plans.ts header); '' is none. */
export interface LayerPlan { name: string; status: string; team: string }
export interface LayerCanvas { name: string }
export interface LayerEpic { id: string; title: string; holder: string; status: string }
export interface TeamLayers {
  team: string;
  workspace: LayerWorkspace | null;
  plans: LayerPlan[];
  canvases: LayerCanvas[];
  epics: LayerEpic[];
}

type SessionRow = { name: string; key: string; tags: string[]; leads: string[] };

async function workspaceLayer(w: Workspace | null): Promise<LayerWorkspace | null> {
  if (!w) return null;
  const { peekProjectRoots } = await import('./project-roots.js');
  const roots = await peekProjectRoots().catch(() => []);
  const names = [...w.repos, ...w.folders].map((row) => row.name);
  const dirs = Object.fromEntries(names.map((name) => [name, roots.find((root) => root.name === name)?.dir ?? '']));
  // Read loosely: the field lands in workspaces.ts with KAN-338; until then there is none.
  const rows = (w as Workspace & { integrations?: unknown }).integrations;
  const integrations = Array.isArray(rows) ? rows.filter((row): row is LayerIntegration => !!row && typeof row === 'object' && typeof (row as { provider?: unknown }).provider === 'string') : [];
  return { name: w.name, title: w.title, objective: w.objective, repos: w.repos.map((repo) => repo.name), folders: w.folders.map((folder) => folder.name), dirs, integrations };
}

async function workspaceOf(roster: TeamRoster | null): Promise<Workspace | null> {
  if (!roster?.workspace) return null;
  const { initialCampaignId } = await import('./campaign-scope.js');
  return readWorkspace(roster.campaign_id || await initialCampaignId(), roster.workspace).catch(() => null);
}

/** CANVASES (KAN-329, web-page): read nothing until `canvas ls` lands; then this is the
 * listCanvases(workspace) beside plans.ts listPlans, joined on the Team's Workspace. */
async function listCanvases(_w: Workspace): Promise<LayerCanvas[]> {
  return [];
}

const epicLine = (item: ItemRow, holderOf: Map<string, string>): LayerEpic => ({ id: item.id, title: item.title, holder: holderOf.get(item.id) ?? '', status: item.status });

/** One Team's four layers, live: what its lead and every member read. The plans are every plan of
 * the Workspace, each with its Team. The epics are those the Team or its members hold, the epic
 * above each item they hold (work-items-read.ts teamWork), and the epics under the Workspace's
 * plans that are this Team's (an epic attached `plan:<workspace>/<name>`; KAN-332): an epic
 * reached only through another Team's plan, or a plan of no Team, is not on the line. Archived
 * epics are left out. */
export async function teamLayers(team: string, sessions?: SessionRow[], every?: ItemRow[]): Promise<TeamLayers> {
  const roster = await readTeamRoster(team);
  if (!roster) throw new Error(`Team "${team}" has no roster.`);
  const w = await workspaceOf(roster);
  const all = every ?? await liveRows();
  const { listPlans } = await import('./plans.js');
  const plans = w ? (await listPlans(w).catch(() => [])).map(({ name, status, team: of }) => ({ name, status, team: of })) : [];
  const ids = new Set<string>();
  const holderOf = new Map<string, string>();
  if (roster) {
    const reading = await rosterReading(roster, sessions);
    for (const id of teamWork(reading.items, all).epics) ids.add(id);
    for (const item of reading.items) if (item.level === 1) holderOf.set(item.id, item.holder);
  }
  if (w) {
    const refs = new Set(plans.filter((plan) => plan.team === team).map((plan) => `plan:${w.name}/${plan.name}`));
    // Attachments are not on a row: the live Epics' own files are read, only when the Team has plans.
    if (refs.size) for (const row of all.filter((one) => one.level === 1)) {
      if ((await readItem(row.id))?.attachments.some((doc) => refs.has(doc))) ids.add(row.id);
    }
  }
  // Rows are live items only: an archived epic has none (w418).
  const shown = all.filter((item) => ids.has(item.id));
  // An epic reached through a plan or a parent, held outside the Team: its holders from its row.
  for (const item of shown) if (!holderOf.has(item.id)) holderOf.set(item.id, item.holders.join(', '));
  const epics = shown.map((item) => epicLine(item, holderOf));
  return { team, workspace: await workspaceLayer(w), plans, canvases: w ? await listCanvases(w) : [], epics };
}

/* ---- THE NOTICE ---- */

export const DEBOUNCE_MS = 3000;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;
let again = false;
const seen = new Map<string, string>(); // lead -> its layers as last read, one string

/** One Team's layers as `work-record read` prints them (libexec/work-record-read), and nothing
 * more: what a lead is told of is a change it can read (KAN-498). The Folder dirs and an
 * integration's facts ride on the reading but are not on the lines. */
export function shown(l: TeamLayers): unknown {
  const w = l.workspace;
  return {
    team: l.team,
    workspace: w && { title: w.title || w.name, objective: w.objective, repos: w.repos, folders: w.folders, integrations: w.integrations.map((row) => String(row.provider)) },
    plans: l.plans.map(({ name, status, team }) => [name, status, team]),
    canvases: l.canvases.map(({ name }) => name),
    epics: l.epics.map(({ id, title, holder, status }) => [id, title, holder, status]),
  };
}

async function leadSignatures(read: () => Promise<SessionRow[]>): Promise<Map<string, string>> {
  const sessions = await read();
  const every = await liveRows();
  const out = new Map<string, string>();
  for (const lead of sessions.filter((one) => one.leads.length)) {
    const layers = await Promise.all(lead.leads.map((team) => teamLayers(team, sessions, every)));
    out.set(lead.name, JSON.stringify(layers.map(shown)));
  }
  return out;
}

/** Read every lead's layers once and tell each lead whose layers moved since the last read. The
 * first read after a start only remembers: nothing is known to have changed. */
export async function settleLayers(notify: (lead: string) => Promise<void>, sessions: () => Promise<SessionRow[]> = listSessions): Promise<string[]> {
  const first = seen.size === 0;
  const now = await leadSignatures(sessions);
  const told: string[] = [];
  for (const [lead, signature] of now) {
    const before = seen.get(lead);
    seen.set(lead, signature);
    if (!first && before !== undefined && before !== signature) { await notify(lead); told.push(lead); }
  }
  for (const lead of [...seen.keys()]) if (!now.has(lead)) seen.delete(lead);
  return told;
}

const tell = async (lead: string) => {
  const { ackRecord } = await import('./tegami.js');
  await ackRecord(lead, 'house');
};

/** Something on a layer may have moved: re-read once the writes go quiet. Fire and forget. */
export function layersMayHaveChanged(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (running) { again = true; return; }
    running = settleLayers(tell).then(() => undefined, (e) => console.error('[team-layers]', e)).finally(() => {
      running = null;
      if (again) { again = false; layersMayHaveChanged(); }
    });
  }, DEBOUNCE_MS);
  timer.unref?.();
}

/** At start: remember every lead's layers, and re-read on every saved work-item write. */
export async function startTeamLayers(onItemChanged: (cb: () => void) => void): Promise<void> {
  onItemChanged(() => layersMayHaveChanged());
  await settleLayers(tell).catch((e) => console.error('[team-layers]', e));
}

/** Tests only: forget what was read. */
export function resetTeamLayers(): void { seen.clear(); if (timer) clearTimeout(timer); timer = null; }
