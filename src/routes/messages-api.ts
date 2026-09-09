import type { Express } from 'express';
import { attemptMessage, dismissMessage, dismissMessages, enqueueMessage, forceMessages, listQueuedMessages, MessageRefused } from '../message-queue.js';
import { isValidName } from '../tmux.js';

export function registerMessages(app: Express): void {
  app.get('/api/messages', async (_req, res) => res.json({ messages: await listQueuedMessages() }));
  app.post('/api/messages', async (req, res) => {
    const target = String(req.body?.target ?? '');
    const text = String(req.body?.text ?? '');
    if (!isValidName(target) || !text.trim()) return res.status(400).json({ error: 'A valid target and message are required.' });
    try {
      const item = await enqueueMessage(target, text, 'owner');
      const retained = await attemptMessage(item.id, 'safe');
      res.json({ ok: true, delivered: retained === null, message: retained });
    } catch (error) {
      if (error instanceof MessageRefused) return res.status(404).json({ error: error.message, code: 'target_missing' });
      throw error;
    }
  });
  // Bulk force takes the exact IDs the owner saw, like bulk dismissal: a message that
  // arrived after their snapshot is never forced by accident.
  app.post('/api/messages/force', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one displayed message.' });
    res.json({ ok: true, ...(await forceMessages(ids)) });
  });
  app.post('/api/messages/:id/retry', async (req, res) => {
    const retained = await attemptMessage(req.params.id, 'safe');
    res.json({ ok: true, delivered: retained === null, message: retained });
  });
  app.post('/api/messages/:id/force', async (req, res) => {
    const retained = await attemptMessage(req.params.id, 'force');
    res.json({ ok: true, delivered: retained === null, message: retained });
  });
  app.delete('/api/messages/:id', async (req, res) => res.json({ ok: await dismissMessage(req.params.id) }));
  app.delete('/api/messages', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one displayed message.' });
    const result = await dismissMessages(ids);
    res.json({ ok: true, ...result });
  });
}
