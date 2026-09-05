import { homedir } from 'node:os';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeProviderLogin,
  completeProviderLogin,
  ensureInstalledRoots,
  openProviderLogin,
  setupRuntimeAnswer,
  createMorningBriefSchedule,
  morningBriefSchedules,
} from '../setup-runtime.js';
import { installedAnswer } from './installed-api.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
const answer = async () => setupRuntimeAnswer(await readSetupSection(), undefined, undefined, await installedAnswer());

export function registerSetupRuntime(app: express.Express): void {
  app.get('/api/setup/runtime', async (_req, res) => {
    try {
      await ensureInstalledRoots();
      res.json(await answer());
    } catch (error) {
      res.status(500).json({ error: errMsg(error) });
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
      res.json({ ok: true, closed: true, activation_recorded: true, activated_at: result.activated_at, attachment: null, runtime: await answer() });
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/close', async (req, res) => {
    try {
      await closeProviderLogin(String(req.params.provider));
      res.json({ ok: true, closed: true, activation_recorded: false, attachment: null, runtime: await answer() });
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
        to: body.to,
        active: body.active,
      });
      res.json({ ok: true, schedule });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });
}
