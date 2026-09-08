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

export class ShutdownExpired extends Error {
  constructor(readonly phase: string) {
    super(`Agent shutdown timed out during ${phase}; the Agent remains live. Retry starts a fresh operation.`);
    this.name = 'ShutdownExpired';
  }
}

export interface ShutdownOps {
  desks(session: string, signal?: AbortSignal): Promise<DeskStatus[]>;
  liveSessions(signal?: AbortSignal): Promise<Array<{ name: string }>>;
  cwd(session: string, signal?: AbortSignal): Promise<string>;
  close(desk: DeskStatus, session: string, signal?: AbortSignal): Promise<{ action: 'closed' | 'kept'; reason: string }>;
  stop(session: string, signal?: AbortSignal): Promise<void>;
}

const liveOps: ShutdownOps = {
  desks: async (session) => (await listDesks()).filter((desk) => desk.state === 'open'
    && (desk.owners?.length ? desk.owners : [desk.session]).includes(session)),
  liveSessions: listSessions,
  cwd: sessionDir,
  close: (desk, session, signal) => closeDeskForShutdown(desk.repo, desk.branch, session, undefined, signal),
  stop: async (session, signal) => {
    signal?.throwIfAborted();
    await stopSessionTree(session, { signal, timeoutMs: 4_000 });
    signal?.throwIfAborted();
  },
};

export interface ShutdownLimits {
  operationTimeoutMs?: number;
  readTimeoutMs?: number;
  closeTimeoutMs?: number;
  stopTimeoutMs?: number;
  now?: () => number;
}

export class ShutdownSlots {
  private readonly running = new Map<string, string>();
  current(session: string): string | undefined { return this.running.get(session); }
  begin(session: string, id: string): boolean {
    if (this.running.has(session)) return false;
    this.running.set(session, id);
    return true;
  }
  terminal(session: string, id: string): void {
    if (this.running.get(session) === id) this.running.delete(session);
  }
}

export const hardDeleteConfirmation = (session: string): string => `HARD DELETE ${session} AND OWNED DESKS`;

async function bounded<T>(
  phase: string,
  deadline: number,
  capMs: number,
  now: () => number,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const remaining = deadline - now();
  if (remaining <= 0) throw new ShutdownExpired(phase);
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ShutdownExpired(phase));
        }, Math.min(remaining, capMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  limits: ShutdownLimits = {},
): Promise<{ session: string; closed: string[] }> {
  const now = limits.now ?? (() => Date.now());
  const deadline = now() + (limits.operationTimeoutMs ?? 120_000);
  const readMs = limits.readTimeoutMs ?? 10_000;
  const closeMs = limits.closeTimeoutMs ?? 40_000;
  progress({ phase: 'resolving_agent', message: `Resolving Agent ${session}` });
  const desks = await bounded('assigned desk lookup', deadline, readMs, now, (signal) => ops.desks(session, signal));
  progress({ phase: 'checking_desks', message: `Checking assigned desks (${desks.length} found)`, desk_count: desks.length });
  progress({ phase: 'checking_safety', message: 'Checking dirty, unhanded, shared, and occupied state', desk_count: desks.length });

  const live = await bounded('live Agent lookup', deadline, readMs, now, (signal) => ops.liveSessions(signal));
  const cwdRows = await Promise.all(live.map(async (row) => ({
    name: row.name,
    cwd: await bounded(`working-directory lookup for ${row.name}`, deadline, readMs, now, (signal) => ops.cwd(row.name, signal)),
  })));
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
    if (now() >= deadline) throw new ShutdownExpired('desk close');
    const outcome = await bounded(`closing ${id(desk)}`, deadline, closeMs, now, (signal) => ops.close(desk, session, signal));
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
  limits: ShutdownLimits = {},
): Promise<{ session: string; closed: string[] }> {
  const now = limits.now ?? (() => Date.now());
  const operationTimeoutMs = limits.operationTimeoutMs ?? 120_000;
  const started = now();
  const result = await closeAssignedDesks(session, progress, ops, { ...limits, operationTimeoutMs });
  const remaining = operationTimeoutMs - (now() - started);
  if (remaining <= 0) throw new ShutdownExpired('ending Agent');
  progress({ phase: 'ending_agent', message: `Ending Agent ${session}`, desk_count: result.closed.length });
  await bounded('ending Agent', now() + remaining, limits.stopTimeoutMs ?? 20_000, now, (signal) => ops.stop(session, signal));
  progress({ phase: 'complete', message: `Agent ${session} and ${result.closed.length} assigned desk(s) closed`, desk_count: result.closed.length });
  return result;
}
