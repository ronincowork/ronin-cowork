import { modelServices } from '../model-services.js';
import { modelServiceStoreAnswer, saveModelService, discoverModelIds, saveModelOption, deleteModelServiceEntry, onModelServicesWritten, readGatewayModels } from '../model-service-store.js';
import { broadcastEvent } from '../ws/events.js';
import { accountsAnswer, saveAccount, discoverAccount, deleteAccount, savePreset, deletePreset } from '../accounts.js';
import { homedir } from 'node:os';
import { dispatchInstall } from '../agent-install.js';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeHarnessLogin,
  completeHarnessLogin,
  openHarnessLogin,
  openHarnessUpdate,
  setHarnessOff,
  setupRuntimeAnswer,
  githubSetupAnswer,
  githubRepositories,
} from '../setup-runtime.js';
import { installedAnswer } from './installed-api.js';
import { cancelSignIn, pasteSignIn, signInState, startSignIn } from '../harness-sign-in.js';
import { measureAndRecordHarnesses, readHarnessSummary, refreshHarnesses } from '../harness-summary.js';
import type { HarnessSummary } from '../harness-catalog.js';
import { readUserIntro, writeUserIntro } from '../user-intro.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
const EMPTY_PROVIDER_SUMMARY: HarnessSummary = {
  measured_at: '', refreshed_at: '', installed: [], signed_in: [], operational: [], off: [], activated_count: 0,
  paths: {}, versions: {}, models: {}, latest: {},
};
/** A record-only answer. Setup progress owns every automatic machine measurement. */
const answer = async (summary?: HarnessSummary) => {
  const section = await readSetupSection();
  const facts = summary ?? await readHarnessSummary() ?? EMPTY_PROVIDER_SUMMARY;
  return setupRuntimeAnswer(section, facts, undefined, await installedAnswer());
};

