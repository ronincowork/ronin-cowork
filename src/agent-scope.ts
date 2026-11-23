/**
 * An Agent's temp files and processes are its own (w624).
 *
 * TEMP. Every launch gets TMPDIR and CLAUDE_CODE_TMPDIR (Claude Code's scratchpad root; it
 * appends claude-<uid>/) pointing at `tmp/` in its session folder, on disk, never /tmp (tmpfs,
 * RAM). It goes when the Agent goes (removeSessionFolders): Delete, Hard Delete, an unresumable
 * end, archive expiry; archive keeps it. A session path too long for a unix socket under it (sun_path is 108) gets
 * a short root `<data root>/tmp/<hash of key>`, linked from `<session folder>/tmp`; the start
 * sweep removes a short root whose session folder is gone.
 *
 * PROCESSES. tmux puts every pane in its own systemd scope, `tmux-spawn-<uuid>.scope`, whose
 * Description reads "tmux child pane <pane pid> launched by process <server pid>". Everything an
 * Agent starts stays in that scope, even a detached child with ppid 1. Ronin records the scope
 * on the session (@ronin-scope, and `scope` in its folder), puts a memory ceiling on it, and stops it (systemctl --user
 * stop) when the session is killed (end, archive, Delete, Hard Delete) or its pane dies (a tmux
 * hook). By cgroup, never by name pattern. Never the scope of a live pane, nor one holding this
 * service: tmux-server.service and ronin.service are services, not tmux-spawn scopes.
 *
 * A rig an Agent started (its own tmux server) is the Agent's: its panes' scopes go too.
 *
 * A helper a CLI detaches into a scope of its own (Codex's app-server daemon) is found by path:
 * a process whose /proc exe or cwd is inside the session folder is the Agent's, and its scope
 * goes too.
 *
 * SWEEP. At service start: stop the scopes of our tmux server's panes that are not live, the
 * scopes recorded in, or running from, the folders of sessions that are not live, and their
 * rigs' panes; remove temp
 * roots of sessions that no longer exist. Never anything else on the box: a scope from a tmux
 * server Ronin did not start is the user's. Only when Ronin runs as a systemd service: a rig
 * started from an Agent's pane never sweeps the box.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { storeDir } from './resources.js';
import { holdsWritten, letterListKey } from './holds-hook.js';

const execAsync = promisify(execFile);

/** Per-Agent ceiling, from the box's RAM: MemoryMax a fifth of it (never under 1 GiB), MemoryHigh
 * 85% of that, where the kernel starts reclaiming and throttling, and MemorySwapMax a quarter of
 * it, so one runaway cannot fill swap, which is what took the 16 GB box down (15 Nov: an Agent's
 * scope peaked 2–3 GB counting page cache, its own memory well under 1 GB). 16 GB gives
 * 2.7G/3.2G/0.8G; 4 GB gives 0.85G/1G/0.25G; 64 GB gives 10.9G/12.8G/3.2G. */
export function memoryCeiling(total = os.totalmem()): { MemoryHigh: string; MemoryMax: string; MemorySwapMax: string } {
  const mib = (bytes: number) => `${Math.floor(bytes / 1_048_576)}M`;
  const max = Math.max(1_073_741_824, total / 5);
  return { MemoryHigh: mib(max * 0.85), MemoryMax: mib(max), MemorySwapMax: mib(max / 4) };
}

/** Longest temp root: 108 (sun_path) less room for what tools append (tmux-<uid>/default,
 * claude-<uid>/…/x.sock). */
export const TEMP_ROOT_MAX = 72;

const SCOPE_RE = /^tmux-spawn-[0-9a-f-]+\.scope$/;
const DESCRIPTION_RE = /tmux child pane (\d+) launched by process (\d+)/;

export const isPaneScope = (unit: string): boolean => SCOPE_RE.test(unit);

const shortRoot = (key: string): string =>
  path.join(path.dirname(storeDir('session')), 'tmp', createHash('sha256').update(key).digest('hex').slice(0, 16));

/** Where this session's temp lives: in its folder, or a short root when that path is too long. */
export function agentTempDir(key: string): string {
  const inFolder = path.join(storeDir('session'), key, 'tmp');
  return inFolder.length <= TEMP_ROOT_MAX ? inFolder : shortRoot(key);
}

