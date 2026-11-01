/** /api/workspaces — a Campaign's Workspaces (src/workspaces.ts): list, save whole, delete. */
import type express from 'express';
import { initialCampaignId } from '../campaign-scope.js';
import { listTeamRosters } from '../team-rosters.js';
import { deleteWorkspace, isValidWorkspaceName, listWorkspaces, normalizeWorkspace, saveWorkspace } from '../workspaces.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);
const campaignOf = async (stated: unknown): Promise<string> => (typeof stated === 'string' && stated.trim()) || initialCampaignId();

export function registerWorkspaces(app: express.Express): void {
  app.get('/api/workspaces', async (req, res) => {
    try { res.json({ workspaces: await listWorkspaces(await campaignOf(req.query.campaign_id)) }); }
    catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  app.put('/api/workspaces/:name', async (req, res) => {
    const { name } = req.params;
    if (!isValidWorkspaceName(name)) return res.status(400).json({ error: 'A Workspace name is lowercase letters, digits, _ and -.' });
    try {
      const campaign = await campaignOf(req.body?.campaign_id);
      res.json({ ok: true, workspace: await saveWorkspace(normalizeWorkspace(campaign, name, req.body ?? {})) });
    } catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });

  app.delete('/api/workspaces/:name', async (req, res) => {
    const { name } = req.params;
    try {
      const campaign = await campaignOf(req.query.campaign_id);
      const teams = (await listTeamRosters()).filter((t) => t.campaign_id === campaign && t.workspace === name && t.state !== 'archived');
      if (teams.length) return res.status(409).json({ error: `Teams launched in this Workspace: ${teams.map((t) => t.name).join(', ')}. Move them first.` });
      await deleteWorkspace(campaign, name);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
}
