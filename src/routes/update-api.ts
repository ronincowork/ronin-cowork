import type express from 'express';
import { join } from 'node:path';
import { REPO_ROOT } from '../resources.js';
import { runUpdater, type Started } from '../update-run.js';
import { execFile } from '../spawn-broker.js';

const UPDATER = join(REPO_ROOT, 'bin', 'ronin-update');

export function registerUpdate(app: express.Express): void {
  app.get('/api/update/check', (_req, res) => {
    void execFile(UPDATER, ['--check', '--json'], { timeout: 20000 }).then(({ stdout }) => {
      try { res.json(JSON.parse(stdout)); }
      catch { res.status(500).json({ error: `updater answered unparseably: ${stdout.trim().slice(0, 200)}` }); }
    }, (err: Error & { stderr?: string }) => {
      res.status(500).json({ error: (err.stderr || err.message).trim().slice(0, 400) });
    });
  });

  app.post('/api/update/run', (req, res) => {
    const pkg = (req.body as { package?: string } | undefined)?.package ?? 'cowork';
    if (pkg !== 'cowork' && pkg !== 'services') {
      res.status(400).json({ error: `unknown package "${pkg}" — cowork or services` });
      return;
    }
    runUpdater(pkg)
      .then((started: Started) => res.json({ started: true, via: started.via }))
      .catch((e: Error) => res.status(500).json({ error: `could not start the updater: ${e.message}` }));
  });
}
