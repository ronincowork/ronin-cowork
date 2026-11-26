/** /api/integrations — every integration record in this machine's Settings with its live state
 * (src/integrations.ts). Read only: records are written through the broker (/api/mcp/*), keys
 * through /api/secrets. */
import type express from 'express';
import { homedir } from 'node:os';
import { initialCampaignId } from '../campaign-scope.js';
import { isValidCampaignId } from '../campaigns.js';
import { discoverParts } from '../parts.js';
import { listServices } from '../sockets.js';
import { integrationsState } from '../integrations.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');
const parts = () => ({ onDisk: discoverParts().map((part) => part.name), loaded: listServices() });

export function registerIntegrations(app: express.Express): void {
  app.get('/api/integrations', async (req, res) => {
    try {
      const campaign = (typeof req.query.campaign_id === 'string' && req.query.campaign_id.trim()) || await initialCampaignId();
      if (!isValidCampaignId(campaign)) { res.status(400).json({ error: `"${campaign}" is not a Campaign id.` }); return; }
      res.json({ campaign_id: campaign, integrations: await integrationsState(campaign, parts()) });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });
}
