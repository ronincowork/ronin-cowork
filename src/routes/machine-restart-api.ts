import type express from 'express';
import { join } from 'node:path';
import { REPO_ROOT } from '../resources.js';
import { execFile } from '../spawn-broker.js';

/** The one sanctioned restart: ronin_bin/tejun-machine-restart, which restarts Ronin and nothing else. */
const RESTART_TOOL = join(REPO_ROOT, 'ronin_bin', 'tejun-machine-restart');

/**
 * POST /api/machine/restart — the Setup Services surface's Restart press.
 *
 * Ronin restarts itself, so the answer goes out first and the restart follows a beat later;
 * the browser then watches /api/installed come back and reads `restart_needed` off it. The
 * restart runs as its own transient unit when systemd-run is here, so the kill of this
 * service's cgroup cannot take the restart request down with it; otherwise the tool runs
 * directly and systemd still honours the job it has already queued. Sessions are untouched:
 * they live in the tmux server, not in Ronin (see the tool's own header).
 */
export function registerMachineRestart(app: express.Express): void {
  app.post('/api/machine/restart', (_req, res) => {
    res.json({ started: true, via: 'tejun-machine-restart' });
    setTimeout(() => {
      void execFile('systemd-run', ['--user', '--quiet', '--collect', `--unit=ronin-restart-${Date.now()}`, RESTART_TOOL], { timeout: 20_000 })
        .catch(() => execFile(RESTART_TOOL, [], { timeout: 60_000 }))
        .catch((error: Error) => console.error(`[machine-restart] ${error.message}`));
    }, 150);
  });
}
