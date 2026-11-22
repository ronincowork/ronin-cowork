import { homedir } from 'node:os';
import type express from 'express';
import { readSetupProgress } from '../setup-progress.js';

const message = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');

/** GET /api/setup/progress: Setup's ticks, from the facts (setup-progress.ts). Read-only: a press is a real setting, made by its own route. */
export function registerSetupProgress(app: express.Express): void {
  app.get('/api/setup/progress', async (_req, res) => {
    try { res.json(await readSetupProgress()); }
    catch (error) { res.status(500).json({ error: message(error) }); }
  });
}
