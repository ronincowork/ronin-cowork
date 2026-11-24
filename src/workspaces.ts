/**
 * WORKSPACES (owner, 2026-11-01; samurai_lab wip/folder_view/PLAN.md). A Workspace is a project,
 * like a Space in Jira: a brief, not a place. It holds an objective, instructions, the
 * repositories its Agents work in (by their registered names), folder pointers with notes, and
 * the Mode its Agents launch in. Every Team is launched in one; its Agents inherit it.
 *
 * THE WORKSPACE IS THE ORGANIZING PRINCIPLE (owner, 2026-11-20; KAN-728). Ronin keeps no folder
 * list of its own: the repositories (with Git, and their settings) and folders are rows here,
 * each a dir. Every reader of "the folders" reads `workspaceFolders()`.
 *
 * INTEGRATIONS (KAN-338): the outside services this Workspace uses, each a row naming its
 * `provider` (an integration: a bridge's name, or any the user brings; integrations.ts) and
 * any other short facts a bridge reads (Netlify's bridge reads `site`), kept as written.
 * A bridge names no Workspace: the link lives here, in one place.
 *
 * Records live at <workspaces>/<campaign>/<name>.json. Every Agent starts in Ronin house, one
 * folder for all (owner, 2026-11-03): a folder per Workspace made each provider ask "trust this
 * folder?" for every new Workspace.
 */
import type { BriefSettings } from './brief-record.js';
import { briefSettings } from './brief-settings.js';
import { holdsWritten, workspaceListKey } from './holds-hook.js';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rootDir, storeDir, STORES } from './resources.js';
import type { LaunchMode } from './agent-defaults.js';

/** A folder the Workspace works in: `dir` is the folder; `name` is Ronin's key for it (desks, tmux,
 * promotion), made from the folder's basename on save, the same for one dir in every Workspace. */
export interface WorkspaceFolder { name: string; dir: string; note: string }
/** A repository row also holds the repo's settings, here and nowhere else: `reviewed` hands work
 * in from `working` to `stable`; `direct` works on `stable`. `desks` = managed gives each Agent a worktree. */
export interface WorkspaceRepo extends WorkspaceFolder { mode: 'reviewed' | 'direct'; working: string; stable: string; desks: 'managed' | 'none' }
/** Where the Workspace keeps its plans (src/plans.ts): one of its folders by name and a subfolder in
 * it. Absent is the default, the Workspace's own folder: ~/ronin/<workspace>/plans. */
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
  /** The Workspace's brief settings and project management (docs/architecture/brief.md, Layers and brief settings). */
  brief: BriefSettings;
  pm?: boolean;
  /** Archived (the page's ⋯): off the Workspace pickers, kept, one press brings it back. */
  archived?: boolean;
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
    repos: rows(v.repos, (r) => { const f = folderRow(r); return f && repoRow(f, r); }),
    folders: rows(v.folders, folderRow),
    launch_mode: v.launch_mode === 'configured' ? 'configured' : 'live_dangerously', // absent: Dangerously
    ...plansOf(v.plans),
    integrations: integrationsOf(v.integrations),
    brief: briefSettings(v.brief),
    ...(typeof v.pm === 'boolean' ? { pm: v.pm } : {}),
    ...(v.archived === true ? { archived: true } : {}),
  };
}

const expand = (p: string): string => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const branch = (v: unknown, dflt: string): string => (/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(text(v, 100)) && !text(v, 100).includes('..') ? text(v, 100) : dflt);

function folderRow(r: Record<string, unknown>): WorkspaceFolder | null {
  const dir = text(r.dir, 1000);
  return dir ? { name: text(r.name, 64), dir: path.resolve(expand(dir)), note: text(r.note, 300) } : null;
}

