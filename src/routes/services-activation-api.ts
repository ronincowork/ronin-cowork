/* Feedback to Ronin HQ. The Ronin Services install flow (a Services key emailed by
 * Ronin HQ, the download, its stages) is retired: Services ships with Cowork (owner, 2026-11-26,
 * KAN-914; docs/architecture/installations.md). */
import type express from 'express';
import { buildKansou, sendKansou } from '../activation/kansou.js';

export function registerServicesActivation(app: express.Express): void {
  app.post('/api/feedback', async (req, res) => {
    try {
      const packet = buildKansou((req.body as any)?.packet_id, (req.body as any)?.body);
      res.status(201).json(await sendKansou(packet));
    } catch (error) {
      const invalid = error instanceof Error && ['feedback is empty', 'invalid feedback packet id', 'reply email is invalid'].includes(error.message);
      const message = error instanceof Error && error.message === 'feedback is empty'
        ? 'Write something or choose one of the optional answers.'
        : error instanceof Error && error.message === 'reply email is invalid' ? 'Enter an email address or leave it blank.'
        : invalid ? 'The feedback packet is not valid.'
        : 'Your feedback was kept on this machine, but Ronin HQ could not be reached. Press Send to retry.';
      res.status(invalid ? 400 : 503).json({ error: message });
    }
  });
}
