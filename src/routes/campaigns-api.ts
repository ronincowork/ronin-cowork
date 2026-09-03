import type express from 'express';
import {
  archiveCampaign,
  createCampaign,
  isValidCampaignId,
  listCampaigns,
  readCampaign,
  writeCampaign,
  type CampaignEdit,
  type CampaignState,
} from '../campaigns.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const state = (v: unknown): CampaignState | undefined =>
  v === 'active' || v === 'archived' ? v : undefined;

function editOf(body: unknown): CampaignEdit {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const k of ['id', 'created_at']) {
    if (b[k] !== undefined) {
      throw new Error(
        `"${k}" cannot be changed — it is the Campaign's identity, and every campaign_id pointing at it would have to move too.`,
      );
    }
  }
  const config = b.config && typeof b.config === 'object' && !Array.isArray(b.config)
    ? (b.config as CampaignEdit['config'])
    : undefined;
  const desk = b.desk && typeof b.desk === 'object' && !Array.isArray(b.desk)
    ? (b.desk as CampaignEdit['desk'])
    : undefined;
  return {
    ...(str(b.title) !== undefined ? { title: str(b.title) } : {}),
    ...(str(b.description) !== undefined ? { description: str(b.description) } : {}),
    ...(str(b.desk_profile) !== undefined ? { desk_profile: str(b.desk_profile) } : {}),
    ...(desk !== undefined ? { desk } : {}),
    ...(state(b.state) !== undefined ? { state: state(b.state) } : {}),
    ...(config !== undefined ? { config } : {}),
  };
}

export function registerCampaigns(app: express.Express): void {
  app.get('/api/campaigns', async (req, res) => {
    try {
      const all = await listCampaigns();
      const want = String(req.query.state ?? '');
      res.json({ campaigns: want === 'active' || want === 'archived' ? all.filter((c) => c.state === want) : all });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/campaigns/:id', async (req, res) => {
    try {
      const c = await readCampaign(String(req.params.id));
      if (!c) return res.status(404).json({ error: `no Campaign named '${req.params.id}'` });
      res.json(c);
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/campaigns', async (req, res) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const id = str(b.id);
      if (id !== undefined && !isValidCampaignId(id)) {
        return res.status(400).json({ error: `"${id}" is not a usable Campaign id — lowercase letters, digits, - and _ only.` });
      }
      const edit = editOf({ ...b, id: undefined });
      const created = await createCampaign({ ...edit, ...(id !== undefined ? { id } : {}) });
      res.status(201).json(created);
    } catch (e) {
      const msg = errMsg(e);
      res.status(/already exists/.test(msg) ? 409 : 400).json({ error: msg });
    }
  });

  app.put('/api/campaigns/:id', async (req, res) => {
    try {
      res.json(await writeCampaign(String(req.params.id), editOf(req.body)));
    } catch (e) {
      const msg = errMsg(e);
      res.status(/does not exist/.test(msg) ? 404 : 400).json({ error: msg });
    }
  });

  app.post('/api/campaigns/:id/archive', async (req, res) => {
    try {
      res.json(await archiveCampaign(String(req.params.id)));
    } catch (e) {
      const msg = errMsg(e);
      res.status(/does not exist/.test(msg) ? 404 : 400).json({ error: msg });
    }
  });
}
