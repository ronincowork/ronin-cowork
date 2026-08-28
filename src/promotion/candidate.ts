import { access, symlink } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../stores.js';
import { changedFiles, git, gitOut, isAncestor, mergeInto, revParse, worktreeAddDetached, worktreeList, casRef } from '../desks/git.js';
import type { RepoCandidate } from './receipts.js';

/**
 * THE CANDIDATE — where a team promotion is built and proved before `dev` moves.
 *
 * A funnel point is merged into and never written into (WORKTREES.md). So the merge of
 * the team line into `dev` happens in a throwaway worktree detached at `dev`'s tip: a
 * conflict is contained there and `dev` is untouched; BYOIN runs there against the exact
 * commit that would become `dev`; and only then does the ref move — by compare-and-swap,
 * against the tip the candidate was built on. One candidate worktree per repo target,
 * kept between promotions, reset each time.
 *
 * Where: under Fable 1's `worktrees` store, `.candidates/<repo>/<target>` — beside the
 * desks and out of their way, the layout WORKTREES.md draws.
 */

export interface RepoSpec {
  repo: string;
  dir: string;
  line: string;
  target: string;
}

export const candidateDir = (repo: string, target: string): string =>
  path.join(storeDir('worktrees'), '.candidates', repo, target.replace(/\//g, '__'));

const exists = (p: string): Promise<boolean> => access(p).then(() => true, () => false);

/** Tracked modifications in the mounted funnel worktree — untracked files are not dirt here. */
export async function funnelDirty(dir: string): Promise<string[]> {
  const out = (await git(dir, ['status', '--porcelain', '--untracked-files=no'])).stdout;
  return out.split('\n').filter(Boolean).map((l) => l.slice(3));
}

/**
 * Put the candidate worktree at `sha`, detached, clean. Reuses the folder when it is a
 * registered worktree of this repo; creates it otherwise. A folder that exists but is not
 * a worktree is refused rather than emptied — nothing here deletes what it did not make.
 */
export async function resetCandidate(spec: RepoSpec, sha: string, cdir = candidateDir(spec.repo, spec.target)): Promise<string> {
  const rows = await worktreeList(spec.dir);
  const registered = rows.find((w) => path.resolve(w.path) === path.resolve(cdir));
  if (registered) {
    await git(cdir, ['merge', '--abort']).catch(() => undefined);
    await git(cdir, ['checkout', '--detach', '--quiet', sha]);
    await git(cdir, ['reset', '--hard', '--quiet', sha]);
    await git(cdir, ['clean', '-fdq']);
  } else if (await exists(cdir)) {
    throw new Error(`candidate folder ${cdir} exists but is not a worktree of ${spec.dir} — move it aside`);
  } else {
    await git(spec.dir, ['worktree', 'prune']).catch(() => undefined);
    await worktreeAddDetached(spec.dir, cdir, sha);
  }
  await shareNodeModules(spec.dir, cdir);
  return cdir;
}

/** node_modules from the home checkout, by symlink — the shared store WORKTREES.md costs out. */
async function shareNodeModules(from: string, to: string): Promise<void> {
  const src = path.join(from, 'node_modules');
  const dst = path.join(to, 'node_modules');
  if (!(await exists(src)) || (await exists(dst))) return;
  await symlink(src, dst).catch(() => undefined);
}

export interface PrepareResult {
  candidate: RepoCandidate;
  /** The team line is already in the target — nothing to promote for this repo. */
  nothing: boolean;
  /** Where the candidate is mounted, when it was built. */
  cdir?: string;
}

/**
 * Build one repo's candidate: current `target` + the line's tip, merged in the candidate
 * worktree. Refuses (with the reason on the candidate, not by throwing) when the funnel
 * worktree is dirty, the line does not exist, or the merge conflicts — `dev` is never
 * touched in any of those cases.
 */
export async function prepareCandidate(
  spec: RepoSpec,
  handInsFor: (spec: RepoSpec, from: string, to: string) => Promise<string[]> = derivedHandIns,
): Promise<PrepareResult> {
  const expected_old = await revParse(spec.dir, `refs/heads/${spec.target}`);
  const line_tip = await revParse(spec.dir, `refs/heads/${spec.line}`);
  const base: RepoCandidate = {
    repo: spec.repo,
    dir: spec.dir,
    line: spec.line,
    target: spec.target,
    expected_old,
    line_tip,
    candidate: '',
    hand_in_receipts: [],
    files: [],
    advanced_to: '',
  };
  if (!expected_old) return { candidate: { ...base, refused: `no branch ${spec.target} in ${spec.dir}` }, nothing: false };
  if (!line_tip) return { candidate: { ...base, refused: `no line ${spec.line} in ${spec.dir}` }, nothing: false };
  if (await isAncestor(spec.dir, line_tip, expected_old)) return { candidate: base, nothing: true };

  const dirty = await funnelDirty(spec.dir);
  if (dirty.length) {
    return {
      candidate: { ...base, refused: `${spec.target}'s worktree has unsaved tracked changes — a funnel point is never written into`, conflict_files: dirty },
      nothing: false,
    };
  }

  const cdir = await resetCandidate(spec, expected_old);
  const merge = await mergeInto(cdir, line_tip, `team promotion: ${spec.line} → ${spec.target}`);
  if (!merge.ok) {
    return { candidate: { ...base, refused: 'the merge conflicts', conflict_files: merge.conflicts }, nothing: false, cdir };
  }
  const candidate = await revParse(cdir, 'HEAD');
  return {
    candidate: {
      ...base,
      candidate,
      hand_in_receipts: await handInsFor(spec, expected_old, line_tip),
      files: await changedFiles(spec.dir, expected_old, candidate),
    },
    nothing: false,
    cdir,
  };
}

/**
 * Hand-in ids until Fable 1's ledger answers: the first-parent commits that carried the
 * line from `from` to `to` — one per accepted hand-in, oldest first. `promote.ts` swaps
 * this for the desks ledger's `receiptsForDesk` when it compiles.
 */
export async function derivedHandIns(spec: RepoSpec, from: string, to: string): Promise<string[]> {
  const out = await gitOut(spec.dir, ['rev-list', '--first-parent', '--reverse', `${from}..${to}`]).catch(() => '');
  return out.split('\n').filter(Boolean);
}

export interface AdvanceOutcome {
  ok: boolean;
  /** What the ref held when the swap failed. */
  found?: string;
}

/**
 * Move `target` to the candidate — compare-and-swap against the tip the candidate was
 * built on, then refresh the mounted funnel worktree so the files match the ref. The
 * refresh is `reset --hard` to the new tip, legal only because the worktree was proved
 * clean of tracked changes at prepare time and is checked again here; untracked files
 * are left alone. A moved line is reported, never overwritten.
 */
export async function advanceTarget(c: RepoCandidate): Promise<AdvanceOutcome> {
  if (!c.candidate) return { ok: false, found: '' };
  const dirty = await funnelDirty(c.dir);
  if (dirty.length) return { ok: false, found: await revParse(c.dir, `refs/heads/${c.target}`) };
  const swapped = await casRef(c.dir, c.target, c.candidate, c.expected_old);
  if (!swapped) return { ok: false, found: await revParse(c.dir, `refs/heads/${c.target}`) };
  const mounted = (await worktreeList(c.dir)).find((w) => w.branch === c.target);
  if (mounted) await git(mounted.path, ['reset', '--hard', '--quiet', c.candidate]);
  return { ok: true };
}

/** Is the mounted target at the SHA the receipt says it should be — used by resume. */
export async function targetAt(c: RepoCandidate): Promise<string> {
  return revParse(c.dir, `refs/heads/${c.target}`);
}
