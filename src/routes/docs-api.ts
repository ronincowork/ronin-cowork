import type express from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { listProjectRoots } from '../project-roots.js';
import { storeDir } from '../resources.js';
import { listWorkspaces } from '../workspaces.js';
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
async function planGroups() {
  const campaigns = await readdir(storeDir('workspaces'), { withFileTypes: true }).then((all) => all.filter((d) => d.isDirectory()).map((d) => d.name).sort(), () => [] as string[]);
  const groups = [];
  for (const campaign of campaigns) {
    for (const w of await listWorkspaces(campaign)) {
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

export function registerDocs(app: express.Express): void {
  app.get('/api/docs', async (req, res) => {
    const shelf = String(req.query.shelf ?? '');
    if (shelf !== 'plans' && shelf !== 'docs') return res.status(400).json({ error: 'shelf is "plans" or "docs".' });
    try {
      if (shelf === 'plans') return res.json({ shelf, groups: await planGroups() });
      const roots = await listProjectRoots();
      const groups = [];
      for (const r of roots) {
        const files: string[] = [];
        for (const rel of r.docs) await docsUnder(path.resolve(r.dir, rel), files);
        groups.push({ root: r.name, dir: r.dir, archived: r.archived, files });
      }
      res.json({ shelf, groups });
    } catch (e) {
      res.status(500).json({ error: String((e as Error)?.message ?? e) });
    }
  });
}
