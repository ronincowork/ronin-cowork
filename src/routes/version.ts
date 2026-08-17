/**
 * VERSION — the operator says what it is running.
 *
 * Two identities, and the tree decides which: a ronin_install unpacked from a release
 * tarball carries the VERSION file bin/ronin-build stamped into it and answers with a
 * release string (`release: "v1.0.0"`); a checkout carries none, answers
 * `release: null`, and the commit its process started from is the honest maximum.
 * Captured ONCE, at module load: the operator is a memory copy taken at start
 * (docs/repo-to-operator.md), so answering per request would describe the tree, not
 * the process — the exact confusion (BYOKI) this endpoint exists to dissolve.
 * `bin/ronin-doctor` compares release strings when it can and commits when it must;
 * either way BYOKI is a string comparison, never an inference. docs/release.md is the
 * procedure this file is one end of.
 */
import type express from 'express';
import { CONTRACT_V } from '../sockets-contract.js';
import { getStreamHandler, listServices } from '../sockets.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
    return null; // no git / not a checkout — an artifact carries its identity in VERSION instead
  }
}

/**
 * THE ARTIFACT'S IDENTITY. bin/ronin-build stamps a VERSION file (release, commit,
 * built, contract — plain key=value lines) into every tarball, so an unpacked release
 * knows what it is without git. Present → this is a ronin_install running a release,
 * and `release` is its one true name. Absent → a checkout, `release: null`, and the
 * commit answer below is the honest maximum, exactly as before the artifact existed.
 */
function readVersionFile(): Record<string, string> | null {
  try {
    const lines = readFileSync(join(REPO, 'VERSION'), 'utf8').split('\n');
    const out: Record<string, string> = {};
    for (const l of lines) {
      const i = l.indexOf('=');
      if (i > 0) out[l.slice(0, i)] = l.slice(i + 1).trim();
    }
    return out.release ? out : null;
  } catch {
    return null; // no VERSION — a checkout, the ordinary state on a dev box
  }
}
const stamped = readVersionFile();

// Dirty is scoped to what the operator actually bakes in at start: src/ and
// package.json. public/ is served from disk and catalogs are parsed per request —
// neither is ever part of the memory copy (docs/repo-to-operator.md's table).
// On a release (no .git in the tarball) git() answers null and the stamped commit
// stands in — the commit the release was built from.
const commit = git('rev-parse', '--short', 'HEAD') ?? stamped?.commit ?? null;
const dirty = commit === null || stamped ? null : git('status', '--porcelain', '--', 'src', 'package.json') !== '';
const startedAt = new Date().toISOString();

/**
 * THIS PROCESS'S IDENTITY, for a reader that does not want an HTTP round trip.
 *
 * Exported because SETTEI's record reports the same four facts, and the alternative was a
 * second `git rev-parse` per request — which would describe the TREE rather than the
 * process, the exact confusion (BYOKI) this module exists to dissolve. One measurement,
 * taken once at load, read by both.
 */
export const roninIdentity = (): {
  release: string | null;
  commit: string;
  dirty: boolean | null;
  startedAt: string;
} => ({ release: stamped?.release ?? null, commit: commit ?? 'unknown', dirty, startedAt });

export function registerVersion(app: express.Express): void {
  app.get('/api/version', (_req, res) => {
    // `stream`: is the 🔓 tape view plugged in? The stream handler is rireki's, set
    // through the connector (sockets-contract.ts) — absent means the free build, and
    // the client locks every tile and greys the switch. Read per request, so the
    // answer is the process's, whenever services registered.
    // `services`: who registered, by name — the client draws an absent service's
    // surfaces opaque-and-inert instead of fetching into a 404 (sockets.ts).
    res.json({
      // The release string is what the ⚙ gear and the doctor compare — BYOKI as a
      // string match. null = a checkout, whose identity is the commit alone.
      release: stamped?.release ?? null,
      commit: commit ?? 'unknown',
      dirty,
      startedAt,
      contract: CONTRACT_V,
      stream: getStreamHandler() !== undefined,
      services: listServices(),
    });
  });
}
