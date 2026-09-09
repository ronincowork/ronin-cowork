import { homedir } from 'node:os';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeProviderLogin,
  completeProviderLogin,
  ensureInstalledRoots,
  openProviderLogin,
  openProviderUpdate,
  setupRuntimeAnswer,
  createMorningBriefSchedule,
  morningBriefSchedules,
  writeSetupPreferences,
} from '../setup-runtime.js';
import { installedAnswer } from './installed-api.js';
import { measureAndRecordProviders, readProviderSummary } from '../provider-summary.js';
import type { ProviderSummary } from '../model-providers.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
/** The answer from the Campaign's summary; a machine never measured is measured once, not guessed. */
const answer = async (summary?: ProviderSummary) => {
  const section = await readSetupSection();
  const facts = summary ?? await readProviderSummary() ?? await measureAndRecordProviders(section);
  return setupRuntimeAnswer(section, facts, undefined, await installedAnswer());
};

export function registerSetupRuntime(app: express.Express): void {
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
      res.json(await answer(await measureAndRecordProviders()));
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
      const result = await completeProviderLogin(String(req.params.provider));
      res.json({ ok: true, closed: true, activation_recorded: true, activated_at: result.activated_at, attachment: null, runtime: await answer(await measureAndRecordProviders()) });
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/close', async (req, res) => {
    try {
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
}
