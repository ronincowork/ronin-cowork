import { homedir } from 'node:os';
import type express from 'express';
import { answerSetupProgress, readSetupProgress, startSetupProgressScan } from '../setup-progress.js';

const message = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');

export function registerSetupProgress(app: express.Express): void {
  app.get('/api/setup/progress', async (_req, res) => {
    try { res.json(await readSetupProgress({ automatic: true })); }
    catch (error) { res.status(500).json({ error: message(error) }); }
  });
  app.post('/api/setup/progress/scan', async (_req, res) => {
    try { void startSetupProgressScan(); res.json(await readSetupProgress()); }
    catch (error) { res.status(500).json({ error: message(error) }); }
  });
  app.patch('/api/setup/progress/:step', async (req, res) => {
    try { res.json(await answerSetupProgress(String(req.params.step), req.body?.answer)); }
    catch (error) { res.status(400).json({ error: message(error) }); }
  });
}
