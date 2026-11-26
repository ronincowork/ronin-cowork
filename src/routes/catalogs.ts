import { readMachineSettingsSection, updateDocument } from '../machine-settings.js';
import { broadcastEvent } from '../ws/events.js';
import { AGENTS } from '../agents.js';
import { homedir } from 'node:os';
import type express from 'express';
import { listSkins } from '../skin-catalog.js';
import { listLexicons, resolveLexicon } from '../lexicon-catalog.js';
import { activeDeskProfileName, listDeskProfiles } from '../desk-profiles.js';
import { initialCampaign } from '../campaigns.js';
import { harnessCatalogAnswer } from '../harness-catalog.js';
import { readHarnessSummary } from '../harness-summary.js';
import { setRepoSettings } from '../desks/arrangement.js';
import {
  listSavedLaunches,
  seedUserCatalog,
  isShadowable,
} from '../resources.js';
import { listInstallations } from '../resource-adapters.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

export function registerCatalogs(app: express.Express): void {
  // A repository's settings, on its Workspace row (KAN-728): mode, working, stable, desks.
  app.put('/api/folders/:name/repo-profile', async (req, res) => {
    try { res.json({ ok: true, arrangement: await setRepoSettings(req.params.name, req.body ?? {}) }); }
    catch (e) { res.status(400).json({ error: errMsg(e) }); }
  });

  app.get('/api/skins', async (_req, res) => {
    try {
      res.json(await listSkins());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  // The one catalog read for the client: origin, path, the model info's date, the dates
  // of the record, and every provider with its joined rows — Native, then what its CLI lists.
  app.get('/api/harness-catalog', async (_req, res) => {
    try {
      const catalog = await harnessCatalogAnswer(await readHarnessSummary());
      const preferences = await readMachineSettingsSection('newAgentModels', {});
      res.json({ ...catalog, preferences });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.put('/api/new-agent-models/:cli', async (req, res) => {
    const cli = req.params.cli;
    const groups = req.body;
    if (!AGENTS.some(agent => agent.id === cli) || !groups || typeof groups !== 'object' || Array.isArray(groups) ||
        !Object.entries(groups).every(([key, ids]) => /^[a-zA-Z0-9_-]{1,100}$/.test(key) &&
          (ids === null || (Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.length <= 1024))))) {
      return res.status(400).json({ error: 'Invalid harness model selections.' });
    }
    try {
      await updateDocument(doc => {
        doc.newAgentModels = { ...(doc.newAgentModels as Record<string, unknown>), [cli]: groups };
      });
      broadcastEvent({ t: 'model-services-changed' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  app.get('/api/installations', async (_req, res) => {
    try { res.json(await listInstallations()); }
    catch (e) { res.status(500).json({ error: errMsg(e) }); }
  });

  app.get('/api/desk-profiles', async (_req, res) => {
    try {
      res.json({
        active: await activeDeskProfileName(),
        profiles: await listDeskProfiles(),
        desk: (await initialCampaign())?.desk ?? null,
      });
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/lexicons', async (_req, res) => {
    try {
      res.json(await listLexicons());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
  app.get('/api/lexicons/:name', async (req, res) => {
    try {
      const lex = await resolveLexicon(String(req.params.name));
      if (!lex) return res.status(404).json({ error: `no lexicon named '${req.params.name}'` });
      res.json(lex);
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.get('/api/saved-launches', async (_req, res) => {
    try {
      res.json(await listSavedLaunches());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });

  app.post('/api/catalogs/seed', async (req, res) => {
    const file = String((req.body as { file?: unknown })?.file ?? '');
    if (!isShadowable(file)) return res.status(400).json({ error: `"${file}" is not a catalog you can shadow.` });
    try {
      res.json(await seedUserCatalog(file));
    } catch (e) {
      res.status(400).json({ error: errMsg(e) });
    }
  });
}
