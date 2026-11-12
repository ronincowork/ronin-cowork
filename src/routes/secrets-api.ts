/** /api/secrets — the secret tool's door (src/secrets.ts, w385). No answer here carries a value. */
import type express from 'express';
import { homedir } from 'node:os';
import { SecretBadInput, answerSecret, askSecret, dropAsk, secretExpiries, secretFile, secretNames, secretsDir, setSecretExpiry } from '../secrets.js';
import fs from 'node:fs';

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const fail = (res: express.Response, e: unknown): void => {
  // A message names a secret, never its value; a home path reads as ~.
  const message = String((e as Error)?.message ?? e).replaceAll(homedir(), '~');
  res.status(e instanceof SecretBadInput ? 400 : 500).json({ error: message });
};

export function registerSecrets(app: express.Express): void {
  /** The names, their expiry dates (only those that have one), and the store they are in. */
  app.get('/api/secrets', async (_req, res) => {
    try {
      const names = await secretNames();
      const all = await secretExpiries();
      const expires = Object.fromEntries(names.filter((n) => all[n]).map((n) => [n, all[n]]));
      res.json({ dir: secretsDir(), names, expires });
    } catch (e) { fail(res, e); }
  });

  /** Set or clear a saved secret's expiry date ({ expires: "YYYY-MM-DD" | "" }); the value is not touched. */
  app.post('/api/secrets/:name/expires', async (req, res) => {
    try {
      const name = req.params.name;
      if (!fs.existsSync(secretFile(name))) throw new SecretBadInput(`No secret ${name} yet.`);
      res.json({ ok: true, name, expires: await setSecretExpiry(name, text(req.body?.expires)) });
    } catch (e) { fail(res, e); }
  });

  /** An Agent asks: held until the owner saves or cancels on its tile. */
  app.post('/api/secrets/ask', async (req, res) => {
    const session = text(req.body?.session);
    const name = text(req.body?.name);
    try {
      if (!session) throw new SecretBadInput('An ask names the asking Agent (session).');
      const pending = askSecret(session, name, text(req.body?.for));
      res.on('close', () => { if (!res.writableEnded) dropAsk(session, name); });
      res.json({ ok: true, answer: await pending, name });
    } catch (e) { fail(res, e); }
  });

  /** The owner's answer on a tile: save the value (with its optional expiry date), or cancel the Agent's ask. */
  app.post('/api/secrets/:name', async (req, res) => {
    try {
      const value = req.body?.cancel ? null : text(req.body?.value);
      const answer = await answerSecret(req.params.name, value, text(req.body?.session), text(req.body?.expires));
      res.json({ ok: true, answer, name: req.params.name });
    } catch (e) { fail(res, e); }
  });
}
