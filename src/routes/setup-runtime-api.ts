import { deleteModelEntry, deleteService, modelServices, saveService } from '../model-services.js';
import { discoverModelIds, saveModelEntry, onModelServicesWritten, readGatewayModels } from '../model-service-store.js';
import { broadcastEvent } from '../ws/events.js';
import { homedir } from 'node:os';
import { dispatchInstall } from '../agent-install.js';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeHarnessLogin,
  completeHarnessLogin,
  openHarnessLogin,
  setHarnessOff,
  setupRuntimeAnswer,
  githubSetupAnswer,
  githubRepositories,
} from '../setup-runtime.js';
import { installedAnswer } from './installed-api.js';
import { fetchMissingModelLists } from '../model-list-fetch.js';
import { GITHUB, cancelSignIn, pasteSignIn, signInState, startGithubSignIn, startSignIn } from '../harness-sign-in.js';
import { measureAndRecordHarnesses, readHarnessSummary, refreshHarnesses } from '../harness-summary.js';
import type { HarnessSummary } from '../harness-catalog.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
const EMPTY_PROVIDER_SUMMARY: HarnessSummary = {
  measured_at: '', refreshed_at: '', installed: [], signed_in: [], operational: [], off: [], activated_count: 0,
  paths: {}, versions: {}, models: {},
};
/** A record-only answer. Setup progress owns every automatic machine measurement. */
const answer = async (summary?: HarnessSummary) => {
  const section = await readSetupSection();
  const facts = summary ?? await readHarnessSummary() ?? EMPTY_PROVIDER_SUMMARY;
  const served = (await modelServices().catch(() => [])).filter((service) => service.configured).flatMap((service) => service.bound);
  return setupRuntimeAnswer(section, facts, undefined, await installedAnswer(), served);
};

export function registerSetupRuntime(app: express.Express): void {
  onModelServicesWritten(() => { broadcastEvent({ t: 'model-services-changed' }); });
  // MODEL SERVICES: the store as the pages and the `harness` tool read and write it.
  app.get('/api/model-services', async (_req, res) => {
    try { res.json({ services: await modelServices() }); } catch (error) { res.status(500).json({ error: errMsg(error) }); }
  });
  app.post('/api/model-services/:action', async (req, res) => {
    try {
      const body = req.body;
      switch (req.params.action) {
        case 'save': await saveService(body); break;
        case 'discover': await discoverModelIds(String(body.id)); break;
        case 'delete': await deleteService(String(body.id)); break;
        case 'save-model': await saveModelEntry({ reasoning: 'default', approvals: 'off', ...body, connection: body.service_id }); break;
        case 'delete-model': await deleteModelEntry(String(body.id)); break;
        default: return res.status(404).json({ error: 'Unknown model service action.' });
      }
      // A service set up or removed can change which harnesses run (Hermes rides one): measure, so the
      // Harness step's tick and its bars read the same new fact.
      await measureAndRecordHarnesses();
      res.json({ services: await modelServices() });
    } catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.get('/api/setup/runtime', async (_req, res) => {
    try {
      res.json(await answer());
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // REFRESH — the one door that reads model lists: the machine facts, then every activated
  // CLI's own list and the Ronin Gateway's. HQ drives it: the park calls it over the unit's
  // socket after HQ moved the CLIs in place (ronin_cloud office_kohai, KAN-651, KAN-972).
  // Never a timer. Every other reader takes GET /api/setup/runtime, which is the record.
  app.post('/api/setup/harnesses/refresh', async (_req, res) => {
    try {
      const summary = await refreshHarnesses();
      await readGatewayModels();
      res.json(await answer(summary));
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/harnesses/:provider/install', async (req, res) => {
    try {
      const [result] = await dispatchInstall([{ kind: 'agent', name: String(req.params.provider) }]);
      if (!result || result.outcome === 'refused') {
        res.status(400).json({ error: result?.say || 'Installation did not start.' });
        return;
      }
      res.json({ ok: true, outcome: result.outcome, runtime: await answer() });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  // The switch: off means Ronin stops using the provider — not measured, not updated, not
  // offered, not launched anew. The sign-in is kept and tiles already running run on. On
  // clears the one field. Either way the machine is measured again so the record moves.
  for (const [door, off] of [['off', true], ['on', false]] as const) {
    app.post(`/api/setup/harnesses/:provider/${door}`, async (req, res) => {
      try {
        const result = await setHarnessOff(String(req.params.provider), off);
        res.json({ ok: true, ...result, runtime: await answer(await measureAndRecordHarnesses()) });
      } catch (error) {
        res.status(400).json({ error: errMsg(error) });
      }
    });
  }

  // SIGN-IN WITHOUT A TERMINAL (src/harness-sign-in.ts): start for a way, paste, cancel; the state
  // is pushed as `harness-sign-in`, and read here when a page opens. `tell` names who hears the end.
  app.get('/api/setup/sign-in', async (_req, res) => { res.json(await signInState()); });
  app.post('/api/setup/harnesses/:provider/sign-in', async (req, res) => {
    try { res.json({ ok: true, run: await startSignIn(String(req.params.provider), req.body?.way === 'api_key' ? 'api_key' : 'subscription', String(req.body?.tell ?? '')) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.post('/api/setup/harnesses/:provider/sign-in/paste', (req, res) => {
    try { res.json({ ok: true, run: pasteSignIn(String(req.params.provider), String(req.body?.text ?? '')) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  // GitHub's sign-in on the same run (KAN-997): start, and cancel by the same door.
  app.post('/api/setup/github/sign-in', async (req, res) => {
    try { res.json({ ok: true, run: await startGithubSignIn(String(req.body?.tell ?? '')) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.post('/api/setup/github/sign-in/cancel', async (_req, res) => {
    try { res.json({ ok: true, state: await cancelSignIn(GITHUB) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.post('/api/setup/harnesses/:provider/sign-in/cancel', async (req, res) => {
    try { res.json({ ok: true, state: await cancelSignIn(String(req.params.provider)) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/harnesses/:provider/login', async (req, res) => {
    try {
      const result = await openHarnessLogin(String(req.params.provider));
      const runtime = await answer();
      const provider = runtime.harnesses.find((row) => row.id === String(req.params.provider));
      res.json({ ok: true, opened: result.opened, attachment: provider?.attachment ?? null, runtime });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/harnesses/:provider/done', async (req, res) => {
    try {
      const result = await completeHarnessLogin(String(req.params.provider));
      // Done activates a provider: the owner's press, so its model list is read now (owner, 2026-09-25).
      res.json({ ok: true, closed: true, activation_recorded: true, activated_at: result.activated_at, attachment: null, runtime: await answer(await refreshHarnesses()) });
      void fetchMissingModelLists(); // a CLI with no list file yet writes one (KAN-995)
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/harnesses/:provider/close', async (req, res) => {
    try {
      await closeHarnessLogin(String(req.params.provider));
      // A sign-in closed without Done may still have left the CLI's credential file: measure.
      res.json({ ok: true, closed: true, activation_recorded: false, attachment: null, runtime: await answer(await measureAndRecordHarnesses()) });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.get('/api/setup/github', async (_req, res) => {
    try { res.json(await githubSetupAnswer()); }
    catch (error) { res.status(500).json({ error: errMsg(error) }); }
  });

  app.get('/api/setup/github/repos', async (_req, res) => {
    try { res.json({ ok: true, ...await githubRepositories() }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

}
