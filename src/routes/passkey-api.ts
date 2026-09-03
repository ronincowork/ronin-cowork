/**
 * PASSKEY API — the two ceremonies, on opposite sides of the gate.
 *
 * The split is the whole security story of this file, so it is the first thing here:
 *
 *   LOGIN  (`registerPasskeyLogin`)  runs AHEAD of the gate, beside /api/login. It must,
 *          because a person who is not logged in is the only person who needs it. It
 *          therefore gets the same treatment /api/login gets — the rate limiter, and a
 *          refusal that says nothing about whether a credential exists.
 *   MANAGE (`registerPasskeyManage`) runs BEHIND the gate, with everything else. You
 *          register a new device by first proving you are already the owner (password,
 *          another passkey, or a recovery code). There is no unauthenticated
 *          registration route and there must never be one: that would be a public
 *          "become the owner" button, which is a worse door than no door.
 *
 * `/api/passkey/options` is deliberately readable before login and deliberately tells
 * you nothing: a challenge, the RP ID, and whether ANY credential is registered. That
 * last bit is what lets the login page show or hide the button honestly. It does not
 * enumerate credential IDs — with a discoverable (resident) passkey the browser finds
 * the right key itself, so there is no reason to hand a stranger a list of the owner's
 * devices.
 *
 * WHY THE RP ID IS IN EVERY RESPONSE. WebAuthn fails in ways a browser reports only to
 * its own console, and the single likeliest failure here is real and expected: the owner
 * is on the plain-HTTP tailnet-IP address instead of the tailnet HTTPS one. The endpoint
 * answers with either an rpId or a plain-English `why`, so the page can say "passkeys
 * need the HTTPS address" instead of presenting a button that quietly does nothing.
 */
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

/** How index.ts mints the session cookie — passed in rather than re-implemented, so
 *  there is exactly one place that decides what a Ronin session is. FALSE means there
 *  was no password record to sign with; see NO_RECORD below. */
export type IssueSession = (res: express.Response) => boolean;

/** `ronin-passwd clear` removes the signing secret but leaves registered passkeys in
 *  machine_settings.json, so every door here can find itself with a valid credential and nothing
 *  to mint a session from. It is a real state and it gets a real sentence. */
const NO_RECORD = 'No password is set on this install, so a session cannot be issued — see bin/ronin-passwd.';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The RP ID for this request, or a 400 explaining why there isn't one. Every route
 *  below starts here, because none of them mean anything without it. */
function rp(req: express.Request, res: express.Response): string | null {
  const r = rpIdFromHost(req.headers.host);
  if ('why' in r) {
    res.status(400).json({ error: `Passkeys unavailable: ${r.why}`, rpId: null });
    return null;
  }
  return r.rpId;
}

/* ------------------------------------------------------------- ahead of the gate */

export function registerPasskeyLogin(app: express.Express, issueSession: IssueSession): void {
  /** What the login page needs to decide what to show. Safe for a stranger to read. */
  app.get('/api/passkey/options', async (req, res) => {
    const r = rpIdFromHost(req.headers.host);
    const store = await readPasskeys();
    const registered = (store.credentials ?? []).length;
    // `secureUrl` is the actionable half: when passkeys are off because this request
    // came in over the IP, the page can name the address that would work.
    if ('why' in r) return res.json({ available: false, why: r.why, rpId: null, registered, secureUrl: secureUrl() });
    // No password record means no secret to sign a session with, so the button would
    // verify a passkey and then fail at the last step. Do not offer it.
    if (!passwordAuthEnabled()) {
      return res.json({ available: false, why: NO_RECORD, rpId: r.rpId, registered, secureUrl: secureUrl() });
    }
    res.json({ available: registered > 0, rpId: r.rpId, registered, challenge: newChallenge(), secureUrl: secureUrl() });
  });

  /**
   * Finish a passkey login.
   *
   * The refusal is ONE message for every failure — unknown credential, bad signature,
   * spent challenge. The `why` from verifyAssertion is deliberately not returned: it
   * distinguishes "no such credential" from "wrong signature", which is exactly the
   * oracle a stranger would use to learn which of the owner's devices exist.
   */
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
      // The real reason goes to the operator's log, where the owner can read it and a
      // stranger cannot. This is the one asymmetry that makes a vague 401 honest.
      console.warn(`[passkey] login refused from ${addr}: ${verdict.why}`);
      return res.status(401).json({ error: 'That passkey was not accepted.' });
    }
    loginSucceeded(addr);
    // Bank the clone counter, but never let a failed WRITE undo a login that verified.
    await bumpCounter(cred!.id, verdict.counter).catch((e) => console.warn('[passkey] counter not saved:', e));
    if (!issueSession(res)) return res.status(409).json({ error: NO_RECORD });
    res.json({ ok: true });
  });

  /**
   * The recovery code — `bin/ronin-recovery` mints it, this spends it.
   *
   * ONE USE, THEN GONE, whether or not it worked out afterwards: a code that survives
   * its own use is a second password with none of the ceremony. It is consumed before
   * the session is issued, so even a crash between the two costs a re-mint rather than
   * leaving a live code behind.
   */
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

/* ------------------------------------------------------------- behind the gate */

export function registerPasskeyManage(app: express.Express): void {
  /** List what is registered. Behind the gate, so naming devices is fine here. */
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
        // A credential made under another name will not be offered by the browser here;
        // saying so in the list is cheaper than the owner wondering why it never appears.
        usable: 'why' in r ? false : c.rpId === r.rpId,
      })),
    });
  });

  /** A challenge for a REGISTRATION, plus the IDs to exclude so the same device cannot
   *  silently register itself twice. Behind the gate, so the list is not a leak. */
  app.get('/api/passkey/register-options', async (req, res) => {
    const rpId = rp(req, res);
    if (!rpId) return;
    // Refuse UP FRONT rather than let the owner complete a Face ID ceremony for a key
    // that could never issue a session (src/auth.ts: the secret lives with the password).
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
      // getPublicKey() returning null is the realistic cause: an authenticator using an
      // algorithm this browser cannot decode. Naming it beats "bad request".
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
