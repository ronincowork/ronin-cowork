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
    const email = str((req.body as { email?: unknown })?.email);
    if (!email) { res.status(400).json({ error: 'An email address is required.' }); return; }
    try {
      res.json(publicState(await request(email)));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/services/activation/poll', async (_req, res) => {
    try {
      const state = await poll();
      if (state.stage === 'verified') await startInstall();
      res.json(publicState(await readState()));
    } catch (e) { fail(res, e); }
  });

  app.post('/api/services/activation/resend', async (_req, res) => {
    try {
      res.json(publicState(await resend()));
    } catch (e) { fail(res, e); }
  });

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
