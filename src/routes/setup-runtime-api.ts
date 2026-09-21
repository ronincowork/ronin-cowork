import { homedir } from 'node:os';
import { dispatchInstall } from '../agent-install.js';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeProviderLogin,
  completeProviderLogin,
  ensureInstalledRoots,
  openProviderLogin,
  openProviderUpdate,
  setProviderOff,
  setupRuntimeAnswer,
  saveProviderSignIn,
  createMorningBriefSchedule,
  morningBriefSchedules,
  writeSetupPreferences,
  githubSetupAnswer,
  openGithubInstall,
  openGithubLogin,
  closeGithubLogin,
  removeGithubAuthentication,
  cloneGithubWorkspace,
  openGitSetupSession,
  closeGitSetupSession,
} from '../setup-runtime.js';
import { installedAnswer } from './installed-api.js';
import { measureAndRecordProviders, readProviderSummary, refreshProviderInventory } from '../provider-summary.js';
import type { ProviderSummary } from '../model-providers.js';
import { readUserIntro, writeUserIntro } from '../user-intro.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
const EMPTY_PROVIDER_SUMMARY: ProviderSummary = {
  measured_at: '', installed: [], signed_in: [], operational: [], activated_count: 0,
  paths: {}, versions: {}, model_lists: {}, model_inventory: {}, latest: {},
};
/** A record-only answer. Setup progress owns every automatic machine measurement. */
const answer = async (summary?: ProviderSummary) => {
  const section = await readSetupSection();
  const facts = summary ?? await readProviderSummary() ?? EMPTY_PROVIDER_SUMMARY;
  return setupRuntimeAnswer(section, facts, undefined, await installedAnswer());
};

export function registerSetupRuntime(app: express.Express): void {
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
      await ensureInstalledRoots();
      res.json(await answer());
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // The one probing door: the Setup Model providers surface and its Check again. Every
  // other reader takes GET /api/setup/runtime, which is the record.
  app.post('/api/setup/providers/measure', async (_req, res) => {
    try {
      await measureAndRecordProviders();
      const completion = await refreshProviderInventory();
      if (completion.state === 'failed' || !completion.summary) throw new Error('Provider inventory refresh failed.');
      res.json(await answer(completion.summary));
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
    }
  });

  // Refresh: the same measure, and then the one outbound ask — the newest release of each
  // installed CLI whose update line names an npm package. A press, never a timer; each
  // ask is an egress line. An ordinary measure keeps the last answer and its date.
  app.post('/api/setup/providers/refresh', async (_req, res) => {
    try {
      res.json(await answer(await measureAndRecordProviders(undefined, {}, {})));
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
      const result = await openProviderUpdate(String(req.params.provider));
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
        const result = await setProviderOff(String(req.params.provider), off);
        res.json({ ok: true, ...result, runtime: await answer(await measureAndRecordProviders()) });
      } catch (error) {
        res.status(400).json({ error: errMsg(error) });
      }
    });
  }

  app.post('/api/setup/providers/:provider/login', async (req, res) => {
    try {
      const result = await openProviderLogin(String(req.params.provider));
      const runtime = await answer();
      const provider = runtime.providers.find((row) => row.id === String(req.params.provider));
      res.json({ ok: true, opened: result.opened, attachment: provider?.attachment ?? null, runtime });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/done', async (req, res) => {
    try {
      if (req.body?.sign_in !== undefined) await saveProviderSignIn(String(req.params.provider), req.body.sign_in);
      const result = await completeProviderLogin(String(req.params.provider));
      res.json({ ok: true, closed: true, activation_recorded: true, activated_at: result.activated_at, attachment: null, runtime: await answer(await measureAndRecordProviders()) });
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/close', async (req, res) => {
    try {
      if (req.body?.sign_in !== undefined) await saveProviderSignIn(String(req.params.provider), req.body.sign_in);
      await closeProviderLogin(String(req.params.provider));
      // A sign-in closed without Done may still have left the CLI's credential file: measure.
      res.json({ ok: true, closed: true, activation_recorded: false, attachment: null, runtime: await answer(await measureAndRecordProviders()) });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.get('/api/setup/morning-brief/schedules', async (req, res) => {
    try {
      res.json(await morningBriefSchedules(String(req.query.team ?? '')));
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/morning-brief/schedules', async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const schedule = await createMorningBriefSchedule({
        team: body.team,
        request: body.request,
        when: body.when,
      });
      res.json({ ok: true, schedule });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.patch('/api/setup/preferences', async (req, res) => {
    try {
      const preferences = await writeSetupPreferences(req.body);
      res.json({ ok: true, preferences });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.get('/api/setup/github', async (_req, res) => {
    try { res.json(await githubSetupAnswer()); }
    catch (error) { res.status(500).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/github/login', async (_req, res) => {
    try { res.json({ ok: true, ...(await openGithubLogin()) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/github/install', async (_req, res) => {
    try { res.json({ ok: true, ...(await openGithubInstall()) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/github/close', async (_req, res) => {
    try { res.json({ ok: true, ...(await closeGithubLogin()) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/github/logout', async (_req, res) => {
    try { res.json({ ok: true, ...(await removeGithubAuthentication()) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/github/clone', async (req, res) => {
    try { res.json({ ok: true, workspace: await cloneGithubWorkspace(req.body?.repository) }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/git/open', async (_req, res) => {
    try { res.json({ ok: true, attachment: await openGitSetupSession() }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });

  app.post('/api/setup/git/close', async (_req, res) => {
    try { await closeGitSetupSession(); res.json({ ok: true }); }
    catch (error) { res.status(400).json({ error: errMsg(error) }); }
  });
}
