import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { envWithoutGitLocation, type TegamiCheckout } from './tegami.js';
import type { DeskStatus, PendingUpdate } from './desks/schema.js';

const exec = promisify(execFile);

export type DeskReadout = 'open' | 'parked' | 'unknown';

export interface DeskState {
  repo: string;
  root: string;
  short: string;
  branch: string;
  worktree: string | null;
  mounted: boolean;
  tip: string;
  line: string | null;
  line_tip: string;
  ahead: number | null;
  behind: number | null;
  dirty: boolean | null;
  dirty_files: string[];
  readout: DeskReadout;
  session: string;
  pending: PendingUpdate | null;
  last_hand_in: string;
  blocked: string;
  source: 'registry' | 'git';
}

export interface DeskRollup {
  desks: number;
  private: number;
  dirty: number;
  pending: number;
  parked: number;
  blocked: number;
  lined: number;
}

export interface RepoLocation {
  root: string;
  dir: string;
}

export type LocateRepo = (repo: string) => Promise<RepoLocation | null>;

export function sameDesk(recorded: DeskState, entry: TegamiCheckout, at: RepoLocation | null): boolean {
  if (recorded.branch !== entry.branch) return false;
  if (at?.root && recorded.root === at.root) return true;
  return recorded.repo === entry.repo;
}

export const shortRepo = (repo: string): string =>
  String(repo || '').replace(/\.git$/, '').split('/').filter(Boolean).pop() || repo;

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', dir, ...args], { timeout: 4_000, env: envWithoutGitLocation() });
  return stdout.trim();
}

const revOf = (dir: string, ref: string): Promise<string> =>
  git(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).catch(() => '');

async function worktreesOf(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let raw = '';
  try {
    raw = await git(dir, ['worktree', 'list', '--porcelain']);
  } catch {
    return out;
  }
  let cur = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) cur = line.slice('worktree '.length);
    else if (line.startsWith('branch refs/heads/') && cur) out.set(line.slice('branch refs/heads/'.length), cur);
  }
  return out;
}

async function lineOf(dir: string, branch: string): Promise<string | null> {
  try {
    const up = await git(dir, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    if (up) return up.replace(/^origin\//, '');
  } catch {
  }
  const m = branch.match(/^team\/([^/]+)\/([^/]+)$/);
  const implied = m ? (m[2] === 'dev' ? null : `team/${m[1]}/dev`) : branch.startsWith('solo/') ? 'dev' : null;
  if (!implied) return null;
  return (await revOf(dir, `refs/heads/${implied}`)) ? implied : null;
}

export async function deriveDesk(entry: TegamiCheckout, at: RepoLocation | null, session: string): Promise<DeskState> {
  const d: DeskState = {
    repo: entry.repo,
    root: at?.root ?? '',
    short: shortRepo(entry.repo),
    branch: entry.branch,
    worktree: entry.worktree ?? null,
    mounted: false,
    tip: '',
    line: entry.line ?? null,
    line_tip: '',
    ahead: null,
    behind: null,
    dirty: null,
    dirty_files: [],
    readout: 'unknown',
    session,
    pending: null,
    last_hand_in: '',
    blocked: '',
    source: 'git',
  };
  if (!at || !entry.branch) return d;
  const dir = at.dir;
  try {
    d.tip = await revOf(dir, `refs/heads/${entry.branch}`);
    d.worktree = d.worktree || (await worktreesOf(dir)).get(entry.branch) || null;
    d.line = d.line || (await lineOf(dir, entry.branch));
    if (d.line) {
      d.line_tip = await revOf(dir, `refs/heads/${d.line}`);
      const counts = await git(dir, ['rev-list', '--left-right', '--count', `${d.line}...${entry.branch}`]).catch(() => '');
      const [b, a] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        d.ahead = a;
        d.behind = b;
      }
    }
    if (d.worktree) {
      const status = await git(d.worktree, ['status', '--porcelain', '--untracked-files=normal']).catch(() => null);
      if (status !== null) {
        d.mounted = true;
        d.dirty_files = status ? status.split('\n').filter(Boolean).map((l) => l.slice(3)) : [];
        d.dirty = d.dirty_files.length > 0;
        d.readout = 'open';
      } else {
        d.worktree = null; // recorded, but not on disk: a parked desk's folder went
      }
    }
    if (!d.mounted) d.readout = d.tip ? 'parked' : 'unknown';
  } catch {
  }
  return d;
}

export function fromStatus(st: DeskStatus): DeskState {
  return {
    repo: st.repo,
    root: st.root || st.repo,
    short: shortRepo(st.repo),
    branch: st.branch,
    worktree: st.mounted ? st.worktree : null,
    mounted: st.mounted,
    tip: st.tip,
    line: st.line || null,
    line_tip: st.line_tip,
    ahead: st.line ? st.ahead : null,
    behind: st.line ? st.behind : null,
    dirty: st.mounted ? st.dirty : null,
    dirty_files: st.dirty_files,
    readout: st.state === 'parked' ? 'parked' : st.tip ? 'open' : 'unknown',
    session: st.session,
    pending: st.pending,
    last_hand_in: st.last_hand_in,
    blocked: st.blocked,
    source: 'registry',
  };
}

export function rollup(desks: DeskState[]): DeskRollup {
  const r: DeskRollup = { desks: desks.length, private: 0, dirty: 0, pending: 0, parked: 0, blocked: 0, lined: 0 };
  for (const d of desks) {
    if (d.line) r.lined++;
    if (d.ahead) r.private += d.ahead;
    if (d.dirty) r.dirty++;
    if (d.pending) r.pending++;
    if (d.readout === 'parked') r.parked++;
    if (d.blocked) r.blocked++;
  }
  return r;
}

export function locatorFrom(roots: { name: string; dir: string; remote: string }[]): LocateRepo {
  return async (repo) => {
    const want = repo.replace(/\.git$/, '');
    for (const r of roots) {
      if (r.remote.replace(/\.git$/, '') === want || r.dir === want) return { root: r.name, dir: r.dir };
    }
    return null;
  };
}
