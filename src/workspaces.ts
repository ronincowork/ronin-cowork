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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { rootDir, storeDir, STORES } from './resources.js';
import { teamAgentDefaults, type LaunchMode, type TeamAgentDefaults } from './agent-defaults.js';
import { launchModeOf, modelsOf, parentSettings, type Models } from './waterfall.js';

/** The kinds (owner, 25 Nov): a Workspace's only; Teams and Agents have none. public/js/glyphs.js keeps the client's list. */
export const WORKSPACE_KINDS = ['open', 'business', 'personal', 'household', 'social', 'school'] as const;
export type WorkspaceKind = typeof WORKSPACE_KINDS[number];
import { cloneRepository } from './setup-runtime.js';

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
  /** What kind of Workspace it is: open, business, personal, household, social or school. */
  kind: WorkspaceKind;
  objective: string;
  instructions: string;
  repos: WorkspaceRepo[];
  folders: WorkspaceFolder[];
  /** Its settings, copied from the Campaign when it was made, handed to each Team made in it (src/waterfall.ts). */
  launch_mode: LaunchMode;
  agent_defaults: TeamAgentDefaults;
  models: Models;
  plans?: WorkspacePlans;
  integrations: WorkspaceIntegration[];
  /** The Workspace's brief settings and project management (docs/architecture/brief.md, Layers and brief settings). */
  brief: BriefSettings;
  pm?: boolean;
  /** Archived (the page's ⋯): off the Workspace pickers, kept, one press brings it back. */
  archived?: boolean;
}

const execFileP = promisify(execFile);

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
    kind: (WORKSPACE_KINDS as readonly unknown[]).includes(v.kind) ? v.kind as WorkspaceKind : 'open',
    objective: text(v.objective, 2000),
    instructions: text(v.instructions, 8000),
    repos: rows(v.repos, (r) => { const f = folderRow(r); return f && repoRow(f, r); }),
    folders: rows(v.folders, folderRow),
    launch_mode: launchModeOf(v.launch_mode),
    agent_defaults: teamAgentDefaults(v.agent_defaults),
    models: modelsOf(v.models),
    ...plansOf(v.plans),
    integrations: integrationsOf(v.integrations),
    brief: briefSettings(v.brief),
    ...(typeof v.pm === 'boolean' ? { pm: v.pm } : {}),
    ...(v.archived === true ? { archived: true } : {}),
  };
}

/** A Workspace about to be made (src/waterfall.ts): its Campaign's settings, then what `body` states;
 * its integrations are the body's and the Campaign's. Saved by saveWorkspace, which gives it its folder. */
export async function newWorkspace(campaign_id: string, name: string, body: Record<string, unknown>): Promise<Workspace> {
  const { settings } = await parentSettings(campaign_id);
  const own = Array.isArray(body.integrations) ? body.integrations : [];
  return normalizeWorkspace(campaign_id, name, { ...settings, ...body, integrations: [...own, ...settings.integrations] });
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

/**
 * THE WORKSPACE FOLDER (owner, 25 Nov; KAN-809): the office is empty, so Ronin sets the layout, the
 * same in every Workspace. A plain folder; only the repositories are Git:
 *   ~/ronin/<name>/
 *     plans/               its plans (src/plans.ts)
 *     files/               anything that isn't code: documents, notes, uploads; files/<source>/ per source
 *     repos/<repo>/        each repository, cloned or started, its own Git (addRepository)
 */
export async function layOut(dir: string): Promise<void> {
  for (const sub of ['plans', 'files', 'repos']) await mkdir(path.join(dir, sub), { recursive: true });
}

/**
 * A repository into a Workspace, at repos/<repo> (the rule above): `repository` (a Git URL or
 * owner/name) is cloned; none starts a new one named after the Workspace. Its row is added to the
 * record on `mode`: Desks (`reviewed`, the default) hands work in to dev, its own branch stable;
 * Direct works on its own branch.
 */
export async function addRepository(w: Workspace, repository: string, mode: WorkspaceRepo['mode'] = 'reviewed'): Promise<{ workspace: Workspace; dir: string }> {
  const repos = path.join(ownFolder(w.name), 'repos');
  await mkdir(repos, { recursive: true });
  let dir: string;
  const git = (args: string[]) => execFileP('git', ['-C', dir, ...args], { timeout: 10_000 }).then((r) => r.stdout.trim());
  if (repository) dir = (await cloneRepository(repository, repos)).dir;
  else {
    // A started one gets its first commit, a README naming it, so its branches exist.
    dir = path.join(repos, w.name);
    await execFileP('git', ['init', '-q', '-b', 'main', dir], { timeout: 10_000 });
    await writeFile(path.join(dir, 'README.md'), `# ${w.title || w.name}\n${w.objective ? `\n${w.objective}\n` : ''}`, 'utf8');
    await git(['add', '-A']);
    await git(['-c', 'user.name=Ronin', '-c', 'user.email=ronin@localhost', 'commit', '-q', '-m', `Start ${w.title || w.name}`]);
  }
  const stable = (await git(['symbolic-ref', '--short', 'HEAD']).catch(() => '')) || 'main';
  // DESKS BY DEFAULT (owner, 25 Nov): each Agent on its own desk, handed in to dev and promoted; dev
  // starts where the stable branch is.
  if (mode === 'reviewed' && !(await git(['rev-parse', '--verify', '--quiet', 'refs/heads/dev']).then(() => true, () => false))) await git(['branch', 'dev', stable]);
  const row = mode === 'reviewed'
    ? { name: '', dir, note: '', mode, working: 'dev', stable, desks: 'managed' }
    : { name: '', dir, note: '', mode, working: '', stable, desks: 'none' };
  const next = normalizeWorkspace(w.campaign_id, w.name, { ...w, repos: [...w.repos, row] } as unknown as Record<string, unknown>);
  return { workspace: await saveWorkspace(next), dir };
}

/** Write the whole record. */
export async function saveWorkspace(w: Workspace): Promise<Workspace> {
  if (!w.campaign_id || !isValidWorkspaceName(w.name)) throw new Error(`A Workspace name is lowercase letters, digits, _ and -: "${w.name}".`);
  const clean = normalizeWorkspace(w.campaign_id, w.name, w as unknown as Record<string, unknown>);
  // EVERY WORKSPACE GETS ITS FOLDER (owner, 24 Nov; KAN-809): a new one is given ~/ronin/<name>, laid
  // out by the rule (layOut), here, whoever makes it (a page, the workspace tool).
  if (!(await readWorkspace(clean.campaign_id, clean.name))) {
    const dir = ownFolder(clean.name);
    await layOut(dir);
    // DOOR 2's SOURCES (KAN-809): each its own folder under files/, named on its integration row.
    for (const row of clean.integrations) if (/^files\/[a-z0-9_-]+$/.test(String(row.folder || ''))) await mkdir(path.join(dir, String(row.folder)), { recursive: true });
    // Its row is <name>-folder: the bare name is left for a repository started in it, repos/<name>.
    if (![...clean.repos, ...clean.folders].some((row) => row.dir === dir)) clean.folders.unshift({ name: `${clean.name}-folder`, dir, note: '' });
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
