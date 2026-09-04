import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';

export const MANAGED_EVENT_TYPES = [
  'policy_resolved', 'desk_opened', 'checkpointed', 'sync_observed', 'hand_in_started',
  'hand_in_accepted', 'hand_in_conflicted', 'promoted', 'published', 'parked', 'handed_off',
  'ending_inspected', 'closeout_prompted', 'quarantined', 'discarded', 'desk_closed',
  'team_retired', 'audit_failed', 'recovered', 'settled',
] as const;

export type ManagedEventType = typeof MANAGED_EVENT_TYPES[number];
export type ManagedResult = 'started' | 'accepted' | 'conflicted' | 'completed' | 'failed'
  | 'refused' | 'rolled_back' | 'quarantined' | 'needs_attention' | 'observed'
  | 'contained' | 'handed_off' | 'discarded';

export interface ManagedRefChange { name: string; before: string; after: string }
export interface ManagedCommit { role: string; sha: string }
export interface ManagedObject {
  kind: 'desk' | 'assignment' | 'receipt' | 'promotion' | 'candidate' | 'team_line'
    | 'quarantine' | 'settlement' | 'worktree' | 'release_pr';
  id: string;
  repo?: string;
  path?: string;
  owner_sessions?: string[];
  owner_team?: string;
  /** Complete compatibility row when this object projects an existing mutable store. */
  data?: Record<string, unknown>;
}

export interface ManagedEvent {
  schema: 1;
  event_id: string;
  sequence: number;
  predecessor: string;
  transaction_id: string;
  type: ManagedEventType;
  at: string;
  repo: string;
  session: string;
  team: string;
  refs: ManagedRefChange[];
  commits: ManagedCommit[];
  objects: ManagedObject[];
  result: ManagedResult;
  detail: Record<string, unknown>;
}

export type ManagedEventInput = Omit<ManagedEvent, 'schema' | 'event_id' | 'sequence' | 'predecessor' | 'at'> & {
  at?: string;
};

export interface LedgerIssue {
  repo: string;
  line: number;
  code: 'malformed_event' | 'invalid_event' | 'sequence_gap' | 'predecessor_mismatch';
  detail: string;
}

export interface ManagedEventRead { events: ManagedEvent[]; issues: LedgerIssue[] }
export interface LedgerOptions { root?: string; timeoutMs?: number }

const safeRepo = (repo: string): string => encodeURIComponent(repo).replace(/%/g, '_');
export const lifecycleRoot = (): string => path.join(storeDir('desks'), 'lifecycle');
export const managedLedgerFile = (repo: string, root = lifecycleRoot()): string => path.join(root, `${safeRepo(repo)}.jsonl`);
export const managedLockDir = (repo: string, root = lifecycleRoot()): string => path.join(root, 'locks', `${safeRepo(repo)}.lock`);

const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(repo: string, root: string): Promise<boolean> {
  const dir = managedLockDir(repo, root);
  try {
    await mkdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await mkdir(path.dirname(dir), { recursive: true });
      return acquire(repo, root);
    }
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const text = await readFile(path.join(dir, 'owner'), 'utf8').catch(() => '');
    const pid = Number(text.split('\n')[0]) || 0;
    if (pid && !alive(pid)) {
      await rm(dir, { recursive: true, force: true });
      return acquire(repo, root);
    }
    if (!pid) {
      await wait(25);
      if (!(await readFile(path.join(dir, 'owner'), 'utf8').catch(() => ''))) {
        await rm(dir, { recursive: true, force: true });
      }
    }
    return false;
  }
  await writeFile(path.join(dir, 'owner'), `${process.pid}\n${new Date().toISOString()}\n`);
  return true;
}

export async function withManagedRepoLock<T>(repo: string, fn: () => Promise<T>, options: LedgerOptions = {}): Promise<T> {
  const root = options.root ?? lifecycleRoot();
  const timeoutMs = options.timeoutMs ?? 600_000;
  const started = Date.now();
  let delay = 20;
  while (!(await acquire(repo, root))) {
    if (Date.now() - started > timeoutMs) throw new Error(`managed lifecycle lock for ${repo} did not clear`);
    await wait(delay);
    delay = Math.min(delay * 2, 400);
  }
  try { return await fn(); }
  finally { await rm(managedLockDir(repo, root), { recursive: true, force: true }).catch(() => undefined); }
}

