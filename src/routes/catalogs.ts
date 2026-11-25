import { homedir } from 'node:os';
import type express from 'express';
import { listSkins } from '../skin-catalog.js';
import { listLexicons, resolveLexicon } from '../lexicon-catalog.js';
import { activeDeskProfileName, listDeskProfiles } from '../desk-profiles.js';
import { initialCampaign } from '../campaigns.js';
import { providerCatalogAnswer } from '../model-providers.js';
import { readProviderSummary } from '../provider-summary.js';
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
  app.get('/api/provider-catalog', async (_req, res) => {
    try {
      res.json(await providerCatalogAnswer(await readProviderSummary()));
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
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
