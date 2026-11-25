import { homedir } from 'node:os';
import type express from 'express';
import { leftSetupStep, readSetupProgress } from '../setup-progress.js';

const message = (error: unknown) => String((error as Error)?.message ?? error).replaceAll(homedir(), '~');

/** GET /api/setup/progress: Setup's ticks, from the facts (setup-progress.ts). Read-only: a press is a real setting, made by its own route. */
export function registerSetupProgress(app: express.Express): void {
  app.get('/api/setup/progress', async (_req, res) => {
    try { res.json(await readSetupProgress()); }
    catch (error) { res.status(500).json({ error: message(error) }); }
  });
  /** POST /api/setup/left {step, to}: the person left a step; with its changed switch on, Irasshai is told and it goes off (w984). Only ever her. */
  app.post('/api/setup/left', async (req, res) => {
    try { res.json({ ok: true, told: await leftSetupStep(String(req.body?.step || ''), String(req.body?.to || '')) }); }
    catch (error) { res.status(400).json({ error: message(error) }); }
  });
}