const validString = (value: unknown): value is string => typeof value === 'string';
function validateEvent(value: unknown): value is ManagedEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ManagedEvent>;
  return event.schema === 1 && validString(event.event_id) && Number.isSafeInteger(event.sequence)
    && (event.sequence ?? 0) > 0 && validString(event.predecessor) && validString(event.transaction_id)
    && MANAGED_EVENT_TYPES.includes(event.type as ManagedEventType) && validString(event.at)
    && validString(event.repo) && validString(event.session) && validString(event.team)
    && Array.isArray(event.refs) && Array.isArray(event.commits) && Array.isArray(event.objects)
    && validString(event.result) && !!event.detail && typeof event.detail === 'object' && !Array.isArray(event.detail);
}

export async function readManagedEvents(options: { repo: string; root?: string; strict?: boolean }): Promise<ManagedEventRead> {
  const text = await readFile(managedLedgerFile(options.repo, options.root), 'utf8').catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  });
  const events: ManagedEvent[] = [];
  const issues: LedgerIssue[] = [];
  const rows = text.split('\n');
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (!row) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(row); }
    catch {
      issues.push({ repo: options.repo, line: index + 1, code: 'malformed_event', detail: 'row is not complete JSON' });
      continue;
    }
    if (!validateEvent(parsed) || parsed.repo !== options.repo) {
      issues.push({ repo: options.repo, line: index + 1, code: 'invalid_event', detail: 'row does not satisfy the managed event schema' });
      continue;
    }
    const prior = events.at(-1);
    if (parsed.sequence !== (prior?.sequence ?? 0) + 1) {
      issues.push({ repo: options.repo, line: index + 1, code: 'sequence_gap', detail: `expected ${(prior?.sequence ?? 0) + 1}, found ${parsed.sequence}` });
      continue;
    }
    if (parsed.predecessor !== (prior?.event_id ?? '')) {
      issues.push({ repo: options.repo, line: index + 1, code: 'predecessor_mismatch', detail: `expected ${prior?.event_id ?? '<root>'}` });
      continue;
    }
    events.push(parsed);
  }
  if (options.strict && issues.length) throw new Error(`managed lifecycle ledger for ${options.repo} has ${issues.length} invalid row(s)`);
  return { events, issues };
}

function idFor(): string {
  return `evt_${randomUUID()}`;
}

