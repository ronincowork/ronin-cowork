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
import { registrationAnswer, submitRegistration, updateCommunication } from '../activation/registration.js';
import { deleteRegistration } from '../activation/registration.js';

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

const INSTALL_TIMEOUT_MS = 10 * 60_000;
const INSTALL_POLL_MS = 5_000;

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
    if (failed.length > 0) {
      await writeState({
        stage: 'error', error_at_stage: 'installing',
        error_message: `Services installed but did not all start: ${failed.map((f) => f.name).join(', ')}. `
          + 'Your entitlement is safe — retrying needs no new email. The reason is in the '
          + 'journal (journalctl --user -u ronin.service).',
      }).catch(() => {});
      return;
    }
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
  res.status(503).json({ error: 'Ronin HQ could not be reached — this will retry' });
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export function registerServicesActivation(app: express.Express): void {
  app.get('/api/setup/registration', async (_req, res) => {
    res.json(await registrationAnswer());
  });

  app.post('/api/setup/registration', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    try {
      const anonymous = body.identity_mode === 'anonymous';
      const saved = await submitRegistration(body);
      if (anonymous) {
        const message = [
          `Anonymous Ronin registration${saved.purpose ? `: ${saved.purpose}` : ''}`,
          saved.kind && `Kind: ${saved.kind}`,
          saved.user_type && `User type: ${saved.user_type}`,
          saved.goals.length && `Why Ronin: ${saved.goals.join(', ')}`,
          saved.intended_use.length && `Intended use: ${saved.intended_use.join(', ')}`,
          saved.theme_preference && `Theme: ${saved.theme_preference}`,
          saved.own_words && `In their words: ${saved.own_words}`,
        ].filter(Boolean).join('\n');
        await sendKansou(buildKansou(saved.anonymous_packet_id, {
          message, feedback_kind: ['other'], using_ronin_for: saved.intended_use,
        })).catch(() => {}); // the packet is durable before immediate delivery is attempted
        res.json(await registrationAnswer());
        return;
      }
      const current = await readState();
      if (!await isEntitled() && !['awaiting_email', 'requesting', 'verified', 'installing', 'installed'].includes(current.stage)) {
        await request(str(body.email));
      }
      res.json(await registrationAnswer());
    } catch (error) {
      if (error instanceof FlowError) { fail(res, error); return; }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Registration was not saved.' });
    }
  });

  app.patch('/api/setup/registration/communication', async (req, res) => {
    try {
      await updateCommunication((req.body ?? {}) as Record<string, unknown>);
      res.json(await registrationAnswer());
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Preferences were not saved.' });
    }
  });

  app.post('/api/setup/registration/recovery', async (req, res) => {
    const action = str((req.body as { action?: unknown })?.action);
    try {
      if (action === 'check') await poll();
      else if (action === 'resend') await resend();
      else if (action === 'change_address') {
        const email = str((req.body as { email?: unknown })?.email);
        if (!email) { res.status(400).json({ error: 'An email address is required.' }); return; }
        await submitRegistration({ ...(req.body ?? {}), email });
        await changeAddress(email);
      } else { res.status(400).json({ error: 'Recovery action must be check, resend, or change_address.' }); return; }
      res.json(await registrationAnswer());
    } catch (error) { fail(res, error); }
  });

  app.delete('/api/setup/registration', async (_req, res) => {
    try {
      const activation = await readState();
      if (!['verified', 'installed'].includes(activation.stage)) await cancel().catch(() => {});
      await deleteRegistration();
      res.json(await registrationAnswer());
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Registration was not deleted.' });
    }
  });

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
  app.get('/api/services/activation', async (_req, res) => {
    const state = await readState();
    res.json({
      ...publicState(state),
      entitled: await isEntitled(),
      egress: await readEgress(20),
      receipts: await listReceipts(10),
    });
  });

  app.post('/api/services/activation', async (req, res) => {
    void req;
    res.status(410).json({ error: 'Services activation now begins with registration at /api/setup/registration.' });
  });

  app.post('/api/services/activation/poll', async (_req, res) => {
    try {
      const state = await poll();
      if (state.stage === 'verified') await startInstall();
      res.json(publicState(await readState()));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/services/activation/resend', async (_req, res) => {
    res.status(410).json({ error: 'Registration recovery moved to /api/setup/registration/recovery.' });
  });

  app.delete('/api/services/activation', async (_req, res) => {
    res.status(410).json({ error: 'Registration deletion moved to /api/setup/registration.' });
  });

  app.post('/api/services/activation/address', async (req, res) => {
    void req;
    res.status(410).json({ error: 'Registration recovery moved to /api/setup/registration/recovery.' });
  });

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
