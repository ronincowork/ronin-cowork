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
import { listServices } from '../sockets.js';
import {
  cancel, changeAddress, FlowError, poll, request, resend, isEntitled,
} from '../activation/flow.js';
import { publicState, readState, writeState } from '../activation/state.js';
import { runUpdater } from '../update-run.js';

/**
 * Begin installation, then WATCH FOR THE OUTCOME.
 *
 * runUpdater resolves when the updater has STARTED, not when it has worked. Reporting
 * `installing` on that and never revisiting it meant a failed install left a person on
 * "Installing Services" forever, with no error and nothing to press. Measured on the E2E
 * walk: the updater exited 1 within a second and the stage still said installing minutes
 * later. USERS_JOURNEY asks for the opposite in as many words — a person watching an
 * install is fine, a person guessing at a spinner is not.
 *
 * `installed` is now proven by DISCOVERY — Services actually present — rather than asserted
 * because a process was launched. That is the same standard the setup card already claimed:
 * "proven by the service roster, not merely by a token."
 *
 * On timeout the entitlement is kept and the stage becomes an error that says a retry needs
 * no new email, which is the documented recovery rule rather than a new one.
 */
async function startInstall(): Promise<void> {
  try {
    await writeState({ stage: 'installing', error_at_stage: null, error_message: null });
    await runUpdater('services');
  } catch {
    await writeState({
      stage: 'error', error_at_stage: 'installing',
      error_message: 'the installer did not start — you can try again without a new email',
    }).catch(() => {});
    return;
  }
  void watchForServices();
}

/** How long an install may take before we stop calling it "installing". */
const INSTALL_TIMEOUT_MS = 10 * 60_000;
const INSTALL_POLL_MS = 5_000;

async function watchForServices(now = () => Date.now()): Promise<void> {
  const deadline = now() + INSTALL_TIMEOUT_MS;
  while (now() < deadline) {
    await new Promise((r) => setTimeout(r, INSTALL_POLL_MS));
    // The roster is the authority. A service is installed when it is there.
    if (listServices().length > 0) {
      await writeState({
        stage: 'installed', error_at_stage: null, error_message: null,
      }).catch(() => {});
      return;
    }
    // Someone may have cancelled or restarted us into another stage meanwhile; do not
    // stamp over whatever they did.
    const s = await readState();
    if (s.stage !== 'installing') return;
  }
  await writeState({
    stage: 'error', error_at_stage: 'installing',
    error_message: 'Services did not finish installing. Your entitlement is safe — '
      + 'retrying needs no new email. The updater log is in the journal '
      + '(journalctl --user -u "ronin-update-*").',
  }).catch(() => {});
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
