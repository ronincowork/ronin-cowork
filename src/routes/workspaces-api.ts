/** /api/workspaces — a Campaign's Workspaces (src/workspaces.ts): list, save whole, delete. */
import { layersMayHaveChanged } from '../team-layers.js';
import type express from 'express';
import { initialCampaignId } from '../campaign-scope.js';
import { listTeamRosters } from '../team-rosters.js';
import { deleteWorkspace, isValidWorkspaceName, listWorkspaces, normalizeWorkspace, readWorkspace, saveWorkspace, type Workspace } from '../workspaces.js';
import { PlanBadInput, PlanMissing, PlanRefused, movePlans, plansPlace } from '../plans.js';
import { listCanvases } from '../canvases.js';
import { deleteIcebox } from '../work-items.js';
import { callerOf } from './work-items-api.js';
import { addWorkspaceNote, ensureWorkspaceDoc, readWorkspaceSummary, summaryOf, workspaceDocPath, writeWorkspaceDoc, writeWorkspaceSummary } from '../workspace-doc.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);
// The office's one Campaign, always: a page never says which (KAN-727). A person never meets a Campaign.
const campaignOf = (): Promise<string> => initialCampaignId();

const withPlace = async (w: Workspace) => {
  const place = await plansPlace(w.campaign_id, w.name, w.plans).catch((e) => (e instanceof PlanMissing || e instanceof PlanBadInput ? null : Promise.reject(e)));
  // CANVASES (KAN-329): the Workspace's canvases by name, for the page's Canvases line.
  const canvases = place ? (await listCanvases(w).catch(() => [])).map(({ name }) => name) : [];
  return { ...w, plans_place: place ? { location: place.location, path: place.path, recommended: place.recommended } : null, canvases };
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

  // THE WORKSPACE DOC (KAN-713, src/workspace-doc.ts): read (made on the first ask), its Summary
  // replaced, a note added. `workspace-doc` is the tool.
  const docOf = async (req: express.Request, res: express.Response, write?: (name: string, body: Record<string, unknown>) => Promise<string>) => {
    const { name } = req.params;
    try {
      const w = await readWorkspace(await campaignOf(), name);
      if (!w) return res.status(404).json({ error: `No Workspace "${name}". workspace-doc list names them.` });
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (write && !String(body.text ?? '').trim()) return res.status(400).json({ error: 'Give the text.' });
      const text = write ? await write(w.name, body) : await ensureWorkspaceDoc(w.name, w.title);
      const at = (kind: string) => (row: { name: string; dir: string; note: string }) => ({ kind, name: row.name, note: row.note, dir: row.dir });
      res.json({ ok: true, name: w.name, title: w.title, objective: w.objective, locations: [...w.repos.map(at('repository')), ...w.folders.map(at('folder'))],
        path: workspaceDocPath(w.name), text, summary: summaryOf(text) });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  };
  // Every Workspace with its Summary ('' = none yet): `workspace-doc list`.
  app.get('/api/workspace-docs', async (_req, res) => {
    try {
      const all = await listWorkspaces(await campaignOf());
      res.json({ ok: true, workspaces: await Promise.all(all.map(async (w) => ({ name: w.name, title: w.title, summary: await readWorkspaceSummary(w.name) }))) });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
  app.get('/api/workspaces/:name/doc', (req, res) => void docOf(req, res));
  // The Workspace page's Summary is the whole file, edited there (KAN-728).
  app.put('/api/workspaces/:name/doc', (req, res) => void docOf(req, res, async (name, b) => { await writeWorkspaceDoc(name, String(b.text)); return String(b.text); }));
  app.put('/api/workspaces/:name/doc/summary', (req, res) => void docOf(req, res, (name, b) => writeWorkspaceSummary(name, String(b.text))));
  app.post('/api/workspaces/:name/doc/note', (req, res) => void docOf(req, res, (name, b) => addWorkspaceNote(name, String(b.text), String(b.by ?? '').trim().slice(0, 64))));

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
