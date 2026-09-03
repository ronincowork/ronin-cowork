/**
 * DESK STATE — the mechanical facts about a session's desks, DERIVED, never prose.
 *
 * The desk surface (docs/worktrees.md "Multi-desk
 * sessions"). A desk is repository-specific: one repo's branch and the worktree mounted
 * on it. The letter's `repos[]` names the desks a session is working at (`repo` +
 * `branch`, optionally `worktree` and `line` when a tool opened the desk); everything
 * else the owner and the lead want to see about a desk — dirty, ahead/behind its line,
 * parked, pending an update, last accepted hand-in, blocked — is a fact git or the desk
 * registry already knows. Asking an agent to keep those in its letter is how a readout
 * goes stale, so this module reads them at the moment they are asked for.
 *
 * TWO SOURCES, ONE SHAPE. A desk the registry recorded (Track 1, Fable 1 — `src/desks/`)
 * is read through the registry's own `DeskStatus`, which already derives tip, dirt and
 * ahead/behind from git and adds what only the registry knows: pending update, last
 * accepted hand-in, a standing block, parked. A repo the letter lists that the registry
 * has no row for (today's shared checkout; a session that added a repo by hand) is
 * derived from git here, and its registry-only facts are null — never invented. Field
 * names follow `DeskStatus` so every surface reads one shape, whichever answered.
 *
 * HONEST ON A PLAIN CHECKOUT. A session on today's shared `dev` checkout has one
 * "desk" whose branch is `dev` with no team line: `line` is null, ahead/behind are
 * null, and the roll-up says `1 desk` and nothing about hand-ins. Manual terminals and
 * direct repositories get no invented desk state.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { envWithoutGitLocation, type TegamiCheckout } from './tegami.js';
import type { DeskStatus, PendingUpdate } from './desks/schema.js';

const exec = promisify(execFile);

/** `open`/`parked` are the registry's words (`schema.ts`); `unknown` is git's silence. */
export type DeskReadout = 'open' | 'parked' | 'unknown';

/** One desk, derived. */
export interface DeskState {
  /** The letter's identity for the repo — a remote URL or a path — or the root name for a registry desk. */
  repo: string;
  /** The project_root this repo is known by, when known; '' otherwise. */
  root: string;
  /** The short repository name — `ronin-cowork` — for a label. */
  short: string;
  branch: string;
  /** Path of the worktree on this branch, or null (parked / unknown). */
  worktree: string | null;
  mounted: boolean;
  /** The desk's tip, or '' when git could not say. */
  tip: string;
  /** The line this desk hands in to (its upstream), or null when it has none. */
  line: string | null;
  line_tip: string;
  /** Commits on the desk not on its line — "private" — or null with no line. */
  ahead: number | null;
  /** Commits on the line not on the desk, or null with no line. */
  behind: number | null;
  /** True when the worktree has changed or untracked files; null when unmounted. */
  dirty: boolean | null;
  dirty_files: string[];
  readout: DeskReadout;
  /** The session the desk belongs to. */
  session: string;
  /** Registry-only facts — null / '' when no registry row answered. */
  pending: PendingUpdate | null;
  last_hand_in: string;
  blocked: string;
  /** Which source answered. */
  source: 'registry' | 'git';
}

/** The per-session roll-up the tile and roster show: `2 desks · 1 pending · 3 private`. */
export interface DeskRollup {
  desks: number;
  /** Sum of `ahead` across desks with a line — commits nobody else can see yet. */
  private: number;
  dirty: number;
  pending: number;
  parked: number;
  blocked: number;
  /** Desks with a line at all — a plain checkout counts as a desk but not here. */
  lined: number;
}

/** Where a repo identity resolves: a root name and a directory to ask git in. */
export interface RepoLocation {
  root: string;
  dir: string;
}

/** The locator seam: repo identity → where to ask, or null when this box has no such repo. */
export type LocateRepo = (repo: string) => Promise<RepoLocation | null>;

/** Does a TEGAMI checkout name a desk the registry already supplied? Root identity is
 * strongest; exact repo+branch is the safe fallback when the locator is silent. */
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

/** Every worktree of the repository at `dir`, by the branch each has checked out. */
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

/**
 * The line a desk hands in to. The upstream, when set (a tool-opened desk has its line
 * as upstream — docs/worktrees.md); else the name the branch path implies, only if that ref
 * exists (`team/<t>/<s>` → `team/<t>/dev`, `solo/<s>` → `dev`). A plain branch has none.
 */
async function lineOf(dir: string, branch: string): Promise<string | null> {
  try {
    const up = await git(dir, ['rev-parse', '--abbrev-ref', `${branch}@{upstream}`]);
    if (up) return up.replace(/^origin\//, '');
  } catch {
    /* no upstream */
  }
  const m = branch.match(/^team\/([^/]+)\/([^/]+)$/);
  const implied = m ? (m[2] === 'dev' ? null : `team/${m[1]}/dev`) : branch.startsWith('solo/') ? 'dev' : null;
  if (!implied) return null;
  return (await revOf(dir, `refs/heads/${implied}`)) ? implied : null;
}

/** One desk's git facts, from the checkout entry the letter carries. */
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
    // A branch with no mounted worktree is a parked desk when the branch exists; a
    // branch nobody has is unknown, not invented.
    if (!d.mounted) d.readout = d.tip ? 'parked' : 'unknown';
  } catch {
    /* git could not answer; what is filled in is the honest readout */
  }
  return d;
}

/** The registry's status in this shape — the same fields, plus what only it knows. */
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

/** The numbers the tile and roster roll up. */
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

/**
 * A locator over the project-root catalog: a repo identity matches a root by remote
 * (with or without `.git`) or by directory. Injectable so tests never depend on this
 * box's roots.
 */
export function locatorFrom(roots: { name: string; dir: string; remote: string }[]): LocateRepo {
  return async (repo) => {
    const want = repo.replace(/\.git$/, '');
    for (const r of roots) {
      if (r.remote.replace(/\.git$/, '') === want || r.dir === want) return { root: r.name, dir: r.dir };
    }
    return null;
  };
}
