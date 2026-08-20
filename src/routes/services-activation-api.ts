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
import { listReceipts, sendDuePackets } from '../activation/tomodachi.js';
import {
  cancel, changeAddress, FlowError, poll, request, resend, isEntitled,
} from '../activation/flow.js';
import { publicState, readState, writeState } from '../activation/state.js';
import { runUpdater } from '../update-run.js';

/** Begin installation, once, without making the poll wait for it. */
async function startInstall(): Promise<void> {
  try {
    await writeState({ stage: 'installing', error_at_stage: null, error_message: null });
    await runUpdater('services');
  } catch {
    await writeState({
      stage: 'error', error_at_stage: 'installing',
      error_message: 'the installer did not start — you can try again without a new email',
    }).catch(() => {});
  }
}

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
      // The receipts are the proof that what left was accepted. Showing them beside the
      // egress record is what makes "is sending healthy?" answerable without asking us.
      receipts: await listReceipts(10),
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
      const state = await poll();
      // THE HANDOFF HAPPENS HERE, automatically. Reaching `verified` is exactly the moment
      // installation should begin; waiting for somebody to press a button would leave a
      // confirmed person looking at a finished flow that had not finished.
      if (state.stage === 'verified') void startInstall();
      res.json(publicState(state));
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
   * INSTALL. Actually starts the updater that already exists.
   *
   * This used to return a description of the handoff — a JSON object naming the route a
   * caller could go and press. That is not an install, and nothing pressed it, so a
   * confirmed person sat at "Email confirmed" forever. It now runs the same updater the ⚙
   * gear runs, through the same implementation, and records the stage before answering.
   *
   * The updater verifies the checksum and the Cowork/Services contract. The entitlement
   * authorizes the fetch and never certifies the artifact.
   */
  /**
   * SEND NOW. The scheduler sweeps hourly; this is for a person who wants to see it work.
   * Idempotent like every send, so pressing it twice costs one wasted request at most.
   */
  app.post('/api/services/tomodachi/send', async (_req, res) => {
    res.json(await sendDuePackets());
  });

  app.post('/api/services/install', async (_req, res) => {
    if (!(await isEntitled())) {
      res.status(409).json({ error: 'There is no entitlement on this machine yet.' });
      return;
    }
    await writeState({ stage: 'installing', error_at_stage: null, error_message: null });
    try {
      const started = await runUpdater('services');
      res.json({ ok: true, started: true, via: started.via });
    } catch (e) {
      // The entitlement is kept. An install that failed is retried without another email,
      // which is the whole reason the two are separate stages.
      await writeState({
        stage: 'error', error_at_stage: 'installing',
        error_message: 'the installer did not start — you can try again without a new email',
      });
      res.status(500).json({ error: 'the installer did not start' });
    }
  });
}
