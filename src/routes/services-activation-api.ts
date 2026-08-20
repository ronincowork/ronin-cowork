/**
 * THE LOCAL BROWSER API — local-only, and no secret crosses it.
 *
 * The browser never receives the claim secret or the entitlement token, and never calls
 * SHIWAKE directly. Every route here is served by the operator the person is already
 * looking at, so the credential stays on the machine that owns it.
 *
 * `POST /api/services/install` is a RECOVERY verb. Installation normally happens by itself
 * once an entitlement arrives; the button exists for the case where it failed and someone
 * wants to try again without another email.
 */
import type express from 'express';
import { readEgress } from '../activation/egress.js';
import {
  cancel, changeAddress, FlowError, poll, request, resend, isEntitled,
} from '../activation/flow.js';
import { publicState, readState } from '../activation/state.js';

function fail(res: express.Response, e: unknown): void {
  if (e instanceof FlowError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  // Never echo an internal message to the browser; it can carry a hostname or a path.
  res.status(503).json({ error: 'Ronin HQ could not be reached — this will retry' });
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function registerServicesActivation(app: express.Express): void {
  /** The card's whole state, including the egress record the owner is entitled to see. */
  app.get('/api/services/activation', async (_req, res) => {
    const state = await readState();
    res.json({
      ...publicState(state),
      entitled: await isEntitled(),
      egress: await readEgress(20),
    });
  });

  /**
   * THE CONSENT ACTION. Activation is an immediate, disclosed account action — it does not
   * enter a weekly review outbox, because a person who pressed "Send confirmation email"
   * and got silence for a week would reasonably conclude it was broken.
   */
  app.post('/api/services/activation', async (req, res) => {
    const email = str((req.body as { email?: unknown })?.email);
    if (!email) { res.status(400).json({ error: 'An email address is required.' }); return; }
    try {
      res.json(publicState(await request(email)));
    } catch (e) { fail(res, e); }
  });

  /** Resume. Called on page open and on the operator's own brief poll — never a daemon. */
  app.post('/api/services/activation/poll', async (_req, res) => {
    try {
      res.json(publicState(await poll()));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/services/activation/resend', async (_req, res) => {
    try {
      res.json(publicState(await resend()));
    } catch (e) { fail(res, e); }
  });

  /** Pending request only. A verified activation is an entitlement and is not cancellable. */
  app.delete('/api/services/activation', async (_req, res) => {
    try {
      res.json(publicState(await cancel()));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/services/activation/address', async (req, res) => {
    const email = str((req.body as { email?: unknown })?.email);
    if (!email) { res.status(400).json({ error: 'An email address is required.' }); return; }
    try {
      res.json(publicState(await changeAddress(email)));
    } catch (e) { fail(res, e); }
  });

  /**
   * RECOVERY. Hands off to the updater that already exists — `POST /api/update/run
   * { package: 'services' }` — rather than reimplementing installation here. The updater
   * still verifies the checksum and the Cowork/Services contract; an entitlement authorizes
   * the fetch and never certifies the artifact.
   */
  app.post('/api/services/install', async (_req, res) => {
    if (!(await isEntitled())) {
      res.status(409).json({ error: 'There is no entitlement on this machine yet.' });
      return;
    }
    res.json({
      ok: true,
      handoff: { route: '/api/update/run', body: { package: 'services' } },
      note: 'the updater verifies checksum and contract; the entitlement only authorises the fetch',
    });
  });
}
