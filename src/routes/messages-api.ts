import type { Express } from 'express';
import { dismissMessages, enqueueMessage } from '../message-queue.js';
import { isValidName } from '../tmux.js';
import { person } from '../office-people.js';
import { readInbox, readSeat } from '../seats.js';

export function registerMessages(app: Express): void {
  app.post('/api/messages', async (req, res) => {
    const target = String(req.body?.target ?? '');
    const text = String(req.body?.text ?? '');
    if (!isValidName(target) || !text.trim()) return res.status(400).json({ error: 'A valid target and message are required.' });
    // The tile's Message box says it is the person typing; every other caller is Ronin on their behalf.
    // In a hosted office the signed-in person is recorded with it (src/office-people.ts).
    const source = req.body?.typed === true ? 'typed' : 'owner';
    const item = await enqueueMessage(target, text, source, undefined, person(req));
    res.json({ ok: true, queued: true, message: item });
  });
  // A seat's inbox since its last look (src/seats.ts). On a daimyo's token `by` is the seat's own name.
  app.post('/api/seats/inbox', async (req, res) => {
    const name = String(req.body?.by ?? '').trim();
    if (!(await readSeat(name))) return res.status(404).json({ error: `${name || 'This caller'} is not a seat on this office.` });
    res.json({ ok: true, seat: name, entries: await readInbox(name) });
  });
  app.delete('/api/messages', async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one displayed message.' });
    const result = await dismissMessages(ids);
    res.json({ ok: true, ...result });
  });
}
