/**
 * WHAT IS ON THIS MACHINE — one answer, read by every surface that says "installed": Ronin Cowork
 * itself (its commit or release) and the Ronin Services parts. Services ships with Cowork and,
 * where present, every part runs (owner, 2026-11-26, KAN-914): there is no switch to report, only
 * what is on disk, what loaded, and what parked itself or failed.
 */
import type express from 'express';
import { homedir } from 'node:os';
import { listParkedServices, listServiceFailures, listServices } from '../sockets.js';
import { discoverParts } from '../parts.js';
import { roninIdentity } from './version.js';

const errMsg = (e: unknown) => String((e as Error)?.message ?? e).replaceAll(homedir(), '~');

export interface InstalledAnswer {
  cowork: { release: string | null; commit: string; dirty: boolean | null; startedAt: string };
  services: {
    /** Parts on this machine — on disk, whether or not they run: koe, project_management, counting, machine, rireki … */
    parts: string[];
    /** Parts this server loaded and runs. */
    loaded: string[];
    /** Parts on disk this server did not load: parked by their own PARKED.md, or failed to load. */
    parked: { name: string; reason: string }[];
    /** Ronin Services is on this machine. */
    installed: boolean;
  };
}

export async function installedAnswer(): Promise<InstalledAnswer> {
  const loaded = listServices();
  const parkedByName = new Map(listParkedServices().map((part) => [part.name, part]));
  for (const failure of listServiceFailures()) parkedByName.set(failure.name, failure);
  const parked = [...parkedByName.values()];
  const parts = [...new Set([...discoverParts().map((part) => part.name), ...loaded, ...parked.map((part) => part.name)])].sort();
  return { cowork: roninIdentity(), services: { parts, loaded, parked, installed: parts.length > 0 } };
}

export function registerInstalled(app: express.Express): void {
  app.get('/api/installed', async (_req, res) => {
    try {
      res.json(await installedAnswer());
    } catch (e) {
      res.status(500).json({ error: errMsg(e) });
    }
  });
}
