import type express from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listProjectRoots } from '../project-roots.js';
import { storeDir } from '../resources.js';
import { listWorkspaces, readWorkspace, type Workspace } from '../workspaces.js';
import { readTeamRoster } from '../team-rosters.js';
import { PLAN_STATUSES, listPlans, plansPlace } from '../plans.js';

const DOC_EXT = /\.(md|html?)$/i;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);
const MAX_PER_ROOT = 400;

async function docsUnder(at: string, out: string[]): Promise<void> {
  let s;
  try {
    s = await stat(at);
  } catch {
    return; // a named place that is not there is a root's business, not an error here
  }
  if (s.isFile()) {
    if (DOC_EXT.test(at)) out.push(at);
    return;
  }
  if (!s.isDirectory()) return;
  const names = (await readdir(at, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const d of names) {
    if (out.length >= MAX_PER_ROOT) return;
    if (d.name.startsWith('.') || SKIP.has(d.name)) continue;
    const p = path.join(at, d.name);
    if (d.isDirectory()) await docsUnder(p, out);
    else if (d.isFile() && DOC_EXT.test(d.name)) out.push(p);
  }
}

/** THE PLANS SHELF (KAN-256): one group per Workspace, its plans (src/plans.ts) by status, Draft
 * first; each file's status as its hint. "Plans" means one thing: the Workspaces' orders. */
async function planGroups(only: Workspace | null) {
  const campaigns = only ? [only.campaign_id] : await readdir(storeDir('workspaces'), { withFileTypes: true }).then((all) => all.filter((d) => d.isDirectory()).map((d) => d.name).sort(), () => [] as string[]);
  const groups = [];
  for (const campaign of campaigns) {
    for (const w of only ? [only] : await listWorkspaces(campaign)) {
      const place = await plansPlace(campaign, w.name, w.plans).catch(() => null);
      if (!place) continue;
      const plans = (await listPlans(w)).sort((a, b) => PLAN_STATUSES.indexOf(a.status) - PLAN_STATUSES.indexOf(b.status) || a.name.localeCompare(b.name));
      groups.push({
        root: campaigns.length > 1 ? `${campaign}/${w.name}` : w.name, dir: place.dir, archived: false,
        files: plans.map((plan) => path.join(place.dir, `${plan.name}.md`)),
        hints: plans.map((plan) => [plan.status, plan.date].filter(Boolean).join(' · ')),
      });
    }
  }
  return groups;
}

/** A TEAM'S SHELF IS ITS WORKSPACE'S (owner, 2026-11-09; KAN-326): with `team`, Plans are its
 * Workspace's plans and Docs the Workspace Folders its Workspace names (repos and folders), and
 * `scope` says so in words. Without one — or for a Team with no Workspace — every Workspace's. */
async function teamWorkspace(team: string): Promise<Workspace | null> {
  if (!team) return null;
  const roster = await readTeamRoster(team).catch(() => null);
  return roster?.workspace ? readWorkspace(roster.campaign_id, roster.workspace).catch(() => null) : null;
}

export function registerDocs(app: express.Express): void {
  app.get('/api/docs', async (req, res) => {
    const shelf = String(req.query.shelf ?? '');
    if (shelf !== 'plans' && shelf !== 'docs') return res.status(400).json({ error: 'shelf is "plans" or "docs".' });
    try {
      const w = await teamWorkspace(String(req.query.team ?? '').trim());
      if (shelf === 'plans') return res.json({ shelf, scope: w ? { workspace: w.name } : null, groups: await planGroups(w) });
      const named = w ? [...w.repos, ...w.folders].map((one) => one.name) : null;
      const roots = (await listProjectRoots()).filter((r) => !named || named.includes(r.name));
      const groups = [];
      for (const r of roots) {
        const files: string[] = [];
        for (const rel of r.docs) await docsUnder(path.resolve(r.dir, rel), files);
        groups.push({ root: r.name, dir: r.dir, archived: r.archived, files });
      }
      res.json({ shelf, scope: w ? { workspace: w.name, folders: roots.map((r) => r.name) } : null, groups });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
