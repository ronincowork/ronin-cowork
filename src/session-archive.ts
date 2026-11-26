import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './resources.js';
import { AGENTS, agentSpec } from './agents.js';

export const ARCHIVE_DIR = storeDir('archived_sessions');
/** An archive undoes an accidental close; it is not storage (owner, 2026-11-15). Older than
 * this, it is removed as its Hard Delete removes it: at service start and on each new archive. */
export const ARCHIVE_DAYS = 7;
export type ResumableHarness = string;

export interface ArchivedSession {
  version: 1;
  id: string;
  name: string;
  key: string;
  archived_at: string;
  cwd: string;
  agent: ResumableHarness;
  identity?: import('./tmux.js').SessionIdentity;
  provider_session_id: string;
  tags: string[];
  leads: string[];
  wipeboards: string[];
  project_root: string;
  /** Open desks the archive left as they were (--ignore-desks); restore returns to them. */
  desks_left_open?: string[];
  /** Saved by archive all (POST /api/machine/archive-all); restore all brings back only these. */
  warm_restart?: true;
}

/** What restore all brings back: the archives archive all saved whose name is not running. */
export function warmRestorable(archives: readonly ArchivedSession[], live: ReadonlySet<string>): { restore: ArchivedSession[]; running: ArchivedSession[] } {
  const warm = archives.filter((a) => a.warm_restart);
  return { restore: warm.filter((a) => !live.has(a.name)), running: warm.filter((a) => live.has(a.name)) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: string): boolean => /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
const manifestPath = (id: string): string => {
  if (!validId(id)) throw new Error('Invalid archive id.');
  return path.join(ARCHIVE_DIR, `${id}.json`);
};

export async function writeArchive(value: ArchivedSession): Promise<void> {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true, mode: 0o700 });
  const target = manifestPath(value.id);
  const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.link(tmp, target);
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

export async function readArchive(id: string): Promise<ArchivedSession> {
  return JSON.parse(await fs.readFile(manifestPath(id), 'utf8')) as ArchivedSession;
}

export async function listArchives(): Promise<ArchivedSession[]> {
  let names: string[];
  try { names = await fs.readdir(ARCHIVE_DIR); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const values: ArchivedSession[] = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    try { values.push(await readArchive(name.slice(0, -5))); } catch {}
  }
  return values.sort((a, b) => b.archived_at.localeCompare(a.archived_at));
}

/** The archives older than ARCHIVE_DAYS, by archived_at. */
export function expiredArchives(archives: readonly ArchivedSession[], now = Date.now()): ArchivedSession[] {
  const cutoff = now - ARCHIVE_DAYS * 86_400_000;
  return archives.filter((a) => Date.parse(a.archived_at) < cutoff);
}

export async function removeArchive(id: string): Promise<void> {
  await fs.unlink(manifestPath(id));
}

export function argvFromProc(pid: number): Promise<string[]> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve([]);
  return fs.readFile(`/proc/${pid}/cmdline`).then((b) => b.toString().split('\0').filter(Boolean), () => []);
}

function idAfter(argv: readonly string[], flags: readonly string[]): string {
  const ids = argv.flatMap((value, index) => flags.includes(value) ? [argv[index + 1] || ''] : []);
  return ids.length && ids.every(id => UUID.test(id) && id === ids[0]) ? ids[0]! : '';
}

export function providerFromArgv(argv: readonly string[]): ResumableHarness | '' {
  for (const value of argv.slice(0, 2)) {
    const bare = path.basename(value);
    const match = AGENTS.find((agent) => agent.cmd === bare);
    if (match) return match.id;
  }
  return '';
}

/** Compatibility for births without a launch artifact. Never infer from history,
 * descendant file descriptors, or modification times. Process argv is Linux-only.
 */
export async function providerSessionInfo(
  stampedAgent: string,
  _cwd: string,
  pid: number,
  stampedId = '',
): Promise<{ agent: ResumableHarness; id: string } | null> {
  const stamped = agentSpec(stampedAgent)?.id;
  if (stamped && stampedId) return { agent: stamped, id: stampedId };
  const argv = await argvFromProc(pid);
  const agent = stamped || providerFromArgv(argv);
  if (agent && stampedId) return { agent, id: stampedId };
  const discovery = agent ? agentSpec(agent)?.operations.session.discovery : 'unsupported';
  const id = discovery === 'explicit-argv'
    ? idAfter(argv, ['--session-id', '--resume', '-r']) : '';
  return agent && id ? { agent, id } : null;
}