/** The folders a session's programs can run from: its session folder, and its temp root when
 * that is a short one outside it. */
export function sessionFolders(key: string): string[] {
  const folder = path.join(storeDir('session'), key);
  const temp = agentTempDir(key);
  return temp.startsWith(`${folder}/`) ? [folder] : [folder, temp];
}

/** The Agent and its folder are one (owner, 22 Nov): every ending that deletes the Agent (Delete,
 * Hard Delete, an unresumable end, archive Hard Delete, archive expiry) removes its folder and its
 * temp root in the same step. Archive keeps them; nothing else removes them. */
export async function removeSessionFolders(key: string): Promise<void> {
  if (!key) return;
  for (const dir of sessionFolders(key)) await rm(dir, { recursive: true, force: true });
  holdsWritten(letterListKey(key), '', []); // its letter went with it
}

/** Make the session's temp folder and return the env that points the Agent at it. */
export async function agentTempEnv(key: string): Promise<Record<string, string>> {
  const dir = agentTempDir(key);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const link = path.join(storeDir('session'), key, 'tmp');
  if (dir !== link) {
    await mkdir(path.dirname(link), { recursive: true, mode: 0o700 });
    await symlink(dir, link).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
  }
  return { TMPDIR: dir, CLAUDE_CODE_TMPDIR: dir };
}

export interface ScopeOps {
  /** The systemd unit of a process's cgroup, when it is a pane scope. */
  scopeOf(pid: number): Promise<string | null>;
  /** Every pane scope the user manager knows, with its pane and launching server. */
  scopes(): Promise<Array<{ unit: string; pane: number; server: number }>>;
  /** Pane scopes holding a process whose executable or working folder is inside one of these. */
  folderScopes(dirs: string[]): Promise<string[]>;
  stop(units: string[]): Promise<void>;
  limit(unit: string): Promise<void>;
  /** This service: its own pid, and whether it runs as a systemd service. */
  self(): Promise<{ pid: number; service: boolean }>;
}

const linux = process.platform === 'linux';

const cgroupLine = async (pid: number | 'self'): Promise<string> =>
  (await readFile(`/proc/${pid}/cgroup`, 'utf8')).trim().split('\n').find((l) => l.startsWith('0::'))?.slice(3) ?? '';

export const liveScopeOps: ScopeOps = {
  async scopeOf(pid) {
    if (!linux || !pid) return null;
    const unit = path.basename(await cgroupLine(pid).catch(() => ''));
    return isPaneScope(unit) ? unit : null;
  },
  async scopes() {
    if (!linux) return [];
    const { stdout } = await execAsync('systemctl', ['--user', 'list-units', '--type=scope', '--state=active',
      '--plain', '--no-legend', '--full', 'tmux-spawn-*.scope']).catch(() => ({ stdout: '' }));
    return stdout.split('\n').flatMap((line) => {
      const unit = line.split(/\s+/)[0] ?? '';
      const m = DESCRIPTION_RE.exec(line);
      return isPaneScope(unit) && m ? [{ unit, pane: Number(m[1]), server: Number(m[2]) }] : [];
    });
  },
  async folderScopes(dirs) {
    if (!linux || !dirs.length) return [];
    const inside = (target: string) => dirs.some((dir) => target === dir || target.startsWith(`${dir}/`));
    const units = new Set<string>();
    for (const pid of (await readdir('/proc').catch(() => [] as string[])).filter((d) => /^\d+$/.test(d))) {
      const [exe, cwd] = await Promise.all(['exe', 'cwd'].map((link) => readlink(`/proc/${pid}/${link}`).catch(() => '')));
      if (!inside(exe) && !inside(cwd)) continue;
      const unit = await liveScopeOps.scopeOf(Number(pid));
      if (unit) units.add(unit);
    }
    return [...units];
  },
  async stop(units) {
    if (!units.length) return;
    // A unit already gone (its pane's hook stopped it) fails alone; the others still stop.
    await execAsync('systemctl', ['--user', 'stop', '--no-block', '--', ...units]).catch((e: { stderr?: string }) => {
      const real = String(e.stderr ?? '').split('\n').filter((line) => line && !line.includes('not loaded'));
      if (real.length) console.error(`[scope] stopping ${units.join(' ')}: ${real.join('; ')}`);
    });
  },
  async limit(unit) {
    await execAsync('systemctl', ['--user', 'set-property', '--runtime', unit,
      ...Object.entries(memoryCeiling()).map(([k, v]) => `${k}=${v}`)]).catch((e) =>
      console.error(`[scope] memory ceiling on ${unit}:`, (e as Error).message));
  },
  async self() {
    const group = linux ? await cgroupLine('self').catch(() => '') : '';
    return { pid: process.pid, service: path.basename(group).endsWith('.service') };
  },
};

