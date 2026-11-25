/** /api/workspaces — a Campaign's Workspaces (src/workspaces.ts): list, save whole, delete. */
import { layersMayHaveChanged } from '../team-layers.js';
import type express from 'express';
import { initialCampaignId } from '../campaign-scope.js';
import { listTeamRosters } from '../team-rosters.js';
import { addRepository, deleteWorkspace, isValidWorkspaceName, listWorkspaces, normalizeWorkspace, readWorkspace, saveWorkspace, type Workspace } from '../workspaces.js';
import { PlanBadInput, PlanMissing, PlanRefused, movePlans, plansPlace } from '../plans.js';
import { listCanvases } from '../canvases.js';
import { folderFacts } from '../folder-facts.js';
import { deleteIcebox } from '../work-items.js';
import { callerOf } from './work-items-api.js';
import { cloneRepository, createGithubRepository } from '../setup-runtime.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);
// The office's one Campaign, always: a page never says which (KAN-727). A person never meets a Campaign.
const campaignOf = (): Promise<string> => initialCampaignId();

const withPlace = async (w: Workspace) => {
  const place = await plansPlace(w.campaign_id, w.name, w.plans).catch((e) => (e instanceof PlanMissing || e instanceof PlanBadInput ? null : Promise.reject(e)));
  // CANVASES (KAN-329): the Workspace's canvases by name, for the page's Canvases line.
  const canvases = place ? (await listCanvases(w).catch(() => [])).map(({ name }) => name) : [];
  // EACH REPOSITORY'S REMOTE (KAN-809), for its row's line: read here, nothing probes a folder.
  const repos = await Promise.all(w.repos.map(async (r) => ({ ...r, remote: (await folderFacts(r.dir).catch(() => null))?.repo?.remote ?? '' })));
  return { ...w, repos, plans_place: place ? { location: place.location, path: place.path, recommended: place.recommended } : null, canvases };
};

export function registerWorkspaces(app: express.Express): void {
  // Each Workspace with where its plans are (`plans_place`, src/plans.ts) and its canvases' names:
  // the page's Plans row and Canvases line.
  app.get('/api/workspaces', async (_req, res) => {
    try {
      const workspaces = await listWorkspaces(await campaignOf());
      res.json({ workspaces: await Promise.all(workspaces.map(withPlace)) });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  app.put('/api/workspaces/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidWorkspaceName(name)) return res.status(400).json({ error: 'A Workspace name is lowercase letters, digits, _ and -.' });
    try {
      const campaign = await campaignOf();
      const was = await readWorkspace(campaign, name);
      // PLANS (KAN-256): a body without `plans` keeps the place it had; `plans: null` is the default.
      // On a changed place the plans move there first: a name already there stops the Save, naming the
      // clashes, so one plan file never overwrites another. Any Location will do.
      const body = { ...(req.body ?? {}) } as Record<string, unknown>;
      if (!('plans' in body) && was?.plans) body.plans = was.plans;
      // INTEGRATIONS (KAN-338): likewise, a body without `integrations` keeps the ones it had.
      if (!('integrations' in body) && was) body.integrations = was.integrations;
      const next = normalizeWorkspace(campaign, name, body);
      const changed = JSON.stringify(was?.plans ?? null) !== JSON.stringify(next.plans ?? null);
      let moved: string[] = [];
      if (changed && next.plans) await plansPlace(campaign, name, next.plans);
      if (changed && was) moved = (await movePlans(campaign, name, was.plans, next.plans)).moved;
      res.json({ ok: true, workspace: await withPlace(await saveWorkspace(next)), ...(moved.length ? { moved } : {}) });
      layersMayHaveChanged(); // a Team's Workspace line (team-layers.ts)
    } catch (e) {
      res.status(e instanceof PlanRefused ? 409 : e instanceof PlanMissing ? 404 : 400).json({ error: errMsg(e) });
    }
  });

  // A REPOSITORY INTO IT (KAN-809): cloned from `repository`, or started (none given), at
  // repos/<repo> in its folder; `github` (private | public) puts a started one on GitHub too.
  app.post('/api/workspaces/:name/repos', async (req, res) => {
    try {
      const w = await readWorkspace(await campaignOf(), req.params.name);
      if (!w) return res.status(404).json({ error: `No Workspace ${req.params.name}.` });
      const repository = typeof req.body?.repository === 'string' ? req.body.repository.trim() : '';
      const added = await addRepository(w, repository, cloneRepository);
      const github = !repository && (req.body?.github === 'private' || req.body?.github === 'public') ? await createGithubRepository(added.dir, req.body.github) : null;
      res.json({ ok: true, workspace: await withPlace(added.workspace), dir: added.dir, ...(github ? { github } : {}) });
      layersMayHaveChanged();
    } catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });

  app.delete('/api/workspaces/:name', async (req, res) => {
    const { name } = req.params;
    try {
      const campaign = await campaignOf();
      const teams = (await listTeamRosters()).filter((t) => t.campaign_id === campaign && t.workspace === name && t.state !== 'archived');
      if (teams.length) return res.status(409).json({ error: `Teams launched in this Workspace: ${teams.map((t) => t.name).join(', ')}. Move them first.` });
      await deleteIcebox(campaign, name, callerOf(req)); // first: the holds file names it (KAN-786)
      await deleteWorkspace(campaign, name);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
}
