import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { arrangementOf, desksManaged } from './arrangement.js';
import {
  branchExists, deleteBranch, resetHardTo, git, isAncestor, mergeInto, revParse, setUpstream,
  worktreeAddExisting, worktreeAddNew, worktreeOf, worktreePrune, worktreeRemove, changedFiles, dirtyFiles, stampDeskIdentity,
} from './git.js';
import {
  assignmentId, deskStatus, deskWorktree, lineFor, listDeskRecords, readDesk, removeDesk, updateDesk,
  writeDesk,
} from './registry.js';
import { soloDeskBranch, teamDeskBranch, type DeskNotice, type DeskRecord, type DeskStatus, type RepoArrangement, type TeamLine } from './schema.js';
import { materializeNodeModules } from '../worktree-runtime.js';
import { withManagedTransaction } from './lifecycle-ledger.js';

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

export async function ensureLine(a: RepoArrangement, team: string): Promise<TeamLine> {
  const line = lineFor(a, team);
  if (!team) return line;
  if (!(await branchExists(a.dir, line.branch))) {
    const base = await revParse(a.dir, `refs/heads/${a.working}`);
    if (!base) {
      console.warn(`${a.repo}: working line '${a.working}' does not exist; using the checkout's current commit.`);
      const current = await revParse(a.dir, 'HEAD');
      await git(a.dir, ['branch', line.branch, current]);
      return ensureLine(a, team);
    }
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

export interface OpenInput { repo: string; session: string; team: string; assignment?: string; branch?: string }

export async function openDesk(input: OpenInput): Promise<DeskStatus> {
  const a = await arrangementOf(input.repo);
  if (!desksManaged(a)) {
    console.warn(`${a.repo} does not select managed desks; opening the requested desk anyway.`);
  }
  const hazard = await syncthingHazard(a.dir);
  if (hazard) console.warn(`${hazard}; opening the requested desk anyway.`);
  const line = await ensureLine(a, input.team);
  let branch = input.branch || (input.team ? teamDeskBranch(input.team, input.session) : soloDeskBranch(input.session));
  if (isFunnel(a, line, branch)) {
    const suggested = input.team ? teamDeskBranch(input.team, input.session) : soloDeskBranch(input.session);
    console.warn(`${branch} is an integration line; opening ${suggested} instead.`);
    branch = suggested;
  }

  const existing = await readDesk(a.repo, branch);
  const wtPath = existing?.worktree || deskWorktree(a.repo, branch);
  const mounted = await worktreeOf(a.dir, branch);
  if (!mounted) {
    await worktreePrune(a.dir);
    if (await branchExists(a.dir, branch)) await worktreeAddExisting(a.dir, wtPath, branch);
    else await worktreeAddNew(a.dir, wtPath, branch, (await branchExists(a.dir, line.branch)) ? line.branch : 'HEAD');
  }
  await setUpstream(a.dir, branch, line.branch).catch(() => undefined);
  await stampDeskIdentity(a.dir, mounted?.path ?? wtPath, input.session);
  await materializeNodeModules(a.dir, mounted?.path ?? wtPath);

  const rec: DeskRecord = existing
    ? { ...existing, session: input.session, team: input.team, assignment: input.assignment ?? existing.assignment, state: 'open', parked_at: undefined, worktree: mounted?.path ?? wtPath }
    : {
        repo: a.repo, root: a.repo, branch, worktree: mounted?.path ?? wtPath, line: line.branch, mode: a.mode,
        session: input.session, team: input.team, assignment: input.assignment ?? assignmentId(input.session, input.team),
        state: 'open', opened_at: new Date().toISOString(), pending: null, last_hand_in: '', blocked: '',
      };
  await writeDesk(rec);
  return deskStatus(rec, a);
}

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

export async function syncDesk(repo: string, branch: string): Promise<DeskNotice> {
  const rec = await readDesk(repo, branch);
  if (!rec) return { kind: 'pending', repo, desk: branch, session: '', line_sha: '', by: '', files: [] };
  return adoptLine(rec, await arrangementOf(repo), rec.pending?.by ?? '');
}

export interface CloseOutcome { desk: DeskStatus | null; action: 'closed' | 'kept'; reason: string }

export async function closeDesk(repo: string, branch: string): Promise<CloseOutcome> {
  const rec = await readDesk(repo, branch);
  if (!rec) return { desk: null, action: 'kept', reason: 'no desk is recorded' };
  const a = await arrangementOf(repo);
  const st = await deskStatus(rec, a);
  if (st.dirty) return { desk: st, action: 'kept', reason: `unsaved files: ${st.dirty_files.join(', ')}` };
  const integrated = !!st.tip && !!st.line_tip && (await isAncestor(a.dir, st.tip, st.line_tip));
  if (!integrated) return { desk: st, action: 'kept', reason: `${st.ahead} commit(s) are not on ${st.line}` };
  const transaction_id = `close_${randomUUID()}`;
  return withManagedTransaction({
    repo, transaction_id, type: 'ending_inspected', result: 'started', session: rec.session, team: rec.team,
    refs: [{ name: branch, before: st.tip, after: '' }], commits: [{ role: 'desk_tip', sha: st.tip }],
    objects: [
      { kind: 'desk', id: `${repo}:${branch}`, path: st.worktree, owner_sessions: rec.owners?.length ? rec.owners : [rec.session], owner_team: rec.team },
      { kind: 'assignment', id: rec.assignment, owner_sessions: rec.owners?.length ? rec.owners : [rec.session], owner_team: rec.team },
      { kind: 'worktree', id: `${repo}:${branch}`, path: st.worktree },
    ], detail: { operation: 'close', contained_in: st.line },
  }, async (transaction) => {
    if (st.mounted) await worktreeRemove(a.dir, st.worktree, false);
    await deleteBranch(a.dir, branch);
    await removeDesk(repo, branch);
    await transaction.finish('desk_closed', 'contained', { detail: { contained_in: st.line } });
    return { desk: null, action: 'closed', reason: `tip is contained in ${st.line}` };
  });
}

export async function handoffDesk(repo: string, branch: string, successors: string[]): Promise<DeskStatus> {
  const rec = await readDesk(repo, branch);
  if (!rec) throw new Error(`no desk recorded for ${repo}:${branch}`);
  const owners = [...new Set(successors.map((owner) => owner.trim()).filter(Boolean))];
  if (!owners.length) throw new Error('handoff requires at least one successor owner');
  const prior = rec.owners?.length ? rec.owners : [rec.session];
  const transaction_id = `handoff_${randomUUID()}`;
  return withManagedTransaction({
    repo, transaction_id, type: 'ending_inspected', result: 'started', session: rec.session, team: rec.team,
    refs: [], commits: [],
    objects: [{ kind: 'desk', id: `${repo}:${branch}`, path: rec.worktree, owner_sessions: prior, owner_team: rec.team }],
    detail: { operation: 'handoff', from: prior, to: owners },
  }, async (transaction) => {
    const next = await updateDesk(repo, branch, {
      owners, session: owners[0]!, successor_session: owners[0], handed_off_at: new Date().toISOString(),
    });
    await transaction.finish('handed_off', 'handed_off', {
      objects: [{ kind: 'desk', id: `${repo}:${branch}`, path: next.worktree, owner_sessions: owners, owner_team: next.team }],
      detail: { from: prior, to: owners },
    });
    return deskStatus(next, await arrangementOf(repo));
  });
}

export async function discardDesk(repo: string, branch: string): Promise<void> {
  const rec = await readDesk(repo, branch);
  const a = await arrangementOf(repo);
  const wt = await worktreeOf(a.dir, branch);
  if (wt) await worktreeRemove(a.dir, wt.path, true);
  if (await branchExists(a.dir, branch)) await deleteBranch(a.dir, branch);
  if (rec) await removeDesk(repo, branch);
}

export async function recoverDesk(repo: string, branch: string, session: string): Promise<DeskStatus> {
  const rec = await readDesk(repo, branch);
  if (!rec) {
    console.warn(`no desk recorded for ${repo}:${branch}; opening it for ${session}.`);
    return openDesk({ repo, session, team: '', branch });
  }
  return openDesk({ repo, session, team: rec.team, assignment: rec.assignment, branch });
}

export async function parkedDesks(filter: { repo?: string; team?: string } = {}): Promise<DeskStatus[]> {
  const recs = (await listDeskRecords(filter)).filter((r) => r.state === 'parked');
  const out: DeskStatus[] = [];
  for (const r of recs) out.push(await deskStatus(r, await arrangementOf(r.repo)));
  return out;
}

export const refreshLine = (line: TeamLine): Promise<boolean> =>
  existsSync(line.worktree) ? resetHardTo(line.worktree, `refs/heads/${line.branch}`) : Promise.resolve(false);

export const lineDirty = async (line: TeamLine): Promise<string[]> =>
  existsSync(line.worktree) ? dirtyFiles(line.worktree).catch(() => []) : [];
