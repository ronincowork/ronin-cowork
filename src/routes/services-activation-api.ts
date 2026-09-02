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
import { listServices, listServiceFailures } from '../sockets.js';
import {
  cancel, changeAddress, FlowError, poll, request, resend, isEntitled,
} from '../activation/flow.js';
import { publicState, readState, writeState } from '../activation/state.js';
import { runUpdater } from '../update-run.js';
import { buildKansou, sendKansou } from '../activation/kansou.js';

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

/**
 * IS THE ROSTER WHOLE? Not "is it non-empty".
 *
 * `listServices().length > 0` was the old test, and it answered a different question than
 * the one being asked. A services release that half-loads — one shared directory missing,
 * two services dead at import — leaves five of seven registered, and five is more than
 * zero, so the flow stamped `installed` over a broken install and said nothing. The
 * assembler is the only thing that knows a service was THERE and did not load; it records
 * that now (src/sockets.ts), and this reads it.
 *
 * Whole means: something loaded, and nothing that tried to load failed. A free build has
 * neither and is never in this flow — installing is only reached with an entitlement.
 */
function rosterVerdict(): { whole: boolean; loaded: string[]; failed: { name: string; reason: string }[] } {
  const loaded = listServices();
  const failed = listServiceFailures();
  return { whole: loaded.length > 0 && failed.length === 0, loaded, failed };
}

async function watchForServices(now = () => Date.now()): Promise<void> {
  const deadline = now() + INSTALL_TIMEOUT_MS;
  while (now() < deadline) {
    await new Promise((r) => setTimeout(r, INSTALL_POLL_MS));
    const { whole, failed } = rosterVerdict();
    if (whole) {
      await writeState({
        stage: 'installed', error_at_stage: null, error_message: null,
      }).catch(() => {});
      return;
    }
    // A SHORT ROSTER IS AN ANSWER, and a fast one. Discovery runs once per boot, so a
    // service that failed to load in THIS process will not recover in this process —
    // waiting out the ten minutes would only delay the same news. Name the casualties:
    // "Services installed" while gbrain is dead is the failure this whole flow exists
    // to prevent.
    if (failed.length > 0) {
      await writeState({
        stage: 'error', error_at_stage: 'installing',
        error_message: `Services installed but did not all start: ${failed.map((f) => f.name).join(', ')}. `
          + 'Your entitlement is safe — retrying needs no new email. The reason is in the '
          + 'journal (journalctl --user -u ronin.service).',
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

/**
 * RESUME AFTER THE RESTART THAT THE INSTALL ITSELF CAUSES.
 *
 * A successful services install ends by restarting ronin.service, which kills the very
 * process doing the watching. Nothing then wrote the outcome, so the record sat at
 * `installing` for good: the ten-minute timeout cannot fire in a process that no longer
 * exists, and the person was left on a spinner that outlived its install.
 *
 * So the new process picks the watch back up at boot. It is also the first process that
 * can see the truth — the roster it just assembled IS the install's result.
 */
export async function resumeInstallWatch(): Promise<void> {
  const s = await readState().catch(() => null);
  if (s?.stage !== 'installing') return;
  void watchForServices();
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
  app.post('/api/feedback', async (req, res) => {
    try {
      const packet = buildKansou((req.body as any)?.packet_id, (req.body as any)?.body);
      res.status(201).json(await sendKansou(packet));
    } catch (error) {
      const invalid = error instanceof Error && ['feedback is empty', 'invalid feedback packet id', 'reply email is invalid'].includes(error.message);
      const message = error instanceof Error && error.message === 'feedback is empty'
        ? 'Write something or choose one of the optional answers.'
        : error instanceof Error && error.message === 'reply email is invalid' ? 'Enter an email address or leave it blank.'
        : invalid ? 'The feedback packet is not valid.'
        : 'Your feedback was kept on this machine, but Ronin HQ could not be reached. Press Send to retry.';
      res.status(invalid ? 400 : 503).json({ error: message });
    }
  });
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

  /** One owner-provoked status check. Page load only reads local state; it never contacts HQ. */
  app.post('/api/services/activation/poll', async (_req, res) => {
    try {
      const state = await poll();
      // THE HANDOFF HAPPENS HERE, automatically. Reaching `verified` is exactly the moment
      // installation should begin; waiting for somebody to press a button would leave a
      // confirmed person looking at a finished flow that had not finished.
      if (state.stage === 'verified') await startInstall();
      res.json(publicState(await readState()));
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
    await startInstall();
    res.json(publicState(await readState()));
  });
}