function repoRow(f: WorkspaceFolder, r: Record<string, unknown>): WorkspaceRepo {
  const mode = r.mode === 'reviewed' ? 'reviewed' : 'direct';
  const stable = branch(r.stable, mode === 'reviewed' ? 'master' : 'main');
  return { ...f, mode, working: mode === 'reviewed' ? branch(r.working, 'dev') : '', stable, desks: mode === 'reviewed' && r.desks !== 'none' ? 'managed' : 'none' };
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

/** A Workspace's own folder, ~/ronin/<name>: never one of Ronin's own folders there (office, config,
 * memory…): that name takes -files. Its plans default to <this>/plans (src/plans.ts). */
export function ownFolder(name: string): string {
  const ronins = new Set(STORES.filter((one) => one.root === 'user').map((one) => one.rel.split('/')[0]));
  return path.join(rootDir('user'), ronins.has(name) ? `${name}-files` : name);
}

/** Write the whole record. */
export async function saveWorkspace(w: Workspace): Promise<Workspace> {
  if (!w.campaign_id || !isValidWorkspaceName(w.name)) throw new Error(`A Workspace name is lowercase letters, digits, _ and -: "${w.name}".`);
  const clean = normalizeWorkspace(w.campaign_id, w.name, w as unknown as Record<string, unknown>);
  // EVERY WORKSPACE GETS ITS FOLDER (owner, 24 Nov; KAN-809): a new one is given ~/ronin/<name>, made
  // here, whoever makes it (a page, the workspace tool). More folders are theirs to add.
  if (!(await readWorkspace(clean.campaign_id, clean.name))) {
    const dir = ownFolder(clean.name);
    await mkdir(dir, { recursive: true });
    if (![...clean.repos, ...clean.folders].some((row) => row.dir === dir)) clean.folders.unshift({ name: clean.name, dir, note: '' });
  }
  await nameRows(clean);
  await writeRecord(clean);
  // ONE REPOSITORY, ONE SET OF SETTINGS: the same repository in another Workspace takes these.
  const settings = (r: WorkspaceRepo) => `${r.mode} ${r.working} ${r.stable} ${r.desks}`;
  for (const campaign of await campaignNames()) {
    for (const other of await listWorkspaces(campaign)) {
      if (other.name === clean.name && campaign === clean.campaign_id) continue;
      let moved = false;
      for (const row of other.repos) {
        const mine = clean.repos.find((r) => r.dir === row.dir);
        if (mine && settings(mine) !== settings(row)) { Object.assign(row, { mode: mine.mode, working: mine.working, stable: mine.stable, desks: mine.desks }); moved = true; }
      }
      if (moved) await writeRecord(other);
    }
  }
  return clean;
}

async function writeRecord(w: Workspace): Promise<void> {
  await mkdir(campaignDir(w.campaign_id), { recursive: true });
  const file = recordFile(w.campaign_id, w.name);
  const { name: _n, campaign_id: _c, ...body } = w;
  await writeFile(`${file}.tmp`, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  await rename(`${file}.tmp`, file);
}

/** Names each row, never refusing: a dir another Workspace holds keeps that row's name; a new dir
 * takes its basename, made unique (site, site-2). A row has one name in every Workspace. */
async function nameRows(w: Workspace): Promise<void> {
  const others = (await workspaceFolders()).filter((f) => !(f.workspace === w.name && f.campaign_id === w.campaign_id));
  const byDir = new Map(others.map((f) => [f.dir, f.name]));
  const taken = new Set(others.map((f) => f.name));
  for (const row of [...w.repos, ...w.folders]) {
    const known = byDir.get(row.dir);
    if (known) { row.name = known; continue; }
    const base = (isValidWorkspaceName(row.name) ? row.name : path.basename(row.dir).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|-+$/g, '').slice(0, 60)) || 'folder';
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    row.name = name;
    byDir.set(row.dir, name);
    taken.add(name);
  }
}

/** Every folder of every Workspace, once by name: what desks, promotion, tmux and the docs shelf
 * read. A repository row carries its settings; `workspace` is the first Workspace holding it. */
export type HeldFolder = WorkspaceFolder & Partial<Omit<WorkspaceRepo, keyof WorkspaceFolder>> & { repo: boolean; workspace: string; campaign_id: string };
export async function workspaceFolders(): Promise<HeldFolder[]> {
  const out = new Map<string, HeldFolder>();
  for (const campaign of await campaignNames()) {
    for (const w of await listWorkspaces(campaign)) {
      for (const r of w.repos) if (!out.get(r.name)?.repo) out.set(r.name, { ...r, repo: true, workspace: w.name, campaign_id: campaign });
      for (const f of w.folders) if (!out.has(f.name)) out.set(f.name, { ...f, repo: false, workspace: w.name, campaign_id: campaign });
    }
  }
  return [...out.values()];
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

/** The one repository of the Workspace(s) called `name`, in any Campaign; null unless exactly one.
 * `work-record workspace list` leads with the Workspace name, so Agents type it for the repo (KAN-627). */
export async function soleWorkspaceRepo(name: string): Promise<string | null> {
  const repos = new Set<string>();
  for (const campaign of await campaignNames()) {
    for (const repo of (await readWorkspace(campaign, name))?.repos ?? []) repos.add(repo.name);
  }
  return repos.size === 1 ? [...repos][0] : null;
}

export async function campaignNames(): Promise<string[]> {
  try { return (await readdir(storeDir('workspaces'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; return []; }
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

/** The holds file goes with its Workspace (deleteIcebox, under the issuer lock). */
export async function removeWorkspaceHolds(campaign: string, name: string): Promise<void> {
  try { await unlink(holdsFile(campaign, name)); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  holdsWritten(workspaceListKey(campaign, name), '', []);
}

/** Every Workspace's holds, in every Campaign: one row per Workspace record. */
export async function listWorkspaceHolds(): Promise<WorkspaceHolds[]> {
  const out: WorkspaceHolds[] = [];
  for (const campaign of await campaignNames()) for (const w of await listWorkspaces(campaign)) out.push(await readWorkspaceHolds(campaign, w.name));
  return out;
}