/** Scopes safe to stop: pane scopes, not a live pane's, not holding this service. */
export async function stoppable(units: Iterable<string>, livePanes: Iterable<number>, ops: ScopeOps = liveScopeOps): Promise<string[]> {
  const live = new Set<string>();
  for (const pid of livePanes) { const unit = await ops.scopeOf(pid); if (unit) live.add(unit); }
  const own = await ops.scopeOf((await ops.self()).pid);
  return [...new Set(units)].filter((unit) => isPaneScope(unit) && !live.has(unit) && unit !== own);
}

/** Add the scopes of panes whose tmux server runs inside one of these: a rig an Agent started
 * is the Agent's, and its panes' children go with it. */
export async function withNested(units: Iterable<string>, ops: ScopeOps = liveScopeOps): Promise<string[]> {
  const all = new Set(units);
  const scopes = await ops.scopes();
  const hosts = new Map<number, Promise<string | null>>();
  const hostOf = (pid: number) => hosts.get(pid) ?? (hosts.set(pid, ops.scopeOf(pid)), hosts.get(pid)!);
  for (let grew = true; grew;) {
    grew = false;
    for (const scope of scopes) {
      if (all.has(scope.unit)) continue;
      const host = await hostOf(scope.server);
      if (host && all.has(host)) { all.add(scope.unit); grew = true; }
    }
  }
  return [...all];
}

const scopeFile = (key: string) => path.join(storeDir('session'), key, 'scope');

/** Note the session's pane scope in its folder, so a start sweep finds it after any restart. */
export async function recordScope(key: string, unit: string): Promise<void> {
  await mkdir(path.dirname(scopeFile(key)), { recursive: true, mode: 0o700 });
  await writeFile(scopeFile(key), `${unit}\n`, { mode: 0o600 });
}

export interface SweepState {
  /** This Ronin's tmux server pid. */
  server: number;
  /** Pids of its live (not dead) panes. */
  livePanes: number[];
  /** Keys of session folders that still exist. */
  sessionKeys: string[];
  /** Keys of live sessions. */
  liveKeys: string[];
}

/** The start sweep: what ended Agents left, and only Ronin's own: pane scopes of our tmux server
 * whose pane is gone, scopes recorded in session folders, and the panes of rigs those started.
 * Never a live pane's scope. Only when Ronin runs as a systemd service; a rig never sweeps. */
export async function sweepLeftovers(state: SweepState, ops: ScopeOps = liveScopeOps): Promise<{ scopes: string[]; temp: string[] }> {
  if (!(await ops.self()).service) return { scopes: [], temp: [] };
  const live = new Set(state.livePanes);
  const candidates = (await ops.scopes()).filter((s) => s.server === state.server && !live.has(s.pane)).map((s) => s.unit);
  const liveKeys = new Set(state.liveKeys);
  const ended = state.sessionKeys.filter((key) => !liveKeys.has(key));
  for (const key of ended) {
    const unit = (await readFile(scopeFile(key), 'utf8').catch(() => '')).trim();
    if (isPaneScope(unit)) candidates.push(unit);
  }
  candidates.push(...await ops.folderScopes(ended.flatMap(sessionFolders)));
  const scopes = await stoppable(await withNested(candidates, ops), state.livePanes, ops);
  await ops.stop(scopes);
  const temp = await sweepTempRoots(state.sessionKeys);
  return { scopes, temp };
}

/** Short temp roots whose session folder is gone. In-folder temp goes with its folder. */
export async function sweepTempRoots(sessionKeys: Iterable<string>): Promise<string[]> {
  const root = path.join(path.dirname(storeDir('session')), 'tmp');
  const wanted = new Set([...sessionKeys].map((key) => path.basename(shortRoot(key))));
  const removed: string[] = [];
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (wanted.has(name)) continue;
    await rm(path.join(root, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
