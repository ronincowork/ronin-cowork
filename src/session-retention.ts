/**
 * Session folders outlive their sessions on purpose — the transcript, the birth receipt,
 * and the launch identity are the evidence a later personality reading needs — but not
 * forever. The sweep runs weekly; the period is counted in days. A closed, unarchived folder is removed once nothing has written to it for
 * the retention period. Archived folders stay until hard delete, as before.
 *
 * Owner rulings, 2026-09-22: seven days after close; the period is a Campaign key with
 * no UI (`config.cowork_defaults.session_retention_days`), and `0` switches the sweep
 * off. When campaigns disagree the most generous value wins, because a folder does not
 * record which campaign it was born into and keeping evidence is the cheaper mistake.
 *
 * "Closed" is not a marker file: a folder is closed when no live session carries its
 * key, and its close time is its last write. Rireki's sweep writes transcript.jsonl
 * every minute while a session lives, so that is exact to a minute for bound sessions.
 */
import { lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { listCampaigns } from './campaigns.js';
import { onClock } from './jikan.js';
import { listArchives } from './session-archive.js';
import { storeDir } from './resources.js';
import { listSessions } from './tmux.js';

export const DEFAULT_RETENTION_DAYS = 7;
const DAY_MS = 86_400_000;
/** The owner's word: the clean sweep runs once a week; the period it applies is in days. */
const SWEEP_EVERY_MS = 7 * DAY_MS;

const days = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The period in force: the largest any campaign states; `0` on any campaign is off. */
export function retentionDays(campaigns: ReadonlyArray<{ config: { cowork_defaults?: Record<string, unknown> } }>): number {
  const stated = campaigns
    .map((c) => days((c.config.cowork_defaults ?? {}).session_retention_days))
    .filter((n): n is number => n !== null);
  if (stated.includes(0)) return 0;
  return stated.length ? Math.max(...stated) : DEFAULT_RETENTION_DAYS;
}

/** When the folder was last written: the newest entry, or the folder itself. */
async function lastWrite(dir: string): Promise<number> {
  let newest = (await lstat(dir)).mtimeMs;
  for (const name of await readdir(dir)) {
    const at = await lstat(path.join(dir, name)).then((s) => s.mtimeMs, () => 0);
    if (at > newest) newest = at;
  }
  return newest;
}

export interface SweepInput {
  days: number;
  now: number;
  live: ReadonlySet<string>;
  archived: ReadonlySet<string>;
}

/** Remove closed, unarchived folders older than the period. Returns what went. */
export async function sweepSessionFolders(input: SweepInput): Promise<string[]> {
  if (input.days <= 0) return [];
  const root = storeDir('session');
  const cutoff = input.now - input.days * DAY_MS;
  const removed: string[] = [];
  const entries = await readdir(root, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return [];
    throw e;
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const key = entry.name;
    if (input.live.has(key) || input.archived.has(key)) continue;
    const dir = path.join(root, key);
    if ((await lastWrite(dir)) >= cutoff) continue;
    await rm(dir, { recursive: true, force: true });
    removed.push(key);
  }
  return removed;
}

export async function sweepOnce(now = Date.now()): Promise<string[]> {
  const [campaigns, sessions, archives] = await Promise.all([listCampaigns(), listSessions(), listArchives()]);
  return sweepSessionFolders({
    days: retentionDays(campaigns),
    now,
    live: new Set(sessions.map((s) => s.key).filter(Boolean)),
    archived: new Set(archives.map((a) => a.key).filter(Boolean)),
  });
}

/** Once at boot, then weekly, on the house clock JIKAN already keeps. */
export function startSessionRetention(): () => void {
  const run = async () => {
    const removed = await sweepOnce();
    if (removed.length) console.log(`[retention] removed ${removed.length} closed session folder(s)`);
  };
  void run().catch((e) => console.error('[retention] sweep failed:', e));
  return onClock('session-retention', SWEEP_EVERY_MS, run);
}
