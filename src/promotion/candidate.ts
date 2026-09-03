import { access, symlink } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { changedFiles, git, gitOut, isAncestor, mergeInto, revParse, worktreeAddDetached, worktreeList, casRef } from '../desks/git.js';
import { acceptedSince } from '../desks/receipts.js';
import type { RepoCandidate } from './receipts.js';

export interface RepoSpec {
  repo: string;
  dir: string;
  line: string;
  target: string;
}

export const candidateDir = (repo: string, target: string): string =>
  path.join(storeDir('worktrees'), '.candidates', repo, target.replace(/\//g, '__'));

const exists = (p: string): Promise<boolean> => access(p).then(() => true, () => false);

export async function funnelDirty(dir: string): Promise<string[]> {
  const out = (await git(dir, ['status', '--porcelain', '--untracked-files=no'])).stdout;
  return out.split('\n').filter(Boolean).map((l) => l.slice(3));
}

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

async function shareNodeModules(from: string, to: string): Promise<void> {
  const src = path.join(from, 'node_modules');
  const dst = path.join(to, 'node_modules');
  if (!(await exists(src)) || (await exists(dst))) return;
  await symlink(src, dst).catch(() => undefined);
}

export interface PrepareResult {
  candidate: RepoCandidate;
  nothing: boolean;
  cdir?: string;
}

export interface HandIns { ids: string[]; sessions: string[] }
export type HandInSource = (spec: RepoSpec, from: string, to: string, sinceLineTip: string) => Promise<HandIns>;

export async function prepareCandidate(
  spec: RepoSpec,
  handInsFor: HandInSource = ledgerHandIns,
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

export async function derivedHandIns(spec: RepoSpec, from: string, to: string): Promise<HandIns> {
  const out = await gitOut(spec.dir, ['rev-list', '--first-parent', '--reverse', `${from}..${to}`]).catch(() => '');
  return { ids: out.split('\n').filter(Boolean), sessions: [] };
}

export interface AdvanceOutcome {
  ok: boolean;
  found?: string;
  reason?: 'dirty' | 'raced' | 'no-candidate';
  dirtyFiles?: string[];
}

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

export async function targetAt(c: RepoCandidate): Promise<string> {
  return revParse(c.dir, `refs/heads/${c.target}`);
}
