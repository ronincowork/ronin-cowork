import { homedir } from 'node:os';
import type express from 'express';
import { readSetupSection } from '../machine-state.js';
import {
  closeProviderLogin,
  completeProviderLogin,
  ensureInstalledRoots,
  openProviderLogin,
  setupRuntimeAnswer,
} from '../setup-runtime.js';

const errMsg = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');
const answer = async () => setupRuntimeAnswer(await readSetupSection());

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
      res.json({ ok: true, ...result, runtime: await answer() });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/done', async (req, res) => {
    try {
      const result = await completeProviderLogin(String(req.params.provider));
      res.json({ ok: true, ...result, runtime: await answer() });
    } catch (error) {
      res.status(409).json({ error: errMsg(error) });
    }
  });

  app.post('/api/setup/providers/:provider/close', async (req, res) => {
    try {
      const result = await closeProviderLogin(String(req.params.provider));
      res.json({ ok: true, ...result, runtime: await answer() });
    } catch (error) {
      res.status(400).json({ error: errMsg(error) });
    }
  });
}

