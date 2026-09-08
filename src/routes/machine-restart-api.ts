import type express from 'express';
import { join } from 'node:path';
import { REPO_ROOT } from '../resources.js';
import { execFile } from '../spawn-broker.js';

/** The one sanctioned restart: ronin_bin/tejun-machine-restart, which restarts Ronin and nothing else. */
const RESTART_TOOL = join(REPO_ROOT, 'ronin_bin', 'tejun-machine-restart');

/**
 * POST /api/machine/restart — the Setup Services surface's Restart press.
 *
 * The tool restarts the installed Ronin service. A copy of Ronin started by hand — a preview,
 * a developer's `npm start` — is not that service, so pressing Restart there would restart the
 * wrong Ronin and leave this one unchanged; systemd marks its own services with INVOCATION_ID,
 * and without it this route refuses with a plain sentence instead. When this copy is the
 * service, the tool is run and no answer follows: the restart takes this process down, and the
 * browser reads the restart off /api/installed's `startedAt` changing. Only a refusal from the
 * tool answers — its own words, so the person reads what it saw. Sessions are untouched: they
 * live in the tmux server, not in Ronin (see the tool's own header).
 */
export function registerMachineRestart(app: express.Express): void {
  app.post('/api/machine/restart', (_req, res) => {
    if (!process.env.INVOCATION_ID) {
      res.status(409).json({ error: 'This copy of Ronin is not the installed service, so it cannot restart itself; whoever started it restarts it.' });
      return;
    }
    void execFile(RESTART_TOOL, [], { timeout: 90_000 }).then(
      ({ stdout }) => res.json({ started: true, said: String(stdout || '').trim().slice(0, 400) }),
      (error: Error & { stderr?: string }) => res.status(409).json({ error: (error.stderr || error.message).trim().slice(0, 400) }),
    );
  });
}
