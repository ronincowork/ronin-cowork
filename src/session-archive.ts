import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './stores.js';
import type { Control } from './tmux.js';

export const ARCHIVE_DIR = storeDir('archived_sessions');
export type ResumableProvider = 'claude' | 'codex';

/** Durable archive data. It deliberately contains no prompt, transcript, or raw argv. */
export interface ArchivedSession {
  version: 1;
  id: string;
  name: string;
  key: string;
  archived_at: string;
  cwd: string;
  agent: ResumableProvider;
  provider_session_id: string;
  tags: string[];
  leads: string[];
  wipeboards: string[];
  note: string;
  control: Control;
  project_root: string;
  session_role: string;
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
    // link is the no-clobber publication primitive rename is not: an existing archive
    // is a collision, never a manifest that may be silently replaced.
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

async function descendants(pid: number): Promise<number[]> {
  const out: number[] = [];
  const walk = async (parent: number): Promise<void> => {
    let raw = '';
    try { raw = await fs.readFile(`/proc/${parent}/task/${parent}/children`, 'utf8'); } catch { return; }
    for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
      const child = Number(token); if (!child || out.includes(child)) continue;
      out.push(child); await walk(child);
    }
  };
  await walk(pid); return out;
}

export function codexIdFromFdTargets(targets: readonly { target: string; modified: number }[]): string {
  const locks = new Set<string>();
  const rollouts: Array<{ id: string; modified: number }> = [];
  for (const { target, modified } of targets) {
    const lock = target.match(/thread-writer-locks\/([0-9a-f-]{36})\.lock$/i);
    if (lock) locks.add(lock[1].toLowerCase());
    const rollout = target.match(/\/rollout-[^/]*-([0-9a-f-]{36})\.jsonl$/i);
    if (rollout) rollouts.push({ id: rollout[1].toLowerCase(), modified });
  }
  const exact = rollouts.filter(({ id }) => locks.has(id)).sort((a, b) => b.modified - a.modified);
  if (!exact.length || (exact[1] && exact[1].modified === exact[0].modified && exact[1].id !== exact[0].id)) return '';
  return exact[0].id;
}

async function codexSessionId(pid: number): Promise<string> {
  const targets: Array<{ target: string; modified: number }> = [];
  for (const candidate of [pid, ...await descendants(pid)]) {
    let fds: string[] = [];
    try { fds = await fs.readdir(`/proc/${candidate}/fd`); } catch { continue; }
    for (const fd of fds) {
      try {
        const link = `/proc/${candidate}/fd/${fd}`;
        const [target, stat] = await Promise.all([fs.readlink(link), fs.stat(link)]);
        targets.push({ target, modified: stat.mtimeMs });
      } catch {}
    }
  }
  return codexIdFromFdTargets(targets);
}

function idAfter(argv: readonly string[], flags: readonly string[]): string {
  const at = argv.findIndex((v) => flags.includes(v));
  const id = at >= 0 ? argv[at + 1] || '' : '';
  return UUID.test(id) ? id : '';
}

function exactClaudePrompt(content: unknown, prompt: string): boolean {
  if (content === prompt) return true;
  return Array.isArray(content) && content.some((part) =>
    part && typeof part === 'object' && (part as { type?: string; text?: string }).type === 'text' &&
    (part as { text?: string }).text === prompt);
}

async function legacyClaudeSessionId(cwd: string, argv: string[]): Promise<string> {
  const prompt = argv.at(-1) || '';
  if (!prompt || prompt.startsWith('-')) return '';
  const project = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  let files: string[] = [];
  try { files = await fs.readdir(project); } catch { return ''; }
  const matches: string[] = [];
  for (const file of files.filter((f) => f.endsWith('.jsonl') && UUID.test(f.slice(0, -6)))) {
    try {
      const raw = await fs.readFile(path.join(project, file), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.includes(prompt.slice(0, Math.min(80, prompt.length)))) continue;
        const value = JSON.parse(line) as { type?: string; message?: { content?: unknown } };
        if (value.type === 'user' && exactClaudePrompt(value.message?.content, prompt)) {
          matches.push(file.slice(0, -6)); break;
        }
      }
    } catch {}
  }
  return matches.length === 1 ? matches[0] : '';
}

export async function providerSessionId(agent: string, cwd: string, pid: number, stamped = ''): Promise<string> {
  if (UUID.test(stamped)) return stamped;
  const argv = await argvFromProc(pid);
  if (!argv.length) return '';
  if (agent === 'codex') return codexSessionId(pid);
  if (agent === 'claude') {
    return idAfter(argv, ['--session-id']) || idAfter(argv, ['--resume', '-r']) || legacyClaudeSessionId(cwd, argv);
  }
  return '';
}

export function providerFromArgv(argv: readonly string[]): ResumableProvider | '' {
  for (const value of argv.slice(0, 2)) {
    const bare = path.basename(value);
    if (bare === 'claude' || bare === 'codex') return bare;
  }
  return '';
}

export async function providerSessionInfo(
  stampedAgent: string,
  cwd: string,
  pid: number,
  stampedId = '',
): Promise<{ agent: ResumableProvider; id: string } | null> {
  const argv = await argvFromProc(pid);
  const agent = stampedAgent === 'claude' || stampedAgent === 'codex' ? stampedAgent : providerFromArgv(argv);
  if (!agent) return null;
  const id = await providerSessionId(agent, cwd, pid, stampedId);
  return id ? { agent, id } : null;
}
