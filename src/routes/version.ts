/**
 * VERSION — the operator says what it is running (the pre-artifact stamp).
 *
 * Pre-split there is no release version to carry (`ronin_artifact` is [planned] —
 * KOTOBA § THE GROUND), so the honest identity of a running Ronin is the commit its
 * process started from. Captured ONCE, at module load: the operator is a memory copy
 * taken at start (docs/repo-to-operator.md), so answering per request would describe
 * the tree, not the process — the exact confusion (BYOKI) this endpoint exists to
 * dissolve. `bin/ronin-doctor` compares this answer against the tree's HEAD, which
 * turns the src/ hop of BYOKI into a string comparison instead of an inference.
 */
import type express from 'express';
import { CONTRACT_V } from '../sockets-contract.js';
import { getStreamHandler, listServices } from '../sockets.js';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo this running code was loaded from — resolved from the module itself, never
// spelled (docs/stores.md). dist/ note: compiled output would sit one level deeper;
// until the artifact exists the operator runs src/ via tsx, and the day that changes
// this line is part of the change.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 3000 }).trim();
  } catch {
    return null; // no git / not a checkout — a real artifact will carry its own version instead
  }
}

// Dirty is scoped to what the operator actually bakes in at start: src/ and
// package.json. public/ is served from disk and catalogs are parsed per request —
// neither is ever part of the memory copy (docs/repo-to-operator.md's table).
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = commit === null ? null : git('status', '--porcelain', '--', 'src', 'package.json') !== '';
const startedAt = new Date().toISOString();

export function registerVersion(app: express.Express): void {
  app.get('/api/version', (_req, res) => {
    // `stream`: is the 🔓 tape view plugged in? The stream handler is rireki's, set
    // through the connector (sockets-contract.ts) — absent means the free build, and
    // the client locks every tile and greys the switch. Read per request, so the
    // answer is the process's, whenever services registered.
    // `services`: who registered, by name — the client draws an absent service's
    // surfaces opaque-and-inert instead of fetching into a 404 (sockets.ts).
    res.json({
      commit: commit ?? 'unknown',
      dirty,
      startedAt,
      contract: CONTRACT_V,
      stream: getStreamHandler() !== undefined,
      services: listServices(),
    });
  });
}
