import type express from 'express';
import { loginAllowed, loginFailed, loginSucceeded, passwordAuthEnabled, verifyRecord } from '../auth.js';
import {
  addCredential,
  bumpCounter,
  canonicalCode,
  newChallenge,
  readPasskeys,
  removeCredential,
  rpIdFromHost,
  secureUrl,
  setRecovery,
  takeChallenge,
  verifyAssertion,
  verifyRegistration,
  type PasskeyCredential,
} from '../passkey.js';

export type IssueSession = (res: express.Response) => boolean;

const NO_RECORD = 'No password is set on this install, so a session cannot be issued — see bin/ronin-passwd.';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function rp(req: express.Request, res: express.Response): string | null {
  const r = rpIdFromHost(req.headers.host);
  if ('why' in r) {
    res.status(400).json({ error: `Passkeys unavailable: ${r.why}`, rpId: null });
    return null;
  }
  return r.rpId;
}

export function registerPasskeyLogin(app: express.Express, issueSession: IssueSession): void {
  app.get('/api/passkey/options', async (req, res) => {
    const r = rpIdFromHost(req.headers.host);
    const store = await readPasskeys();
    const registered = (store.credentials ?? []).length;
    if ('why' in r) return res.json({ available: false, why: r.why, rpId: null, registered, secureUrl: secureUrl() });
    if (!passwordAuthEnabled()) {
      return res.json({ available: false, why: NO_RECORD, rpId: r.rpId, registered, secureUrl: secureUrl() });
    }
    res.json({ available: registered > 0, rpId: r.rpId, registered, challenge: newChallenge(), secureUrl: secureUrl() });
  });

  app.post('/api/passkey/login', async (req, res) => {
    const rpId = rp(req, res);
    if (!rpId) return;
    const addr = req.socket.remoteAddress ?? '?';
    if (!loginAllowed(addr)) return res.status(429).json({ error: 'Too many attempts — wait a minute.' });

    const id = str(req.body?.id);
    const store = await readPasskeys();
    const cred = (store.credentials ?? []).find((c) => c.id === id);
    const verdict = cred
      ? verifyAssertion(
          cred,
          {
            clientDataJSON: str(req.body?.clientDataJSON),
            authenticatorData: str(req.body?.authenticatorData),
            signature: str(req.body?.signature),
          },
          { rpId, challengeSpent: takeChallenge },
        )
      : ({ ok: false, why: 'no such credential' } as const);

    if (!verdict.ok) {
      loginFailed(addr);
      console.warn(`[passkey] login refused from ${addr}: ${verdict.why}`);
      return res.status(401).json({ error: 'That passkey was not accepted.' });
    }
    loginSucceeded(addr);
    await bumpCounter(cred!.id, verdict.counter).catch((e) => console.warn('[passkey] counter not saved:', e));
    if (!issueSession(res)) return res.status(409).json({ error: NO_RECORD });
    res.json({ ok: true });
  });

  app.post('/api/passkey/recover', async (req, res) => {
    const addr = req.socket.remoteAddress ?? '?';
    if (!loginAllowed(addr)) return res.status(429).json({ error: 'Too many attempts — wait a minute.' });
    const store = await readPasskeys();
    const rec = store.recovery;
    const code = canonicalCode(str(req.body?.code));
    if (!rec || Date.now() > rec.expiresAt || !(await verifyRecord(rec, code))) {
      loginFailed(addr);
      return res.status(401).json({ error: 'That recovery code is not valid.' });
    }
    loginSucceeded(addr);
    await setRecovery(undefined); // spent, whatever happens next
    if (!issueSession(res)) return res.status(409).json({ error: NO_RECORD });
    res.json({ ok: true });
  });
}

export function registerPasskeyManage(app: express.Express): void {
  app.get('/api/passkey/list', async (req, res) => {
    const r = rpIdFromHost(req.headers.host);
    const store = await readPasskeys();
    res.json({
      rpId: 'why' in r ? null : r.rpId,
      why: 'why' in r ? r.why : undefined,
      recovery: store.recovery ? { expiresAt: store.recovery.expiresAt } : null,
      credentials: (store.credentials ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        rpId: c.rpId,
        createdAt: c.createdAt,
        usable: 'why' in r ? false : c.rpId === r.rpId,
      })),
    });
  });

  app.get('/api/passkey/register-options', async (req, res) => {
    const rpId = rp(req, res);
    if (!rpId) return;
    if (!passwordAuthEnabled()) return res.status(409).json({ error: NO_RECORD });
    const store = await readPasskeys();
    res.json({
      rpId,
      challenge: newChallenge(),
      excludeCredentials: (store.credentials ?? []).filter((c) => c.rpId === rpId).map((c) => c.id),
    });
  });

  app.post('/api/passkey/register', async (req, res) => {
    const rpId = rp(req, res);
    if (!rpId) return;
    const id = str(req.body?.id);
    const publicKey = str(req.body?.publicKey);
    const alg = Number(req.body?.alg);
    if (!id || !publicKey) {
      return res.status(400).json({ error: 'The browser did not return a usable public key for this authenticator.' });
    }
    if (![-7, -257, -8].includes(alg)) return res.status(400).json({ error: `Unsupported key algorithm (${alg}).` });
    const v = verifyRegistration(str(req.body?.clientDataJSON), { rpId, challengeSpent: takeChallenge });
    if (!v.ok) return res.status(400).json({ error: `Registration refused: ${v.why}` });

    const cred: PasskeyCredential = {
      id,
      publicKey,
      alg,
      rpId,
      counter: 0,
      label: str(req.body?.label).slice(0, 60) || 'passkey',
      createdAt: new Date().toISOString(),
    };
    await addCredential(cred);
    res.json({ ok: true, id: cred.id, label: cred.label });
  });

  app.post('/api/passkey/remove', async (req, res) => {
    const id = str(req.body?.id);
    if (!id) return res.status(400).json({ error: 'No credential id.' });
    const store = await removeCredential(id);
    res.json({ ok: true, remaining: store.credentials.length });
  });
}
