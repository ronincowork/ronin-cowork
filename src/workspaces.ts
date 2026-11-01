/**
 * WORKSPACES (owner, 2026-11-01; samurai_lab wip/folder_view/PLAN.md). A Workspace is a project,
 * like a Space in Jira: a brief, not a place. It holds an objective, instructions, the
 * repositories its Agents work in (by their registered names), folder pointers with notes, and
 * the Mode its Agents launch in. Every Team is launched in one; its Agents inherit it.
 *
 * Records live at <workspaces>/<campaign>/<name>.json. Beside each record Ronin keeps the
 * Workspace's launch folder, <workspaces>/<campaign>/<name>/: where its Agents start, Ronin's
 * own, never project material. An Agent without a Workspace starts in Ronin house.
 */
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import type { LaunchMode } from './agent-defaults.js';

export interface WorkspaceRepo { name: string; note: string }
export interface WorkspaceFolder { path: string; note: string }
export interface Workspace {
  name: string;
  campaign_id: string;
  title: string;
  objective: string;
  instructions: string;
  repos: WorkspaceRepo[];
  folders: WorkspaceFolder[];
  launch_mode: LaunchMode;
}

export const isValidWorkspaceName = (s: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(s);

const campaignDir = (campaign: string): string => path.join(storeDir('workspaces'), campaign);
const recordFile = (campaign: string, name: string): string => path.join(campaignDir(campaign), `${name}.json`);

/** Where a Workspace's Agents start. */
export const workspaceLaunchFolder = (campaign: string, name: string): string => path.join(campaignDir(campaign), name);
/** Where every Agent without a Workspace starts: a catch-all, not material. */
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
    folders: rows(v.folders, (r) => (text(r.path, 1024) ? { path: text(r.path, 1024), note: text(r.note, 300) } : null)),
    launch_mode: v.launch_mode === 'live_dangerously' ? 'live_dangerously' : 'configured',
  };
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

/** Write the whole record and make sure its launch folder exists. */
export async function saveWorkspace(w: Workspace): Promise<Workspace> {
  if (!w.campaign_id || !isValidWorkspaceName(w.name)) throw new Error(`A Workspace name is lowercase letters, digits, _ and -: "${w.name}".`);
  const clean = normalizeWorkspace(w.campaign_id, w.name, w as unknown as Record<string, unknown>);
  await mkdir(workspaceLaunchFolder(clean.campaign_id, clean.name), { recursive: true });
  const file = recordFile(clean.campaign_id, clean.name);
  const { name: _n, campaign_id: _c, ...body } = clean;
  await writeFile(`${file}.tmp`, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  await rename(`${file}.tmp`, file);
  return clean;
}

/** Remove the record; the launch folder stays as Ronin's history of where Agents ran. */
export async function deleteWorkspace(campaign: string, name: string): Promise<void> {
  try { await unlink(recordFile(campaign, name)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
}

/** The repositories a Team's Agents work in: its Workspace's, by registered name. */
export async function teamRepos(roster: { campaign_id: string; workspace: string }): Promise<string[]> {
  return (await readWorkspace(roster.campaign_id, roster.workspace))?.repos.map((repo) => repo.name) ?? [];
}
