import type express from 'express';
import { COOKIE, clearPassword, passwordAuthEnabled, setPassword } from '../auth.js';
import { authEnabled } from '../machine-settings.js';
import { readMachineSection, writeMachineSection } from '../machine-state.js';

export type IssuePasswordSession = (res: express.Response) => boolean;

/** `no_password`: the owner's "Tailscale only, no password" setting (machine settings' machine.no_password, KAN-768). */
const answer = async () => ({ required: passwordAuthEnabled(), basic: authEnabled, no_password: (await readMachineSection()).no_password === true });

/** Browser password settings. These routes are registered behind the normal auth gate. */
export function registerPasswordSettings(app: express.Express, issueSession: IssuePasswordSession): void {
  app.get('/api/password', async (_req, res) => res.json(await answer()));
  // "Tailscale only, no password" (or, off Tailscale, "None"): a setting, on or off.
  app.put('/api/password/none', async (req, res) => {
    try { await writeMachineSection({ no_password: req.body?.on === true }); res.json(await answer()); }
    catch { res.status(500).json({ error: 'The setting was not saved.' }); }
  });

  app.put('/api/password', async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirm = typeof req.body?.confirm === 'string' ? req.body.confirm : '';
    if (password.length < 8) {
      res.status(400).json({ error: 'Use at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      res.status(400).json({ error: 'The two passwords do not match.' });
      return;
    }
    try {
      await setPassword(password);
      await writeMachineSection({ no_password: false }); // a password set is no longer "no password"
      // Changing the password rotates the session secret. Issue this authenticated browser
      // a replacement cookie while every other browser is correctly logged out.
      issueSession(res);
      res.json(await answer());
    } catch {
      res.status(500).json({ error: 'Password was not saved.' });
    }
  });

  app.delete('/api/password', async (_req, res) => {
    try {
      await clearPassword();
      res.clearCookie(COOKIE, { path: '/' });
      res.json(await answer());
    } catch {
      res.status(500).json({ error: 'Password protection was not changed.' });
    }
  });
}
