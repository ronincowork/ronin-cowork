import type express from 'express';
import { COOKIE, clearPassword, passwordAuthEnabled, setPassword } from '../auth.js';
import { authEnabled } from '../machine-settings.js';

export type IssuePasswordSession = (res: express.Response) => boolean;

const answer = () => ({ required: passwordAuthEnabled(), basic: authEnabled });

/** Browser password settings. These routes are registered behind the normal auth gate. */
export function registerPasswordSettings(app: express.Express, issueSession: IssuePasswordSession): void {
  app.get('/api/password', (_req, res) => res.json(answer()));

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
      // Changing the password rotates the session secret. Issue this authenticated browser
      // a replacement cookie while every other browser is correctly logged out.
      issueSession(res);
      res.json(answer());
    } catch {
      res.status(500).json({ error: 'Password was not saved.' });
    }
  });

  app.delete('/api/password', async (_req, res) => {
    try {
      await clearPassword();
      res.clearCookie(COOKIE, { path: '/' });
      res.json(answer());
    } catch {
      res.status(500).json({ error: 'Password protection was not changed.' });
    }
  });
}
