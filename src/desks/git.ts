import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { envWithoutGitLocation } from '../tegami.js';

const execFileP = promisify(execFile);

export const AUTOMATION_IDENTITY = ['-c', 'user.name=Ronin Promote', '-c', 'user.email=promote@ronin.local'] as const;

export async function stampDeskIdentity(repoDir: string, worktree: string, session: string): Promise<void> {
  await git(repoDir, ['config', 'extensions.worktreeConfig', 'true']);
  await git(worktree, ['config', '--worktree', 'user.name', `Ronin session ${session}`]);
  await git(worktree, ['config', '--worktree', 'user.email', `${session.replace(/[^a-zA-Z0-9._-]/g, '_')}@sessions.ronin.local`]);
}

export class GitError extends Error {
  constructor(readonly args: string[], readonly stderr: string, readonly code: number | string | null, readonly stdout = '') {
    super(`git ${args.join(' ')} failed (${code}): ${stderr.trim()}`);
  }
}

export interface GitResult { stdout: string; stderr: string }

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

export async function worktreeOf(dir: string, branch: string): Promise<WorktreeRow | null> {
  return (await worktreeList(dir)).find((w) => w.branch === branch) ?? null;
}

export async function worktreeAddNew(dir: string, wt: string, branch: string, start: string): Promise<void> {
  await git(dir, ['worktree', 'add', '--no-track', wt, '-b', branch, start]);
}

export async function worktreeAddExisting(dir: string, wt: string, branch: string): Promise<void> {
  await git(dir, ['worktree', 'add', wt, branch]);
}

export async function worktreeAddDetached(dir: string, wt: string, sha: string): Promise<void> {
  await git(dir, ['worktree', 'add', '--detach', wt, sha]);
}

export async function worktreeRemove(dir: string, wt: string, force = false): Promise<void> {
  await git(dir, ['worktree', 'remove', ...(force ? ['--force'] : []), wt]);
}

export const worktreePrune = (dir: string): Promise<GitResult> => git(dir, ['worktree', 'prune']);

export async function setUpstream(dir: string, branch: string, upstream: string): Promise<void> {
  await git(dir, ['branch', `--set-upstream-to=${upstream}`, branch]);
}

export async function dirtyFiles(wt: string): Promise<string[]> {
  const out = (await git(wt, ['status', '--porcelain', '--untracked-files=all'])).stdout;
  return out.split('\n').filter(Boolean).map((l) => {
    const p = l.slice(3);
    const arrow = p.indexOf(' -> ');
    return arrow >= 0 ? p.slice(arrow + 4) : p;
  });
}

export async function aheadBehind(dir: string, tip: string, base: string): Promise<{ ahead: number; behind: number }> {
  try {
    const out = await gitOut(dir, ['rev-list', '--left-right', '--count', `${tip}...${base}`]);
    const [a, b] = out.split(/\s+/).map((n) => Number(n) || 0);
    return { ahead: a ?? 0, behind: b ?? 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export async function changedFiles(dir: string, from: string, to: string): Promise<string[]> {
  if (!from || !to) return [];
  const out = await gitOut(dir, ['diff', '--name-only', `${from}...${to}`]).catch(() => '');
  return out.split('\n').filter(Boolean);
}

export interface MergeOutcome { ok: boolean; conflicts: string[] }

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

export async function resetHardTo(wt: string, ref: string): Promise<boolean> {
  try {
    await git(wt, ['reset', '--hard', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

export async function casRef(dir: string, branch: string, to: string, expected: string): Promise<boolean> {
  try {
    await git(dir, ['update-ref', `refs/heads/${branch}`, to, expected]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteBranch(dir: string, branch: string): Promise<void> {
  await git(dir, ['branch', '-D', branch]);
}

export async function commitAll(wt: string, message: string): Promise<string> {
  await git(wt, ['add', '-A']);
  const staged = await gitOut(wt, ['diff', '--cached', '--name-only']);
  if (!staged) return '';
  await git(wt, [...AUTOMATION_IDENTITY, 'commit', '--no-verify', '-q', '-m', message]);
  return revParse(wt, 'HEAD');
}

export async function isAncestor(dir: string, ancestor: string, tip: string): Promise<boolean> {
  try {
    await git(dir, ['merge-base', '--is-ancestor', ancestor, tip]);
    return true;
  } catch {
    return false;
  }
}