async function appendUnlocked(input: ManagedEventInput, root: string): Promise<ManagedEvent> {
  const read = await readManagedEvents({ repo: input.repo, root });
  const prior = read.events.at(-1);
  const sequence = (prior?.sequence ?? 0) + 1;
  const event: ManagedEvent = {
    ...input,
    schema: 1,
    event_id: idFor(),
    sequence,
    predecessor: prior?.event_id ?? '',
    at: input.at ?? new Date().toISOString(),
  };
  const file = managedLedgerFile(input.repo, root);
  await mkdir(path.dirname(file), { recursive: true });
  const existing = await readFile(file).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Buffer.alloc(0);
    throw error;
  });
  // Preserve a torn final row as evidence, but put the next valid event on a fresh row.
  if (existing.length && existing.at(-1) !== 10) await appendFile(file, '\n');
  const handle = await open(file, 'a');
  try {
    await handle.writeFile(`${JSON.stringify(event)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  return event;
}

export const appendManagedEvent = (input: ManagedEventInput, options: LedgerOptions = {}): Promise<ManagedEvent> => {
  const root = options.root ?? lifecycleRoot();
  return withManagedRepoLock(input.repo, () => appendUnlocked(input, root), { ...options, root });
};

/** Read every repository shard as one operational ledger. Repository chains are independent;
 * aggregate ordering is stable by time, repository and repository-local sequence. */
export async function readManagedLedger(options: { root?: string; strict?: boolean } = {}): Promise<ManagedEventRead> {
  const root = options.root ?? lifecycleRoot();
  const files = (await readdir(root).catch(() => [])).filter((file) => file.endsWith('.jsonl')).sort();
  const events: ManagedEvent[] = [];
  const issues: LedgerIssue[] = [];
  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8').catch(() => '');
    const first = text.split('\n').find(Boolean);
    let repo = '';
    try { repo = String((JSON.parse(first ?? '{}') as { repo?: unknown }).repo ?? ''); } catch { /* issue is retained below */ }
    if (!repo) {
      issues.push({ repo: file, line: 1, code: 'malformed_event', detail: 'repository shard has no readable first event' });
      continue;
    }
    const read = await readManagedEvents({ repo, root, strict: false });
    events.push(...read.events);
    issues.push(...read.issues);
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.repo.localeCompare(b.repo) || a.sequence - b.sequence);
  if (options.strict && issues.length) throw new Error(`managed lifecycle ledger has ${issues.length} invalid row(s)`);
  return { events, issues };
}

export interface ManagedTransaction {
  readonly id: string;
  readonly repo: string;
  append(type: ManagedEventType, result: ManagedResult, payload?: Partial<Omit<ManagedEventInput, 'repo' | 'transaction_id' | 'type' | 'result'>>): Promise<ManagedEvent>;
  finish(type: ManagedEventType, result: Exclude<ManagedResult, 'started'>, payload?: Partial<Omit<ManagedEventInput, 'repo' | 'transaction_id' | 'type' | 'result'>>): Promise<ManagedEvent>;
}

export async function beginManagedTransaction(
  input: ManagedEventInput,
  options: LedgerOptions = {},
): Promise<ManagedTransaction> {
  if (input.result !== 'started') throw new Error('a managed transaction must begin with result=started');
  await appendManagedEvent(input, options);
  let finished = false;
  const append = (type: ManagedEventType, result: ManagedResult, payload: Partial<ManagedEventInput> = {}) => {
    if (finished) throw new Error(`managed transaction ${input.transaction_id} is already finished`);
    return appendManagedEvent({
      session: input.session, team: input.team, refs: [], commits: [], objects: [], detail: {},
      ...payload, repo: input.repo, transaction_id: input.transaction_id, type, result,
    }, options);
  };
  return {
    id: input.transaction_id,
    repo: input.repo,
    append,
    async finish(type, result, payload = {}) {
      const event = await append(type, result, payload);
      finished = true;
      return event;
    },
  };
}

/** Hold the repository lock across the durable start, a short managed mutation and its
 * terminal observation. Throwing deliberately leaves the start pending for recovery. */
export async function withManagedTransaction<T>(
  input: ManagedEventInput,
  fn: (transaction: ManagedTransaction) => Promise<T>,
  options: LedgerOptions = {},
): Promise<T> {
  if (input.result !== 'started') throw new Error('a managed transaction must begin with result=started');
  const root = options.root ?? lifecycleRoot();
  return withManagedRepoLock(input.repo, async () => {
    await appendUnlocked(input, root);
    let finished = false;
    const append = (type: ManagedEventType, result: ManagedResult, payload: Partial<ManagedEventInput> = {}) => {
      if (finished) throw new Error(`managed transaction ${input.transaction_id} is already finished`);
      return appendUnlocked({
        session: input.session, team: input.team, refs: [], commits: [], objects: [], detail: {},
        ...payload, repo: input.repo, transaction_id: input.transaction_id, type, result,
      }, root);
    };
    const transaction: ManagedTransaction = {
      id: input.transaction_id,
      repo: input.repo,
      append,
      async finish(type, result, payload = {}) {
        const event = await append(type, result, payload);
        finished = true;
        return event;
      },
    };
    return fn(transaction);
  }, { ...options, root });
}

export interface LifecycleProjection {
  desks: ManagedObject[];
  assignments: ManagedObject[];
  receipts: ManagedEvent[];
  promotions: ManagedEvent[];
  quarantines: ManagedObject[];
  settlements: ManagedEvent[];
  pending: Array<{ transaction_id: string; repo: string; event: ManagedEvent }>;
}

export interface CompatibilityProjectionDocuments {
  registry: ManagedObject[];
  assignments: ManagedObject[];
  receipts: ManagedEvent[];
  promotions: ManagedEvent[];
  quarantines: ManagedObject[];
  settlements: ManagedEvent[];
}

const TERMINAL_RESULTS = new Set<ManagedResult>([
  'accepted', 'conflicted', 'completed', 'failed', 'refused', 'rolled_back', 'quarantined',
  'needs_attention', 'contained', 'handed_off', 'discarded',
]);
const terminal = (event: ManagedEvent): boolean => TERMINAL_RESULTS.has(event.result);
export function projectManagedLifecycle(events: readonly ManagedEvent[]): LifecycleProjection {
  const desks = new Map<string, ManagedObject>();
  const assignments = new Map<string, ManagedObject>();
  const quarantines = new Map<string, ManagedObject>();
  const receipts: ManagedEvent[] = [];
  const promotions: ManagedEvent[] = [];
  const settlements: ManagedEvent[] = [];
  const pending = new Map<string, ManagedEvent>();
  for (const event of [...events].sort((a, b) => a.repo.localeCompare(b.repo) || a.sequence - b.sequence)) {
    if (event.result === 'started' || event.type === 'hand_in_started') pending.set(event.transaction_id, event);
    else if (terminal(event)) pending.delete(event.transaction_id);
    for (const object of event.objects) {
      const projected = { ...structuredClone(object), repo: object.repo ?? event.repo };
      const key = `${event.repo}\0${object.id}`;
      if (object.kind === 'desk') {
        if (event.type === 'desk_closed' || event.type === 'discarded' || event.type === 'quarantined') desks.delete(key);
        else desks.set(key, projected);
      } else if (object.kind === 'assignment') {
        if (event.type === 'desk_closed' || event.type === 'team_retired' || event.type === 'discarded' || event.type === 'quarantined') assignments.delete(key);
        else assignments.set(key, projected);
      } else if (object.kind === 'quarantine') quarantines.set(key, projected);
    }
    if (event.type.startsWith('hand_in_')) receipts.push(event);
    if (event.type === 'promoted' || event.type === 'published') promotions.push(event);
    if (event.type === 'settled' || event.type === 'recovered') settlements.push(event);
  }
  const values = (map: Map<string, ManagedObject>) => [...map.values()].sort((a, b) => (a.repo ?? '').localeCompare(b.repo ?? '') || a.id.localeCompare(b.id));
  return { desks: values(desks), assignments: values(assignments), receipts, promotions, quarantines: values(quarantines), settlements, pending: [...pending].map(([transaction_id, event]) => ({ transaction_id, repo: event.repo, event })).sort((a, b) => a.transaction_id.localeCompare(b.transaction_id)) };
}

/** Canonical, JSON-serializable documents for legacy stores. Callers own where and when
 * to atomically materialize them while migration is in progress. */
export function compatibilityProjectionDocuments(projection: LifecycleProjection): CompatibilityProjectionDocuments {
  return {
    registry: structuredClone(projection.desks),
    assignments: structuredClone(projection.assignments),
    receipts: structuredClone(projection.receipts),
    promotions: structuredClone(projection.promotions),
    quarantines: structuredClone(projection.quarantines),
    settlements: structuredClone(projection.settlements),
  };
}

export interface RecoveryDisposition {
  result: 'completed' | 'rolled_back' | 'quarantined' | 'needs_attention';
  refs?: ManagedRefChange[];
  commits?: ManagedCommit[];
  objects?: ManagedObject[];
  detail: Record<string, unknown>;
}

/** Startup recovery records only a disposition proved by its workflow callback. It does
 * not infer, move or remove managed objects itself. Re-reading under the repository lock
 * makes concurrent recovery idempotent. */
export async function recoverInterruptedTransactions(
  repo: string,
  recover: (pending: { transaction_id: string; repo: string; event: ManagedEvent }) => Promise<RecoveryDisposition>,
  options: LedgerOptions = {},
): Promise<ManagedEvent[]> {
  const root = options.root ?? lifecycleRoot();
  return withManagedRepoLock(repo, async () => {
    const read = await readManagedEvents({ repo, root });
    const pending = projectManagedLifecycle(read.events).pending;
    const recorded: ManagedEvent[] = [];
    for (const item of pending) {
      const disposition = await recover(item);
      recorded.push(await appendUnlocked({
        repo,
        transaction_id: item.transaction_id,
        type: 'recovered',
        result: disposition.result,
        session: item.event.session,
        team: item.event.team,
        refs: disposition.refs ?? [],
        commits: disposition.commits ?? [],
        objects: disposition.objects ?? [],
        detail: disposition.detail,
      }, root));
    }
    return recorded;
  }, { ...options, root });
}
