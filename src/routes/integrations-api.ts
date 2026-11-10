/** /api/integrations — the integrations index with each one's live state for a Campaign, and
 * Connect / Disconnect for any provider (src/integrations.ts; KAN-339). */
import type express from 'express';
import { homedir } from 'node:os';
import { initialCampaignId } from '../campaign-scope.js';
import { isValidCampaignId } from '../campaigns.js';
import { discoverParts } from '../parts.js';
import { listServices } from '../sockets.js';
import { IntegrationBadInput, IntegrationMissing, connectIntegration, disconnectIntegration, integrationsState } from '../integrations.js';

const errMsg = (e: unknown): string => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');
const campaignOf = async (stated: unknown): Promise<string> => {
  const id = (typeof stated === 'string' && stated.trim()) || await initialCampaignId();
  if (!isValidCampaignId(id)) throw new IntegrationBadInput(`"${id}" is not a Campaign id.`);
  return id;
};
const status = (e: unknown): number => (e instanceof IntegrationBadInput ? 400 : e instanceof IntegrationMissing ? 404 : 500);
const parts = () => ({ onDisk: discoverParts().map((part) => part.name), loaded: listServices() });

export function registerIntegrations(app: express.Express): void {
  app.get('/api/integrations', async (req, res) => {
    try {
      const campaign = await campaignOf(req.query.campaign_id);
      res.json({ campaign_id: campaign, integrations: await integrationsState(campaign, parts()) });
    } catch (e) { res.status(status(e)).json({ error: errMsg(e) }); }
  });

  app.put('/api/integrations/:name/connect', async (req, res) => {
    try {
      const campaign = await campaignOf(req.body?.campaign_id);
      const file = await connectIntegration(campaign, req.params.name, req.body?.values ?? {});
      res.json({ ok: true, file: file.replace(homedir(), '~') });
    } catch (e) { res.status(status(e)).json({ error: errMsg(e) }); }
  });

  app.delete('/api/integrations/:name/connect', async (req, res) => {
    try {
      const campaign = await campaignOf(req.query.campaign_id);
      const file = await disconnectIntegration(campaign, req.params.name);
      res.json({ ok: true, file: file.replace(homedir(), '~') });
    } catch (e) { res.status(status(e)).json({ error: errMsg(e) }); }
  });
}
