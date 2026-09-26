import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './resources.js';
import { AGENTS, agentSpec } from './agents.js';

export const ARCHIVE_DIR = storeDir('archived_sessions');
export type ResumableProvider = string;

export interface ArchivedSession {
  version: 1;
  id: string;
  name: string;
  key: string;
  archived_at: string;
  cwd: string;
  agent: ResumableProvider;
  identity?: import('./tmux.js').SessionIdentity;
  provider_session_id: string;
  tags: string[];
  leads: string[];
  wipeboards: string[];
  note: string;
  project_root: string;
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

export function providerFromArgv(argv: readonly string[]): ResumableProvider | '' {
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
): Promise<{ agent: ResumableProvider; id: string } | null> {
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