export function registerSetupRuntime(app: express.Express): void {
  onModelServicesWritten(() => { broadcastEvent({ t: 'model-services-changed' }); });
  app.get('/api/hermes', async (_req, res) => {
    try { res.json(await modelServiceStoreAnswer()); } catch { res.status(500).json({ error: 'Could not read Hermes setups.' }); }
  });
  app.post('/api/hermes/:action', async (req, res) => {
    try {
      switch (req.params.action) {
        // A connection's models are read as it is saved: nobody presses to read them (owner, 25 Nov 2026).
        case 'connection': { const saved = await saveModelService(req.body); await discoverModelIds(saved.id).catch(() => {}); break; }
        case 'discover': await discoverModelIds(String(req.body.id)); break;
        case 'setup': await saveModelOption(req.body); break;
        case 'delete':
          if (req.body.kind !== 'connections' && req.body.kind !== 'setups') throw new Error('Invalid entry type.');
          await deleteModelServiceEntry(req.body.kind, String(req.body.id)); break;
        default: return res.status(404).json({ error: 'Unknown Hermes action.' });
      }
      await measureAndRecordHarnesses();
      res.json(await modelServiceStoreAnswer());
    } catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  // ACCOUNTS AND PRESETS (KAN-236): the Agent Harness workbench's reading of the same Hermes record,
  // for the Accounts and Models tilespaces and every harness page. The /api/hermes routes above keep answering.
  app.get('/api/model-services', async (_req, res) => {
    try { res.json({ services: await modelServices() }); } catch (error) { res.status(500).json({ error: errMsg(error) }); }
  });
  app.post('/api/model-services/:action', async (req, res) => {
    try {
      const body = req.body;
      switch (req.params.action) {
        case 'save': await saveAccount(body); break;
        case 'discover': await discoverAccount(String(body.id)); break;
        case 'delete': await deleteAccount(String(body.id)); break;
        case 'save-model': await saveModelOption({ reasoning: 'default', approvals: 'off', ...body, connection: body.service_id }); break;
        case 'delete-model': await deletePreset(String(body.id)); break;
        default: return res.status(404).json({ error: 'Unknown model service action.' });
      }
      res.json({ services: await modelServices() });
    } catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.get('/api/accounts', async (_req, res) => {
    try { res.json(await accountsAnswer()); } catch { res.status(500).json({ error: 'Could not read accounts.' }); }
  });
  app.post('/api/accounts/:action', async (req, res) => {
    try {
      switch (req.params.action) {
        case 'save': await saveAccount(req.body); break;
        case 'discover': await discoverAccount(String(req.body.id)); break;
        case 'delete': await deleteAccount(String(req.body.id)); break;
        default: return res.status(404).json({ error: 'Unknown account action.' });
      }
      await measureAndRecordHarnesses();
      res.json(await accountsAnswer());
    } catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.get('/api/presets', async (_req, res) => {
    try { res.json({ presets: (await accountsAnswer()).presets }); } catch { res.status(500).json({ error: 'Could not read presets.' }); }
  });
  app.post('/api/presets/:action', async (req, res) => {
    try {
      switch (req.params.action) {
        case 'save': await savePreset(req.body); break;
        case 'delete': await deletePreset(String(req.body.id)); break;
        default: return res.status(404).json({ error: 'Unknown preset action.' });
      }
      await measureAndRecordHarnesses();
      res.json(await accountsAnswer());
    } catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.get('/api/setup/user-intro', async (_req, res) => {
    try { res.json(await readUserIntro()); }
    catch (error) { res.status(500).json({ error: errMsg(error) }); }
  });

  app.put('/api/setup/user-intro', async (req, res) => {
    try { res.json({ ok: true, ...(await writeUserIntro(req.body?.intro)) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.get('/api/setup/runtime', async (_req, res) => {
    try {
      res.json(await answer());
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // REFRESH ALL — the one door that reads model lists: the machine facts, then every
  // activated CLI's own list and each provider part's, then the one outbound ask — the newest
  // release of each activated CLI whose install line names an npm package. Ronin runs it at
  // start; in a hosted office the park calls it over the unit's socket when it moved the CLIs
  // in place (ronin_cloud office_kohai, KAN-651); the member's press. Never a timer; each ask
  // is an egress line. Every other reader takes GET /api/setup/runtime, which is the record.
  app.post('/api/setup/providers/refresh', async (_req, res) => {
    try {
      const summary = await refreshHarnesses();
      await readGatewayModels();
      res.json(await answer(summary));
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/install', async (req, res) => {
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

  // Update: the registry's update line in a temporary provider_setup session shown in the
  // page, as a sign-in is; the same /close ends it. The owner's press.
  app.post('/api/setup/providers/:provider/update', async (req, res) => {
    try {
      const result = await openHarnessUpdate(String(req.params.provider));
      const runtime = await answer();
      const provider = runtime.providers.find((row) => row.id === String(req.params.provider));
      res.json({ ok: true, opened: result.opened, session: result.session, attachment: provider?.attachment ?? null, runtime });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  // The switch: off means Ronin stops using the provider — not measured, not updated, not
  // offered, not launched anew. The sign-in is kept and tiles already running run on. On
  // clears the one field. Either way the machine is measured again so the record moves.
  for (const [door, off] of [['off', true], ['on', false]] as const) {
    app.post(`/api/setup/providers/:provider/${door}`, async (req, res) => {
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
  app.post('/api/setup/providers/:provider/sign-in', async (req, res) => {
    try { res.json({ ok: true, run: await startSignIn(String(req.params.provider), req.body?.way === 'api_key' ? 'api_key' : 'subscription', String(req.body?.tell ?? '')) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.post('/api/setup/providers/:provider/sign-in/paste', (req, res) => {
    try { res.json({ ok: true, run: pasteSignIn(String(req.params.provider), String(req.body?.text ?? '')) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
  app.post('/api/setup/providers/:provider/sign-in/cancel', (req, res) => {
    cancelSignIn(String(req.params.provider));
    res.json({ ok: true });
  });

  app.post('/api/setup/providers/:provider/login', async (req, res) => {
    try {
      const result = await openHarnessLogin(String(req.params.provider));
      const runtime = await answer();
      const provider = runtime.providers.find((row) => row.id === String(req.params.provider));
      res.json({ ok: true, opened: result.opened, attachment: provider?.attachment ?? null, runtime });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/done', async (req, res) => {
    try {
      const result = await completeHarnessLogin(String(req.params.provider));
      // Done activates a provider: the owner's press, so its model list is read now (owner, 2026-09-25).
      res.json({ ok: true, closed: true, activation_recorded: true, activated_at: result.activated_at, attachment: null, runtime: await answer(await refreshHarnesses()) });
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/close', async (req, res) => {
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
    try { res.json({ ok: true, repos: await githubRepositories() }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

}
