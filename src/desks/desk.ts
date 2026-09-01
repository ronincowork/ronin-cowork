/**
 * THE DESK LIFECYCLE — open, status, sync, park, close, discard, recover.
 *
 * A desk opens at once — no clock, no approval wait (ruled 2026-08-28: "yikes"). It is
 * cut from its team's line, its upstream is that line, and it is recorded in the registry
 * before anything else happens. Funnel points are never desks: opening one on `dev`,
 * `team/<t>/dev` or the stable line is refused by name. A repo whose `.git` sits inside a
 * Syncthing share with `.git` not ignored is refused too (WORKTREES §0): worktree metadata
 * holds absolute paths, and a synced `.git` cannot hold a desk.
 *
 * Closing never loses work and never publishes it: unsaved files become a `WIP:` commit on
 * the desk's own branch; a desk with commits ahead of its line is PARKED (branch kept,
 * worktree may be unmounted, recorded with owner and ahead count); only a desk whose tip
 * is already on the line is deleted. Discard is a separate, explicit call.
 *
 * Everything here is a single-desk operation. Serialization, candidates and receipts are
 * `hand-in.ts`'s; this file never moves a line.
 */
import { access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { arrangementOf, desksManaged } from './arrangement.js';
import {
  branchExists, commitAll, deleteBranch, resetHardTo, git, isAncestor, mergeInto, revParse, setUpstream,
  worktreeAddExisting, worktreeAddNew, worktreeOf, worktreePrune, worktreeRemove, changedFiles, dirtyFiles, stampDeskIdentity,
} from './git.js';
import {
  deriveAssignment, deskStatus, deskWorktree, lineFor, listDeskRecords, readDesk, removeDesk, updateDesk,
  writeAssignment, writeDesk,
} from './registry.js';
import type { Assignment, DeskNotice, DeskRecord, DeskStatus, RepoArrangement, RepoDesk, TeamLine } from './schema.js';

export class DeskRefused extends Error {}

/** WORKTREES §0: a `.git` two-way synced by Syncthing corrupts under a second writer and cannot hold worktrees. */
export async function syncthingHazard(dir: string): Promise<string> {
  let d = path.resolve(dir);
  for (;;) {
    if (existsSync(path.join(d, '.stfolder'))) {
      const ignore = await readFile(path.join(d, '.stignore'), 'utf8').catch(() => '');
      const ignored = ignore.split('\n').some((l) => /^\s*(\(\?d\))?\/?\.git\s*$/.test(l));
      return ignored ? '' : `${d} is a Syncthing share whose .stignore does not exclude .git — add it on every machine before opening a desk here`;
    }
    const up = path.dirname(d);
    if (up === d) return '';
    d = up;
  }
}

const isFunnel = (a: RepoArrangement, line: TeamLine, branch: string): boolean =>
  branch === line.branch || branch === a.working || branch === a.stable;

/** Make sure the team's line exists and is mounted; a rōnin's line is `dev` at the home checkout. */
export async function ensureLine(a: RepoArrangement, team: string): Promise<TeamLine> {
  const line = lineFor(a, team);
  if (!team) return line;
  if (!(await branchExists(a.dir, line.branch))) {
    const base = await revParse(a.dir, `refs/heads/${a.working}`);
    if (!base) throw new DeskRefused(`${a.repo}: working line '${a.working}' does not exist`);
    await git(a.dir, ['branch', line.branch, base]);
  }
  const wt = await worktreeOf(a.dir, line.branch);
  if (!wt) {
    await worktreePrune(a.dir);
    await worktreeAddExisting(a.dir, line.worktree, line.branch);
  } else {
    line.worktree = wt.path;
  }
  return line;
}

/** Node modules from the home checkout, if the desk has none — the "shared store" in its cheapest true form. */
async function linkNodeModules(a: RepoArrangement, wt: string): Promise<void> {
  const src = path.join(a.dir, 'node_modules');
  const dst = path.join(wt, 'node_modules');
  try {
    await access(src);
  } catch {
    return;
  }
  if (existsSync(dst)) return;
  const { symlink } = await import('node:fs/promises');
  await symlink(src, dst, 'dir').catch(() => undefined);
}

export interface OpenInput { repo: string; session: string; team: string; assignment?: string; branch?: string }

/**
 * Open a desk: record it, cut the branch from the line, mount the worktree, set upstream.
 * Idempotent: an open desk is returned as it is; a parked one is remounted and reopened;
 * a leftover branch with no record is adopted as this session's desk rather than lost.
 */
export async function openDesk(input: OpenInput): Promise<DeskStatus> {
  const a = await arrangementOf(input.repo);
  if (!desksManaged(a)) {
    throw new DeskRefused(`${a.repo} is ${a.source === 'absent' ? 'not declared (no RONIN_REPO)' : `${a.mode}, desks=${a.desks}`} — no desk; work in the checkout at ${a.dir}`);
  }
  const hazard = await syncthingHazard(a.dir);
  if (hazard) throw new DeskRefused(hazard);
  const line = await ensureLine(a, input.team);
  const derived = (await deriveAssignment({ session: input.session, team: input.team, project_root: input.repo }))
    .desks.find((d) => d.repo === input.repo);
  const branch = input.branch || derived?.branch;
  if (!branch) throw new DeskRefused(`${a.repo}: could not derive a desk branch for ${input.session}`);
  if (isFunnel(a, line, branch)) throw new DeskRefused(`${branch} is the reviewed integration line. Open a managed desk so your work has a safe hand-in path.`);

  const existing = await readDesk(a.repo, branch);
  const wtPath = existing?.worktree || deskWorktree(a.repo, branch);
  const mounted = await worktreeOf(a.dir, branch);
  if (!mounted) {
    await worktreePrune(a.dir);
    if (await branchExists(a.dir, branch)) await worktreeAddExisting(a.dir, wtPath, branch);
    else await worktreeAddNew(a.dir, wtPath, branch, line.branch);
  }
  await setUpstream(a.dir, branch, line.branch).catch(() => undefined);
  await stampDeskIdentity(a.dir, mounted?.path ?? wtPath, input.session);
  await linkNodeModules(a, mounted?.path ?? wtPath);

  const rec: DeskRecord = existing
    ? { ...existing, session: input.session, team: input.team, assignment: input.assignment ?? existing.assignment, state: 'open', parked_at: undefined, worktree: mounted?.path ?? wtPath }
    : {
        repo: a.repo, root: a.repo, branch, worktree: mounted?.path ?? wtPath, line: line.branch, mode: a.mode,
        session: input.session, team: input.team, assignment: input.assignment ?? derived?.assignment ?? '',
        state: 'open', opened_at: new Date().toISOString(), pending: null, last_hand_in: '', blocked: '',
      };
  await writeDesk(rec);
  return deskStatus(rec, a);
}

/**
 * DOWNWARD ADOPTION of the line into one desk — the one function both `desk sync` and an
 * accepted hand-in use. Clean and mounted: merge the line in now. Dirty, or unmounted:
 * record PENDING with the overlap (line-changed files this desk also has unsaved), touch
 * nothing. A clean desk whose commits conflict with the line is left as it is too — the
 * conflict is contained at its own hand-in — and told.
 */
export async function adoptLine(rec: DeskRecord, a: RepoArrangement, by: string): Promise<DeskNotice> {
  const st = await deskStatus(rec, a);
  const line_sha = st.line_tip;
  const base: DeskNotice = { kind: 'adopted', repo: rec.repo, desk: rec.branch, session: rec.session, line_sha, by, files: [] };
  if (!line_sha || !st.tip) return { ...base, kind: 'pending' };
  if (st.behind === 0) {
    if (rec.pending) await updateDesk(rec.repo, rec.branch, { pending: null });
    return base;
  }
  if (!st.mounted || st.dirty) {
    const lineChanged = await changedFiles(a.dir, st.tip, line_sha);
    const overlap = lineChanged.filter((f) => st.dirty_files.includes(f));
    await updateDesk(rec.repo, rec.branch, { pending: { line_sha, by, at: new Date().toISOString(), overlap } });
    return { ...base, kind: overlap.length ? 'pending_overlap' : 'pending', files: overlap };
  }
  const m = await mergeInto(st.worktree, rec.line, `Adopt ${rec.line} into ${rec.branch}`);
  if (!m.ok) {
    await updateDesk(rec.repo, rec.branch, { pending: { line_sha, by, at: new Date().toISOString(), overlap: m.conflicts } });
    return { ...base, kind: 'conflict', files: m.conflicts };
  }
  await updateDesk(rec.repo, rec.branch, { pending: null });
  return base;
}

/** `desk sync` by hand. */
export async function syncDesk(repo: string, branch: string): Promise<DeskNotice> {
  const rec = await readDesk(repo, branch);
  if (!rec) throw new DeskRefused(`no desk recorded for ${repo}:${branch}`);
  return adoptLine(rec, await arrangementOf(repo), rec.pending?.by ?? '');
}

export interface CloseOutcome { desk: DeskStatus | null; action: 'parked' | 'deleted' | 'kept'; wip: string; unmounted: boolean }

/**
 * `desk close` / park: capture unsaved files in a `WIP:` commit, park the desk if it is
 * ahead of its line, delete it only if its tip is already on the line. `unmount` takes
 * the worktree folder away (the branch stays). Nothing here publishes.
 */
export async function closeDesk(repo: string, branch: string, opts: { unmount?: boolean; wipMessage?: string } = {}): Promise<CloseOutcome> {
  const rec = await readDesk(repo, branch);
  if (!rec) throw new DeskRefused(`no desk recorded for ${repo}:${branch}`);
  const a = await arrangementOf(repo);
  let st = await deskStatus(rec, a);
  let wip = '';
  if (st.mounted && st.dirty) {
    wip = await commitAll(st.worktree, opts.wipMessage || `WIP: ${rec.session} closed ${branch} with unsaved files`);
    st = await deskStatus(rec, a);
  }
  const integrated = !!st.tip && !!st.line_tip && (await isAncestor(a.dir, st.tip, st.line_tip));
  if (integrated) {
    if (st.mounted) await worktreeRemove(a.dir, st.worktree, false).catch(() => worktreeRemove(a.dir, st.worktree, true));
    await deleteBranch(a.dir, branch);
    await removeDesk(repo, branch);
    return { desk: null, action: 'deleted', wip, unmounted: true };
  }
  let unmounted = false;
  if (opts.unmount && st.mounted) {
    await worktreeRemove(a.dir, st.worktree, false);
    unmounted = true;
  }
  const parked = await updateDesk(repo, branch, { state: 'parked', parked_at: new Date().toISOString() });
  return { desk: await deskStatus(parked, a), action: 'parked', wip, unmounted };
}

/** EXPLICIT discard — the only path that deletes an unintegrated tip. The caller has said so. */
export async function discardDesk(repo: string, branch: string): Promise<void> {
  const rec = await readDesk(repo, branch);
  const a = await arrangementOf(repo);
  const wt = await worktreeOf(a.dir, branch);
  if (wt) await worktreeRemove(a.dir, wt.path, true);
  if (await branchExists(a.dir, branch)) await deleteBranch(a.dir, branch);
  if (rec) await removeDesk(repo, branch);
}

/** Reassign a parked desk to a session and remount it — the lead's "reassign" choice. */
export async function recoverDesk(repo: string, branch: string, session: string): Promise<DeskStatus> {
  const rec = await readDesk(repo, branch);
  if (!rec) throw new DeskRefused(`no desk recorded for ${repo}:${branch}`);
  return openDesk({ repo, session, team: rec.team, assignment: rec.assignment, branch });
}

/** Parked desks — the lead's list: gone sessions' work, ahead counts, last activity. */
export async function parkedDesks(filter: { repo?: string; team?: string } = {}): Promise<DeskStatus[]> {
  const recs = (await listDeskRecords(filter)).filter((r) => r.state === 'parked');
  const out: DeskStatus[] = [];
  for (const r of recs) out.push(await deskStatus(r, await arrangementOf(r.repo)));
  return out;
}

/**
 * THE LAUNCH SEAM (Track 3 consumes this): resolve a session's assignment and OPEN every
 * desk in it before the agent is spawned. A repo that takes no managed desk contributes
 * none — a direct repo, or one with no RONIN_REPO, gets no invented state. A failure to
 * open is thrown, visibly; launch must not fall back to a funnel checkout on its own.
 */
export async function resolveAssignmentDesks(input: { session: string; team: string; project_root: string }): Promise<Assignment> {
  const derived = await deriveAssignment(input);
  const desks: RepoDesk[] = [];
  for (const d of derived.desks) {
    const st = await openDesk({ repo: d.repo, session: input.session, team: input.team, assignment: derived.id, branch: d.branch });
    desks.push({
      repo: st.repo, root: st.root, branch: st.branch, worktree: st.worktree, line: st.line, mode: st.mode,
      session: st.session, team: st.team, assignment: st.assignment, state: st.state, opened_at: st.opened_at,
    });
  }
  const a: Assignment = { ...derived, desks };
  if (desks.length) await writeAssignment(a);
  return a;
}

/** Refresh the mounted line worktree to its ref. Only called on a worktree verified clean under the line's lock. */
export const refreshLine = (line: TeamLine): Promise<boolean> =>
  existsSync(line.worktree) ? resetHardTo(line.worktree, `refs/heads/${line.branch}`) : Promise.resolve(false);

/** Is the line's mounted worktree clean? A hand-in into a dirty funnel worktree is refused. */
export const lineDirty = async (line: TeamLine): Promise<string[]> =>
  existsSync(line.worktree) ? dirtyFiles(line.worktree).catch(() => []) : [];
