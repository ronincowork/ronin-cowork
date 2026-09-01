import { access, symlink } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../stores.js';
import { changedFiles, git, gitOut, isAncestor, mergeInto, revParse, worktreeAddDetached, worktreeList, casRef } from '../desks/git.js';
import { acceptedSince } from '../desks/receipts.js';
import type { RepoCandidate } from './receipts.js';

/**
 * THE CANDIDATE — where a team promotion is built and proved before `dev` moves.
 *
 * A funnel point is kept clear for reviewed integration (docs/worktrees.md). So the merge of
 * the team line into `dev` happens in a throwaway worktree detached at `dev`'s tip: a
 * conflict is contained there and `dev` is untouched; BYOIN runs there against the exact
 * commit that would become `dev`; and only then does the ref move — by compare-and-swap,
 * against the tip the candidate was built on. One candidate worktree per repo target,
 * kept between promotions, reset each time.
 *
 * Where: under Fable 1's `worktrees` store, `.candidates/<repo>/<target>` — beside the
 * desks and out of their way, the layout docs/worktrees.md draws.
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

/** node_modules from the home checkout, by symlink — the shared store docs/worktrees.md costs out. */
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
export interface HandIns { ids: string[]; sessions: string[] }
export type HandInSource = (spec: RepoSpec, from: string, to: string, sinceLineTip: string) => Promise<HandIns>;

export async function prepareCandidate(
  spec: RepoSpec,
  handInsFor: HandInSource = ledgerHandIns,
  /** The line tip the last complete promotion of this repo carried — where the ledger read starts. */
  sinceLineTip = '',
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
    sessions: [],
    files: [],
    advanced_to: '',
  };
  if (!expected_old) return { candidate: { ...base, refused: `no branch ${spec.target} in ${spec.dir}` }, nothing: false };
  if (!line_tip) return { candidate: { ...base, refused: `no line ${spec.line} in ${spec.dir}` }, nothing: false };
  if (await isAncestor(spec.dir, line_tip, expected_old)) return { candidate: base, nothing: true };

  const dirty = await funnelDirty(spec.dir);
  if (dirty.length) {
    return {
      candidate: { ...base, refused: `${spec.target}'s worktree has unsaved tracked changes — this reviewed integration line must be clean; diagnose and preserve the work before promotion`, conflict_files: dirty },
      nothing: false,
    };
  }

  const cdir = await resetCandidate(spec, expected_old);
  // Commit messages leave the box when the target branch is pushed. Keep the local
  // team/line identity in the private ledger, never in repository history.
  const merge = await mergeInto(cdir, line_tip, `Promote accepted team work to ${spec.target}`);
  if (!merge.ok) {
    return { candidate: { ...base, refused: 'the merge conflicts', conflict_files: merge.conflicts }, nothing: false, cdir };
  }
  const candidate = await revParse(cdir, 'HEAD');
  const handIns = await handInsFor(spec, expected_old, line_tip, sinceLineTip);
  return {
    candidate: {
      ...base,
      candidate,
      hand_in_receipts: handIns.ids,
      sessions: handIns.sessions,
      files: await changedFiles(spec.dir, expected_old, candidate),
    },
    nothing: false,
    cdir,
  };
}

/**
 * The hand-ins a candidate carries, from the desks ledger (Fable 1's `acceptedSince`):
 * every accepted receipt on the line after the tip the last complete promotion carried,
 * kept only if its resulting line SHA is actually in the tip being promoted. A line with
 * no ledger rows (it predates the ledger, or was advanced by hand) falls back to the
 * first-parent commits — one per hand-in, oldest first — so attribution is never empty
 * when git can still answer.
 */
export async function ledgerHandIns(spec: RepoSpec, from: string, to: string, sinceLineTip: string): Promise<HandIns> {
  const rows = await acceptedSince(spec.repo, spec.line, sinceLineTip).catch(() => []);
  const ids: string[] = [];
  const sessions = new Set<string>();
  for (const r of rows) {
    if (r.line_sha && !(await isAncestor(spec.dir, r.line_sha, to))) continue;
    ids.push(r.id);
    if (r.session) sessions.add(r.session);
  }
  if (ids.length) return { ids, sessions: [...sessions] };
  return derivedHandIns(spec, from, to);
}

/** The git-only answer: first-parent commits that carried the line from `from` to `to`. */
export async function derivedHandIns(spec: RepoSpec, from: string, to: string): Promise<HandIns> {
  const out = await gitOut(spec.dir, ['rev-list', '--first-parent', '--reverse', `${from}..${to}`]).catch(() => '');
  return { ids: out.split('\n').filter(Boolean), sessions: [] };
}

export interface AdvanceOutcome {
  ok: boolean;
  /** What the ref held when the swap failed. */
  found?: string;
  /** WHY it failed — three refusals that must not share one sentence (measured
   *  2026-09-01, receipts …-jodz/…-95or/…-wp3x: a funnel gone dirty mid-run was
   *  reported as "moved to X while expected at X", the sha compared to itself).
   *  `dirty` — the funnel worktree grew unsaved tracked changes between prepare and
   *  advance; the ref never moved and the candidate is still built on the live tip.
   *  `raced` — the compare-and-swap lost: the ref genuinely moved.
   *  `no-candidate` — nothing was built to advance to. */
  reason?: 'dirty' | 'raced' | 'no-candidate';
  /** The files funnelDirty saw, when reason is 'dirty'. */
  dirtyFiles?: string[];
}

/**
 * Move `target` to the candidate — compare-and-swap against the tip the candidate was
 * built on, then refresh the mounted funnel worktree so the files match the ref. The
 * refresh is `reset --hard` to the new tip, legal only because the worktree was proved
 * clean of tracked changes at prepare time and is checked again here; untracked files
 * are left alone. A moved line is reported, never overwritten.
 */
export async function advanceTarget(c: RepoCandidate): Promise<AdvanceOutcome> {
  if (!c.candidate) return { ok: false, found: '', reason: 'no-candidate' };
  const dirty = await funnelDirty(c.dir);
  if (dirty.length) return { ok: false, found: await revParse(c.dir, `refs/heads/${c.target}`), reason: 'dirty', dirtyFiles: dirty };
  const swapped = await casRef(c.dir, c.target, c.candidate, c.expected_old);
  if (!swapped) return { ok: false, found: await revParse(c.dir, `refs/heads/${c.target}`), reason: 'raced' };
  const mounted = (await worktreeList(c.dir)).find((w) => w.branch === c.target);
  if (mounted) await git(mounted.path, ['reset', '--hard', '--quiet', c.candidate]);
  return { ok: true };
}

/** Is the mounted target at the SHA the receipt says it should be — used by resume. */
export async function targetAt(c: RepoCandidate): Promise<string> {
  return revParse(c.dir, `refs/heads/${c.target}`);
}
