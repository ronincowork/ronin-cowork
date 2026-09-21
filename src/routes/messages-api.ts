import type { Express } from 'express';
import { dismissMessage, dismissMessages, enqueueMessage, listQueuedMessages } from '../message-queue.js';
import { isValidName } from '../tmux.js';

export function registerMessages(app: Express): void {
  app.get('/api/messages', async (_req, res) => res.json({ messages: await listQueuedMessages() }));
  app.post('/api/messages', async (req, res) => {
    const target = String(req.body?.target ?? '');
    const text = String(req.body?.text ?? '');
    if (!isValidName(target) || !text.trim()) return res.status(400).json({ error: 'A valid target and message are required.' });
    const item = await enqueueMessage(target, text, 'owner');
    res.json({ ok: true, queued: true, message: item });
  });
  app.delete('/api/messages/:id', async (req, res) => res.json({ ok: await dismissMessage(req.params.id) }));
  app.delete('/api/messages', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one displayed message.' });
    const result = await dismissMessages(ids);
    res.json({ ok: true, ...result });
  });
}
