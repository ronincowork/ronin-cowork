/**
 * UPDATE — the ⚙ gear's two verbs, both of them bin/ronin-update wearing HTTP.
 *
 * The gear SHOWS and never acts unasked (the dial doctrine applied to the install):
 * /check runs only when the owner presses the button — it is the one place cowork
 * asks github.com anything, and it is never on a timer. /run is the same press-only
 * rule for the update itself.
 *
 * WHY /run GOES THROUGH systemd-run: the update restarts tmux-ronin — the unit this
 * process lives in. A child spawned here dies with its parent's cgroup at that
 * restart, killing the update mid-swap. A transient systemd unit lives OUTSIDE our
 * cgroup and survives it — the same isolation that keeps sessions alive in
 * tmux-server.service. No systemd (macOS): detached spawn, best effort, said so.
 *
 * The client then polls /api/version until the answer changes: the new operator
 * reporting its release IS the completion signal — no progress channel to invent,
 * and nothing to go stale if the updater dies (the poll times out and says so).
 * docs/release.md is the procedure; bin/ronin-update is the one implementation.
 */
import type express from 'express';
import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import { REPO_ROOT } from '../config.js';

const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export function registerUpdate(app: express.Express): void {
  app.get('/api/update/check', (_req, res) => {
    execFile(UPDATER, ['--check', '--json'], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) {
        res.status(500).json({ error: (stderr || err.message).trim().slice(0, 400) });
        return;
      }
      try {
        res.json(JSON.parse(stdout));
      } catch {
        res.status(500).json({ error: `updater answered unparseably: ${stdout.trim().slice(0, 200)}` });
      }
    });
  });

  app.post('/api/update/run', (req, res) => {
    // TWO PACKAGES, one implementation: {package:'services'} runs the same updater
    // with --services (fetch → verify → contract check → store → place → restart).
    // Anything other than the two known names is refused, not guessed.
    const pkg = (req.body as { package?: string } | undefined)?.package ?? 'cowork';
    if (pkg !== 'cowork' && pkg !== 'services') {
      res.status(400).json({ error: `unknown package "${pkg}" — cowork or services` });
      return;
    }
    const args = pkg === 'services' ? [UPDATER, '--services'] : [UPDATER];
    execFile('systemd-run', [
      '--user', '--collect', `--unit=ronin-update-${Date.now()}`,
      // The journal keeps the transcript: journalctl --user -u 'ronin-update-*'
      ...args,
    ], { timeout: 10000 }, (err) => {
      if (!err) {
        res.json({ started: true, via: 'systemd-run' });
        return;
      }
      // No systemd on this host: detached is the honest best effort — the child
      // shares no controlling terminal, but a launchd-style supervisor could still
      // reap it with us. Said in the answer rather than hidden.
      try {
        const child = spawn(args[0], args.slice(1), { detached: true, stdio: 'ignore' });
        child.unref();
        res.json({ started: true, via: 'detached' });
      } catch (e) {
        res.status(500).json({ error: `could not start the updater: ${(e as Error).message}` });
      }
    });
  });
}
