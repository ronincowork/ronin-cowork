/**
 * WORKSPACES (owner, 2026-11-01; samurai_lab wip/folder_view/PLAN.md). A Workspace is a project,
 * like a Space in Jira: a brief, not a place. It holds an objective, instructions, the
 * repositories its Agents work in (by their registered names), folder pointers with notes, and
 * the Mode its Agents launch in. Every Team is launched in one; its Agents inherit it.
 *
 * Repositories and folders are Workspace Folders, by registered name: the repositories are the
 * ones with Git, the folders the rest.
 *
 * INTEGRATIONS (KAN-338): the outside services this Workspace uses, each a row naming its
 * `provider` (a record in the integrations index, resource-adapters.ts listIntegrations) and
 * any other short facts a bridge reads (Netlify's bridge reads `site`), kept as written.
 * The index names no Workspace: the link lives here, in one place.
 *
 * Records live at <workspaces>/<campaign>/<name>.json. Every Agent starts in Ronin house, one
 * folder for all (owner, 2026-11-03): a folder per Workspace made each provider ask "trust this
 * folder?" for every new Workspace.
 */
import { holdsWritten, workspaceListKey } from './holds-hook.js';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import type { LaunchMode } from './agent-defaults.js';

export interface WorkspaceRepo { name: string; note: string }
export interface WorkspaceFolder { name: string; note: string }
/** Where the Workspace keeps its plans (src/plans.ts): a Workspace Folder by name and a subfolder in
 * it. Absent is the default, Ronin Lab's <campaign>/<workspace>/plans. */
export interface WorkspacePlans { location: string; path: string }
/** One integration this Workspace uses: `provider` names its index record; the rest are its facts (`site`, `note`). */
export type WorkspaceIntegration = { provider: string; [fact: string]: unknown };
export interface Workspace {
  name: string;
  campaign_id: string;
  title: string;
  objective: string;
  instructions: string;
  repos: WorkspaceRepo[];
  folders: WorkspaceFolder[];
  launch_mode: LaunchMode;
  plans?: WorkspacePlans;
  integrations: WorkspaceIntegration[];
}

export const isValidWorkspaceName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

const campaignDir = (campaign: string): string => path.join(storeDir('workspaces'), campaign);
const recordFile = (campaign: string, name: string): string => path.join(campaignDir(campaign), `${name}.json`);

/** Where every Agent starts: one folder, Ronin's own, never project material. */
export const roninHouse = (): string => storeDir('house');

const text = (v: unknown, max: number): string => String(v ?? '').trim().slice(0, max);
const rows = <T>(v: unknown, make: (row: Record<string, unknown>) => T | null): T[] =>
  (Array.isArray(v) ? v : []).flatMap((row) => {
    const made = row && typeof row === 'object' ? make(row as Record<string, unknown>) : null;
    return made ? [made] : [];
  });

export function normalizeWorkspace(campaign_id: string, name: string, v: Record<string, unknown>): Workspace {
  return {
    name, campaign_id,
    title: text(v.title, 120),
    objective: text(v.objective, 2000),
    instructions: text(v.instructions, 8000),
    repos: rows(v.repos, (r) => (text(r.name, 64) ? { name: text(r.name, 64), note: text(r.note, 300) } : null)),
    folders: rows(v.folders, (r) => (text(r.name, 64) ? { name: text(r.name, 64), note: text(r.note, 300) } : null)),
    launch_mode: v.launch_mode === 'live_dangerously' ? 'live_dangerously' : 'configured',
    ...plansOf(v.plans),
    integrations: integrationsOf(v.integrations),
  };
}

/** Each row a provider, once, with its other facts as short strings; a bare name is a row too. */
function integrationsOf(v: unknown): WorkspaceIntegration[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).flatMap((row) => {
    const r = typeof row === 'string' ? { provider: row } : row && typeof row === 'object' ? row as Record<string, unknown> : null;
    const provider = text(r?.provider, 64).toLowerCase();
    if (!r || !/^[a-z0-9][a-z0-9_-]*$/.test(provider) || seen.has(provider)) return [];
    seen.add(provider);
    const facts = Object.entries(r).filter(([k, val]) => k !== 'provider' && /^[a-z][a-z0-9_]{0,31}$/.test(k) && ['string', 'number'].includes(typeof val)).slice(0, 16);
    return [{ ...Object.fromEntries(facts.map(([k, val]) => [k, text(val, 300)])), provider } as WorkspaceIntegration];
  });
}

