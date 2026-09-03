import type express from 'express';
import { CONTRACT_V } from '../sockets-contract.js';
import { getStreamHandler, listServices } from '../sockets.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 3000 }).trim();
  } catch {
    return null; // no git / not a checkout — an artifact carries its identity in VERSION instead
  }
}

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

const commit = git('rev-parse', '--short', 'HEAD') ?? stamped?.commit ?? null;
const dirty = commit === null || stamped ? null : git('status', '--porcelain', '--', 'src', 'package.json') !== '';
const startedAt = new Date().toISOString();

export const roninIdentity = (): {
  release: string | null;
  commit: string;
  dirty: boolean | null;
  startedAt: string;
} => ({ release: stamped?.release ?? null, commit: commit ?? 'unknown', dirty, startedAt });

export function registerVersion(app: express.Express): void {
  app.get('/api/version', (_req, res) => {
    res.json({
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
