/**
 * THE GIT FLOOR — every git call the desk machinery makes, sanitized, in one place.
 *
 * Two rules, both learned the hard way elsewhere in this tree: git's location variables
 * override `-C` and are exported to every hook, so they are stripped (`src/tegami.ts`
 * found sessions born under a hook recording the hook's repository); and a ref never
 * moves except by `update-ref` with an expected old value — a compare-and-swap — so a
 * line that moved meanwhile is a reported race, never a silent overwrite.
 *
 * Nothing here decides anything. It runs git and reports.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { envWithoutGitLocation } from '../tegami.js';

const execFileP = promisify(execFile);

/** Machine-authored commits must not depend on a user's or CI runner's global Git config. */
export const AUTOMATION_IDENTITY = ['-c', 'user.name=Ronin', '-c', 'user.email=ronin@localhost'] as const;

export class GitError extends Error {
  constructor(readonly args: string[], readonly stderr: string, readonly code: number | string | null, readonly stdout = '') {
    super(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`);
  }
}

export interface GitResult { stdout: string; stderr: string }

/** Run git in `dir`. Throws GitError on non-zero; the caller decides what that means. */
export async function git(dir: string, args: string[], opts: { timeout?: number } = {}): Promise<GitResult> {
  try {
    const r = await execFileP('git', ['-C', dir, ...args], {
      timeout: opts.timeout ?? 30_000,
      env: envWithoutGitLocation(),
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout: r.stdout, stderr: r.stderr };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string; code?: number | string; stdout?: string };
    throw new GitError(args, String(err.stderr ?? err.message ?? ''), err.code ?? null, String(err.stdout ?? ''));
  }
}

export const gitOut = async (dir: string, args: string[]): Promise<string> => (await git(dir, args)).stdout.trim();

/** The SHA a ref resolves to, or '' when it does not exist. */
export async function revParse(dir: string, ref: string): Promise<string> {
  try {
    return await gitOut(dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    return '';
  }
}

export const branchExists = async (dir: string, branch: string): Promise<boolean> =>
  (await revParse(dir, `refs/heads/${branch}`)) !== '';

export interface WorktreeRow { path: string; head: string; branch: string; detached: boolean; bare: boolean }

/** `git worktree list --porcelain`, parsed. The only honest answer to "does this branch have a folder". */
export async function worktreeList(dir: string): Promise<WorktreeRow[]> {
  const out = (await git(dir, ['worktree', 'list', '--porcelain'])).stdout;
  const rows: WorktreeRow[] = [];
  let cur: WorktreeRow | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), head: '', branch: '', detached: false, bare: false };
      rows.push(cur);
    } else if (!cur) continue;
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
    else if (line === 'detached') cur.detached = true;
    else if (line === 'bare') cur.bare = true;
  }
  return rows;
}

/** The worktree row a branch is checked out in, if any. */
export async function worktreeOf(dir: string, branch: string): Promise<WorktreeRow | null> {
  return (await worktreeList(dir)).find((w) => w.branch === branch) ?? null;
}

/** `git worktree add <path> -b <branch> <start>` — a new branch and its folder, together. */
export async function worktreeAddNew(dir: string, wt: string, branch: string, start: string): Promise<void> {
  await git(dir, ['worktree', 'add', '--no-track', wt, '-b', branch, start]);
}

/** Mount an existing branch at a folder (re-mounting a parked desk). */
export async function worktreeAddExisting(dir: string, wt: string, branch: string): Promise<void> {
  await git(dir, ['worktree', 'add', wt, branch]);
}

/** A detached worktree at a commit — the candidate's shape. */
export async function worktreeAddDetached(dir: string, wt: string, sha: string): Promise<void> {
  await git(dir, ['worktree', 'add', '--detach', wt, sha]);
}

/** Unmount a folder. `force` discards local changes — only a caller that has captured them may pass it. */
export async function worktreeRemove(dir: string, wt: string, force = false): Promise<void> {
  await git(dir, ['worktree', 'remove', ...(force ? ['--force'] : []), wt]);
}

export const worktreePrune = (dir: string): Promise<GitResult> => git(dir, ['worktree', 'prune']);

export async function setUpstream(dir: string, branch: string, upstream: string): Promise<void> {
  await git(dir, ['branch', `--set-upstream-to=${upstream}`, branch]);
}

/** Unsaved changes in a worktree, as `git status --porcelain` paths (renames report the new name). */
export async function dirtyFiles(wt: string): Promise<string[]> {
  const out = (await git(wt, ['status', '--porcelain', '--untracked-files=all'])).stdout;
  return out.split('\n').filter(Boolean).map((l) => {
    const p = l.slice(3);
    const arrow = p.indexOf(' -> ');
    return arrow >= 0 ? p.slice(arrow + 4) : p;
  });
}

/** Commits on `tip` not on `base`, and the reverse. */
export async function aheadBehind(dir: string, tip: string, base: string): Promise<{ ahead: number; behind: number }> {
  try {
    const out = await gitOut(dir, ['rev-list', '--left-right', '--count', `${tip}...${base}`]);
    const [a, b] = out.split(/\s+/).map((n) => Number(n) || 0);
    return { ahead: a ?? 0, behind: b ?? 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

/** Files that differ between two commits — the overlap check's input. */
export async function changedFiles(dir: string, from: string, to: string): Promise<string[]> {
  if (!from || !to) return [];
  const out = await gitOut(dir, ['diff', '--name-only', `${from}...${to}`]).catch(() => '');
  return out.split('\n').filter(Boolean);
}

export interface MergeOutcome { ok: boolean; conflicts: string[] }

/**
 * Merge `ref` into the worktree at `wt`, no editor. On conflict the merge is aborted so
 * the worktree is left exactly as found, and the conflicting files are reported.
 */
export async function mergeInto(wt: string, ref: string, message?: string): Promise<MergeOutcome> {
  try {
    await git(wt, [...AUTOMATION_IDENTITY, 'merge', '--no-edit', ...(message ? ['-m', message] : []), ref]);
    return { ok: true, conflicts: [] };
  } catch {
    const out = await gitOut(wt, ['diff', '--name-only', '--diff-filter=U']).catch(() => '');
    const conflicts = out.split('\n').filter(Boolean);
    await git(wt, ['merge', '--abort']).catch(() => undefined);
    return { ok: false, conflicts };
  }
}

/**
 * Bring a mounted line's worktree to its ref. NOT `merge --ff-only`: `update-ref` on a
 * branch that is checked out here has already moved this worktree's HEAD from under it,
 * leaving the old tree in the index (every changed file shows as a staged deletion) and
 * a fast-forward with nothing to do. `reset --hard <ref>` is right in both cases — and is
 * only ever called on a worktree the caller has just verified clean, under the line's lock.
 */
export async function resetHardTo(wt: string, ref: string): Promise<boolean> {
  try {
    await git(wt, ['reset', '--hard', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * COMPARE-AND-SWAP on a ref: move `refs/heads/<branch>` to `to` only if it is at
 * `expected` right now. Returns false when the line moved meanwhile — the caller
 * re-queues against the new tip. Never force, never overwrite.
 */
export async function casRef(dir: string, branch: string, to: string, expected: string): Promise<boolean> {
  try {
    await git(dir, ['update-ref', `refs/heads/${branch}`, to, expected]);
    return true;
  } catch {
    return false;
  }
}

/** Delete a branch ref outright — only after its tip is integrated, archived or explicitly discarded. */
export async function deleteBranch(dir: string, branch: string): Promise<void> {
  await git(dir, ['branch', '-D', branch]);
}

/** Stage everything and commit; returns the new SHA, or '' when there was nothing to commit. */
export async function commitAll(wt: string, message: string): Promise<string> {
  await git(wt, ['add', '-A']);
  const staged = await gitOut(wt, ['diff', '--cached', '--name-only']);
  if (!staged) return '';
  await git(wt, [...AUTOMATION_IDENTITY, 'commit', '--no-verify', '-q', '-m', message]);
  return revParse(wt, 'HEAD');
}

/** Is `ancestor` reachable from `tip`? — "is this tip integrated into the line". */
export async function isAncestor(dir: string, ancestor: string, tip: string): Promise<boolean> {
  try {
    await git(dir, ['merge-base', '--is-ancestor', ancestor, tip]);
    return true;
  } catch {
    return false;
  }
}