/** The Plans place, kept through every Save: a page that never shows it must not wipe it. */
function plansOf(v: unknown): { plans?: WorkspacePlans } {
  const p = v && typeof v === 'object' ? v as Record<string, unknown> : null;
  const location = text(p?.location, 64);
  return p && location ? { plans: { location, path: text(p.path, 300) } } : {};
}

export async function readWorkspace(campaign: string, name: string): Promise<Workspace | null> {
  if (!campaign || !isValidWorkspaceName(name)) return null;
  try { return normalizeWorkspace(campaign, name, JSON.parse(await readFile(recordFile(campaign, name), 'utf8'))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}

export async function listWorkspaces(campaign: string): Promise<Workspace[]> {
  let names: string[] = [];
  try { names = (await readdir(campaignDir(campaign))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const all = await Promise.all(names.filter(isValidWorkspaceName).sort().map((name) => readWorkspace(campaign, name)));
  return all.filter((w): w is Workspace => !!w);
}

/** Write the whole record. */
export async function saveWorkspace(w: Workspace): Promise<Workspace> {
  if (!w.campaign_id || !isValidWorkspaceName(w.name)) throw new Error(`A Workspace name is lowercase letters, digits, _ and -: "${w.name}".`);
  const clean = normalizeWorkspace(w.campaign_id, w.name, w as unknown as Record<string, unknown>);
  await mkdir(campaignDir(clean.campaign_id), { recursive: true });
  const file = recordFile(clean.campaign_id, clean.name);
  const { name: _n, campaign_id: _c, ...body } = clean;
  await writeFile(`${file}.tmp`, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return clean;
}

/** Remove the record. */
export async function deleteWorkspace(campaign: string, name: string): Promise<void> {
  try { await unlink(recordFile(campaign, name)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  holdsWritten(workspaceListKey(campaign, name), '', []); // a Workspace with no record holds nothing
}

/** The repositories a Team's Agents work in: its Workspace's, by registered name. */
export async function teamRepos(roster: { campaign_id: string; workspace: string }): Promise<string[]> {
  return (await readWorkspace(roster.campaign_id, roster.workspace))?.repos.map((repo) => repo.name) ?? [];
}

/* WHAT A WORKSPACE HOLDS (owner, 2026-11-10; KAN-352). A Workspace holds items as a Team or an
 * Agent does: its Icebox epic, made by Ronin, and the parked ideas under it. The list lives
 * beside the record, <workspaces>/<campaign>/<name>.holds.json, so a page Save of the record
 * never races an item write (the issuer lock owns this file). `icebox` is the epic's id. */
export interface WorkspaceHolds { campaign_id: string; name: string; holds: string[]; icebox: string }

const holdsFile = (campaign: string, name: string): string => path.join(campaignDir(campaign), `${name}.holds.json`);

export async function readWorkspaceHolds(campaign: string, name: string): Promise<WorkspaceHolds> {
  try {
    const v = JSON.parse(await readFile(holdsFile(campaign, name), 'utf8')) as Record<string, unknown>;
    const holds = Array.isArray(v.holds) ? v.holds.map((id) => text(id, 64)).filter(Boolean) : [];
    return { campaign_id: campaign, name, holds, icebox: text(v.icebox, 64) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { campaign_id: campaign, name, holds: [], icebox: '' };
    throw e;
  }
}

export async function writeWorkspaceHolds(campaign: string, name: string, change: { holds?: string[]; icebox?: string }): Promise<void> {
  const was = await readWorkspaceHolds(campaign, name);
  await mkdir(campaignDir(campaign), { recursive: true });
  const file = holdsFile(campaign, name);
  await writeFile(`${file}.tmp`, `${JSON.stringify({ holds: change.holds ?? was.holds, icebox: change.icebox ?? was.icebox }, null, 2)}\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  holdsWritten(workspaceListKey(campaign, name), `workspace:${name}`, change.holds ?? was.holds);
}

/** Every Workspace's holds, in every Campaign: one row per Workspace record. */
export async function listWorkspaceHolds(): Promise<WorkspaceHolds[]> {
  let campaigns: string[] = [];
  try { campaigns = (await readdir(storeDir('workspaces'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const out: WorkspaceHolds[] = [];
  for (const campaign of campaigns) for (const w of await listWorkspaces(campaign)) out.push(await readWorkspaceHolds(campaign, w.name));
  return out;
}
