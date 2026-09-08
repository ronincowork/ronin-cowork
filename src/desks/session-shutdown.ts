import { closeDeskForShutdown } from './desk.js';
import { listDesks } from './registry.js';
import type { DeskStatus } from './schema.js';
import { listSessions, sessionDir, stopSessionTree } from '../tmux.js';

export type ShutdownPhase =
  | 'resolving_agent'
  | 'checking_desks'
  | 'checking_safety'
  | 'closing_desks'
  | 'ending_agent'
  | 'complete'
  | 'failed';

export interface ShutdownProgress {
  phase: ShutdownPhase;
  message: string;
  desk_count?: number;
}

export interface ShutdownBlocker {
  desk: string;
  reasons: string[];
  next_action: string;
}

export class ShutdownRefused extends Error {
  readonly blockers: ShutdownBlocker[];
  constructor(blockers: ShutdownBlocker[]) {
    super(formatShutdownBlockers(blockers));
    this.name = 'ShutdownRefused';
    this.blockers = blockers;
  }
}

export interface ShutdownOps {
  desks(session: string): Promise<DeskStatus[]>;
  liveSessions(): Promise<Array<{ name: string }>>;
  cwd(session: string): Promise<string>;
  close(desk: DeskStatus, session: string): Promise<{ action: 'closed' | 'kept'; reason: string }>;
  stop(session: string): Promise<void>;
}

const liveOps: ShutdownOps = {
  desks: async (session) => (await listDesks()).filter((desk) => desk.state === 'open'
    && (desk.owners?.length ? desk.owners : [desk.session]).includes(session)),
  liveSessions: listSessions,
  cwd: sessionDir,
  close: (desk, session) => closeDeskForShutdown(desk.repo, desk.branch, session),
  stop: stopSessionTree,
};

const id = (desk: DeskStatus): string => `${desk.repo}:${desk.branch}`;

function isInside(worktree: string, cwd: string): boolean {
  if (!worktree || !cwd) return false;
  const root = worktree.endsWith('/') ? worktree : `${worktree}/`;
  return cwd === worktree || cwd.startsWith(root);
}

export function formatShutdownBlockers(blockers: ShutdownBlocker[]): string {
  return [
    'Agent shutdown was refused; no desk was closed and the Agent remains live.',
    ...blockers.map((blocker) => `- ${blocker.desk}: ${blocker.reasons.join('; ')}. NEXT: ${blocker.next_action}`),
  ].join('\n');
}

export async function closeAssignedDesks(
  session: string,
  progress: (value: ShutdownProgress) => void = () => {},
  ops: ShutdownOps = liveOps,
): Promise<{ session: string; closed: string[] }> {
  progress({ phase: 'resolving_agent', message: `Resolving Agent ${session}` });
  const desks = await ops.desks(session);
  progress({ phase: 'checking_desks', message: `Checking assigned desks (${desks.length} found)`, desk_count: desks.length });
  progress({ phase: 'checking_safety', message: 'Checking dirty, unhanded, shared, and occupied state', desk_count: desks.length });

  const live = await ops.liveSessions();
  const cwdRows = await Promise.all(live.map(async (row) => ({ name: row.name, cwd: await ops.cwd(row.name) })));
  const blockers: ShutdownBlocker[] = [];
  for (const desk of desks) {
    const reasons: string[] = [];
    const actions: string[] = [];
    if (desk.dirty) {
      reasons.push(`dirty files: ${desk.dirty_files.join(', ')}`);
      actions.push(`run git status in ${desk.worktree}, save or intentionally remove those files, and commit wanted work`);
    }
    if (desk.pending) {
      reasons.push(`pending update from ${desk.pending.by}${desk.pending.overlap.length ? ` overlapping ${desk.pending.overlap.join(', ')}` : ''}`);
      actions.push(`run tejun-desk sync ${id(desk)}`);
    }
    if (desk.blocked) {
      reasons.push(`blocked: ${desk.blocked}`);
      actions.push(`run tejun-desk status ${id(desk)} and use tejun-desk reply ${desk.repo} <receipt-id> <message> to resolve it with the lead`);
    }
    if (desk.ahead > 0) {
      reasons.push(`${desk.ahead} unique commit(s) are not contained in ${desk.line}`);
      actions.push(`run tejun-desk hand-in ${id(desk)}; a pending or rejected hand-in must be resolved before retrying tejun-harakiri`);
    }
    const otherOwners = (desk.owners?.length ? desk.owners : [desk.session]).filter((owner) => owner !== session);
    if (otherOwners.length) {
      reasons.push(`shared with ${otherOwners.join(', ')}`);
      actions.push(`run tejun-desk handoff ${id(desk)} --to ${otherOwners.join(',')} to leave it with the remaining owner(s)`);
    }
    if (!desk.mounted) {
      reasons.push('worktree is not mounted, so its state cannot be safely closed');
      actions.push(`run tejun-desk status ${id(desk)} and restore or hand off the desk before retrying`);
    }
    const occupants = cwdRows.filter((row) => row.name !== session && isInside(desk.worktree, row.cwd)).map((row) => row.name);
    if (occupants.length) {
      reasons.push(`occupied by ${occupants.join(', ')}`);
      actions.push(`run tejun-send ${occupants[0]} "Please leave ${desk.worktree}; tejun-harakiri is waiting to close ${id(desk)}"`);
    }
    if (reasons.length) blockers.push({ desk: id(desk), reasons, next_action: [...new Set(actions)].join(' THEN ') });
  }
  if (blockers.length) throw new ShutdownRefused(blockers);

  progress({ phase: 'closing_desks', message: `Closing safe desks (0/${desks.length})`, desk_count: desks.length });
  const closed: string[] = [];
  for (const desk of desks) {
    const outcome = await ops.close(desk, session);
    if (outcome.action !== 'closed') {
      throw new Error(`Shutdown stopped after closing ${closed.length}/${desks.length} desks; Agent remains live. ${id(desk)}: ${outcome.reason}`);
    }
    closed.push(id(desk));
    progress({ phase: 'closing_desks', message: `Closing safe desks (${closed.length}/${desks.length})`, desk_count: desks.length });
  }
  return { session, closed };
}

export async function shutdownAgent(
  session: string,
  progress: (value: ShutdownProgress) => void = () => {},
  ops: ShutdownOps = liveOps,
): Promise<{ session: string; closed: string[] }> {
  const result = await closeAssignedDesks(session, progress, ops);
  progress({ phase: 'ending_agent', message: `Ending Agent ${session}`, desk_count: result.closed.length });
  await ops.stop(session);
  progress({ phase: 'complete', message: `Agent ${session} and ${result.closed.length} assigned desk(s) closed`, desk_count: result.closed.length });
  return result;
}
