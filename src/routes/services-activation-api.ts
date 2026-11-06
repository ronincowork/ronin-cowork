import type express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readEgress } from '../activation/egress.js';
import { listReceipts } from '../activation/tomodachi.js';
import { listServices, listServiceFailures } from '../sockets.js';
import { isEntitled } from '../activation/secrets.js';
import { storeDir } from '../resources.js';
import { publicState, readState, writeState } from '../activation/state.js';
import { runUpdater, type RunResult } from '../update-run.js';
import { buildKansou, sendKansou } from '../activation/kansou.js';
import { registrationAnswer, submitRegistration } from '../activation/registration.js';
import { deleteRegistration } from '../activation/registration.js';
import { installedAnswer } from './installed-api.js';
import { broadcastEvent } from '../ws/events.js';

async function activationAnswer(): Promise<Record<string, unknown>> {
  return {
    ...publicState(await readState()),
    entitled: await isEntitled(),
    egress: await readEgress(20),
    receipts: await listReceipts(10),
  };
}

// What the Services setup surface reads — its registration, what is installed, and the
// activation — and what /events sends as {t:'services-setup', services} at each step.
export async function servicesSetupAnswer(): Promise<Record<string, unknown>> {
  const [registration, installed, activation] = await Promise.all([registrationAnswer(), installedAnswer(), activationAnswer()]);
  return { registration, installed, activation };
}

export const pushServicesSetup = async (): Promise<void> => {
  broadcastEvent({ t: 'services-setup', services: await servicesSetupAnswer() });
};

// Registration, activation, install, a Campaign's installation switch and machine settings
// each change the answer: after a successful write to one, it is pushed.
export const servicesSetupWrites: express.RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) void pushServicesSetup(); });
  next();
};

/** The Services install's own report: the updater's output and, once it ends, its exit code. */
const installRun = (): RunResult => ({
  log: path.join(storeDir('config'), 'services-install.log'),
  exit: path.join(storeDir('config'), 'services-install.exit'),
});

/** What a Submit or an Install press learned: whether the installer actually started. */
export type InstallStart =
  | { started: true }
  | { started: false; reason: 'already_installed' | 'in_progress' }
  | { started: false; reason: 'failed'; error: string };

/**
 * Start the Services install. Answers only after the updater has been launched (or failed
 * to launch), so a caller can say Installing truthfully. The download and install run on in
 * the background; watchForServices reports how they end.
 */
async function startInstall(): Promise<InstallStart> {
  if (rosterVerdict().whole) return { started: false, reason: 'already_installed' };
  if ((await readState()).stage === 'installing') return { started: false, reason: 'in_progress' };
  const run = installRun();
  try {
    await Promise.all([fs.rm(run.log, { force: true }), fs.rm(run.exit, { force: true })]);
    await writeState({ stage: 'installing', error_at_stage: null, error_message: null });
    await runUpdater('services', run);
  } catch (e) {
    const error = `the installer did not start: ${(e as Error)?.message ?? e}`;
    await writeState({ stage: 'error', error_at_stage: 'installing', error_message: error }).catch(() => {});
    return { started: false, reason: 'failed', error };
  }
  void watchForServices().finally(pushServicesSetup).catch(() => { /* a failed push never takes the server down */ });
  return { started: true };
}

const INSTALL_TIMEOUT_MS = 10 * 60_000;
const INSTALL_POLL_MS = 5_000;

function rosterVerdict(): { whole: boolean; loaded: string[]; failed: { name: string; reason: string }[] } {
  const loaded = listServices();
  const failed = listServiceFailures();
  return { whole: loaded.length > 0 && failed.length === 0, loaded, failed };
}

/** The updater's exit code once it has ended, and the line it stopped on. */
async function updaterEnded(): Promise<{ code: number; reason: string } | null> {
  const run = installRun();
  let code: number;
  try { code = Number((await fs.readFile(run.exit, 'utf8')).trim()); } catch { return null; }
  const log = await fs.readFile(run.log, 'utf8').catch(() => '');
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  const reason = [...lines].reverse().find((l) => l.startsWith('✗'))?.replace(/^✗\s*/, '') ?? lines.at(-1) ?? '';
  return { code: Number.isFinite(code) ? code : 1, reason };
}

async function watchForServices(now = () => Date.now()): Promise<void> {
  const deadline = now() + INSTALL_TIMEOUT_MS;
  while (now() < deadline) {
    // Unref'd: the server keeps the process alive; a watch alone never should.
    await new Promise((r) => setTimeout(r, INSTALL_POLL_MS).unref());
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
          + 'The reason is in the journal (journalctl --user -u ronin.service).',
      }).catch(() => {});
      return;
    }
    const ended = await updaterEnded();
    if (ended && ended.code !== 0) {
      await writeState({
        stage: 'error', error_at_stage: 'installing',
        error_message: `Ronin Services did not install: ${ended.reason || `the installer stopped (exit ${ended.code})`}`,
      }).catch(() => {});
      return;
    }
    const s = await readState();
    if (s.stage !== 'installing') return;
  }
  await writeState({
    stage: 'error', error_at_stage: 'installing',
    error_message: 'Services did not finish installing. The updater log is in the journal '
      + '(journalctl --user -u "ronin-update-*").',
  }).catch(() => {});
}

export async function resumeInstallWatch(): Promise<void> {
  const s = await readState().catch(() => null);
  if (s?.stage !== 'installing') return;
  void watchForServices().finally(pushServicesSetup).catch(() => { /* a failed push never takes the server down */ });
}

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
          saved.kind_other && `Kind detail: ${saved.kind_other}`,
          saved.user_type && `User type: ${saved.user_type}`,
          saved.goals.length && `Why Ronin: ${saved.goals.join(', ')}`,
          saved.preferred_feature && `Preferred capability: ${saved.preferred_feature}`,
          saved.reasons.length && `Reasons: ${saved.reasons.join(', ')}`,
          saved.reason_other && `Other reason: ${saved.reason_other}`,
          saved.run_location && `Runs on: ${saved.run_location}`,
          saved.intended_use.length && `Intended use: ${saved.intended_use.join(', ')}`,
          saved.theme_preference && `Theme: ${saved.theme_preference}`,
          saved.own_words && `In their words: ${saved.own_words}`,
        ].filter(Boolean).join('\n');
        await sendKansou(buildKansou(saved.anonymous_packet_id, {
          message, feedback_kind: ['other'], using_ronin_for: saved.intended_use,
        })).catch(() => {}); // the packet is durable before immediate delivery is attempted
      }
      // Submitting completes registration; the Services install starts straight away. The
      // answer says whether the installer started, never that Services are installed.
      const install = await startInstall();
      res.json({ ...await registrationAnswer(), install });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Registration was not saved.' });
    }
  });

  app.delete('/api/setup/registration', async (_req, res) => {
    try {
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
    res.json(await activationAnswer());
  });

  app.post('/api/services/install', async (_req, res) => {
    const install = await startInstall();
    if (!install.started && install.reason === 'failed') {
      res.status(500).json({ error: install.error });
      return;
    }
    res.json({ ...await servicesSetupAnswer(), install });
  });
}
