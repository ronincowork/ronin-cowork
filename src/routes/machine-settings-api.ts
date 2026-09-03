import type express from 'express';
import { readMachineSettings, writeMachineSettings } from '../machine-settings.js';

const messageOf = (error: unknown): string => String((error as Error)?.message ?? error);

export function registerMachineSettings(app: express.Express): void {
  app.get('/api/machine-settings', async (_req, res) => {
    try {
      res.json(await readMachineSettings());
    } catch (error) {
      res.status(500).json({ error: messageOf(error) });
    }
  });

  app.patch('/api/machine-settings', async (req, res) => {
    const family = String(req.body?.family ?? '');
    try {
      res.json(await writeMachineSettings(
        family,
        (req.body?.value ?? {}) as Record<string, unknown>,
      ));
    } catch (error) {
      const message = messageOf(error);
      res.status(message.startsWith('no machine-settings family') ? 404 : 500)
        .json({ error: message });
    }
  });
}
