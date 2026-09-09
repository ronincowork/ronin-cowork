import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './resources.js';
import { listSessions } from './tmux.js';
import { deliverForce, deliverSafe } from './send.js';
import { onClock } from './jikan.js';
import { readMachineSettingsSection } from './machine-settings.js';

export type MessageState = 'pending' | 'stuck' | 'failed' | 'target_missing';
export type MessageSource = 'tell' | 'wipeboard_notice' | 'owner' | 'house' | 'jikan';

export interface QueuedMessage {
  id: string;
  from: string;
  target: string;
  target_key: string;
  text: string;
  source: MessageSource;
  state: MessageState;
  reason: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
  /** Set once when the queue force-delivers the message on the owner's standing auto-force setting. */
  auto_forced_at?: string;
}

const DIR = storeDir('message_queue');
/** Polite for this long, then force: the default when the owner has not chosen. */
export const AUTO_FORCE_DEFAULT_S = 120;

/** The stored value → milliseconds. Absent means the default; an explicit 0 means never. */
export const autoForceMsFrom = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return AUTO_FORCE_DEFAULT_S * 1_000;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) * 1_000 : 0;
};

/** The owner's standing choice: force a retained message this old, once. */
export async function readAutoForceAfterMs(): Promise<number> {
  const section = await readMachineSettingsSection<{ auto_force_after_s?: unknown }>('messages', {});
  return autoForceMsFrom(section.auto_force_after_s);
}
export const MESSAGE_TTL_MS = 60 * 60 * 1_000;
export const TELL_TTL_MS = 30 * 60 * 1_000;
export const WIPEBOARD_NOTICE_TTL_MS = 10 * 60 * 1_000;
const active = new Set<string>();
const cancelled = new Set<string>();
const file = (id: string) => path.join(DIR, `${id}.json`);
const lockFile = (id: string) => path.join(DIR, `${id}.lock`);
const cancelFile = (id: string) => path.join(DIR, `${id}.cancel`);
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

async function write(item: QueuedMessage): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${file(item.id)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(item));
  await fs.rename(tmp, file(item.id));
}

export const messageTtlMs = (source: MessageSource): number => source === 'tell'
  ? TELL_TTL_MS
  : source === 'wipeboard_notice' ? WIPEBOARD_NOTICE_TTL_MS : MESSAGE_TTL_MS;

export async function listQueuedMessages(now = Date.now()): Promise<QueuedMessage[]> {
  let names: string[];
  try { names = await fs.readdir(DIR); } catch { return []; }
  const rows: QueuedMessage[] = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    try {
      const item = JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8')) as QueuedMessage;
      const expires = Date.parse(item.expires_at);
      if (!item.target_key || !Number.isFinite(expires)) {
        await fs.unlink(path.join(DIR, name)).catch(() => {});
        continue;
      }
      if (expires <= now) {
        await dismissMessage(item.id, 'expired');
        continue;
      }
      rows.push(item);
    } catch { /* incomplete/hand-edited file stays out of execution */ }
  }
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function pendingTellsFrom(from: string, target: string): Promise<QueuedMessage[]> {
  return (await listQueuedMessages()).filter((item) =>
    item.source === 'tell' && item.from === from && item.target === target
  );
}

const sourceFrom = (source: MessageSource): string => ({
  tell: 'Agent', wipeboard_notice: 'Wipeboard', owner: 'Owner', house: 'Ronin House', jikan: 'Cron jobs',
})[source];

export async function enqueueMessage(target: string, text: string, source: MessageSource, from = sourceFrom(source)): Promise<QueuedMessage> {
  const targetSession = (await listSessions()).find((session) => session.name === target);
  if (!targetSession) throw new MessageRefused(target);
  const now = Date.now();
  const at = new Date(now).toISOString();
  const item: QueuedMessage = {
    id: randomUUID(), from, target, target_key: targetSession.key, text, source,
    state: 'pending', reason: 'waiting for delivery', attempts: 0,
    created_at: at, updated_at: at, expires_at: new Date(now + messageTtlMs(source)).toISOString(),
  };
  await write(item);
  return item;
}

export async function deliverMessage(target: string, text: string, source: MessageSource, from?: string): Promise<QueuedMessage | null> {
  const item = await enqueueMessage(target, text, source, from);
  return attemptMessage(item.id, 'safe');
}

export class MessageRefused extends Error {
  readonly target: string;
  constructor(target: string) {
    super(`Target session '${target}' does not exist. Choose a session from the roster, or use the team's wipeboard.`);
    this.name = 'MessageRefused';
    this.target = target;
  }
}

type Disposition = 'dismissed' | 'expired' | 'delivered';

const canNack = (item: QueuedMessage): boolean => item.source === 'tell'
  && item.from !== 'Agent'
  && !item.from.startsWith('grid_');

async function negativeAck(item: QueuedMessage, reason: 'dismissed' | 'expired'): Promise<void> {
  if (!canNack(item)) return;
  const text = `Your tell ${item.id} to '${item.target}' was ${reason} before delivery.`;
  try { await deliverMessage(item.from, text, 'house'); } catch { /* sender ended; no return path remains */ }
}

export async function dismissMessage(id: string, disposition: Disposition = 'dismissed'): Promise<boolean> {
  if (!validId(id)) return false;
  const attempting = active.has(id) || await fs.stat(lockFile(id)).then(() => true, () => false);
  if (attempting) {
    cancelled.add(id);
    await fs.writeFile(cancelFile(id), disposition).catch(() => {});
  }
  let item: QueuedMessage;
  try { item = JSON.parse(await fs.readFile(file(id), 'utf8')) as QueuedMessage; } catch { return false; }
  try { await fs.unlink(file(id)); } catch { return false; }
  if (disposition !== 'delivered') await negativeAck(item, disposition);
  return true;
}

export async function dismissMessages(ids: readonly string[]): Promise<{ dismissed: string[]; not_found: string[] }> {
  const dismissed: string[] = [];
  const not_found: string[] = [];
  for (const id of [...new Set(ids)]) {
    if (await dismissMessage(id)) dismissed.push(id);
    else not_found.push(id);
  }
  return { dismissed, not_found };
}

export interface ForceOutcome { id: string; delivered: boolean; state?: MessageState; reason?: string }

/** Force each named message in turn — exact IDs from the caller's snapshot, one live pane at a time. */
export async function forceMessages(ids: readonly string[], delivery?: Delivery): Promise<{ outcomes: ForceOutcome[]; not_found: string[] }> {
  const outcomes: ForceOutcome[] = [];
  const not_found: string[] = [];
  for (const id of [...new Set(ids)]) {
    const exists = validId(id) && await fs.stat(file(id)).then(() => true, () => false);
    if (!exists) { not_found.push(id); continue; }
    const retained = await attemptMessage(id, 'force', delivery);
    outcomes.push(retained === null
      ? { id, delivered: true }
      : { id, delivered: false, state: retained.state, reason: retained.reason });
  }
  return { outcomes, not_found };
}

interface Delivery {
  safe: typeof deliverSafe;
  force: typeof deliverForce;
}

export async function attemptMessage(
  id: string,
  mode: 'safe' | 'force' = 'safe',
  delivery: Delivery = { safe: deliverSafe, force: deliverForce },
): Promise<QueuedMessage | null> {
  if (!validId(id)) return null;
  if (active.has(id)) {
    try { return JSON.parse(await fs.readFile(file(id), 'utf8')) as QueuedMessage; } catch { return null; }
  }
  active.add(id);
  let lock: FileHandle | null = null;
  try {
    await fs.mkdir(DIR, { recursive: true });
    try {
      lock = await fs.open(lockFile(id), 'wx');
      await lock.writeFile(`${process.pid}\n${Date.now()}\n`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        const age = Date.now() - (await fs.stat(lockFile(id))).mtimeMs;
        if (age > 15_000) { await fs.unlink(lockFile(id)); return attemptMessage(id, mode, delivery); }
      } catch { /* it cleared between checks */ }
      try { return JSON.parse(await fs.readFile(file(id), 'utf8')) as QueuedMessage; } catch { return null; }
    }
    let item: QueuedMessage;
    try { item = JSON.parse(await fs.readFile(file(id), 'utf8')) as QueuedMessage; } catch { return null; }
    let attempted = false;
    const countAttempt = () => {
      if (attempted) return;
      attempted = true;
      item.attempts += 1;
    };
    const retain = async (state: MessageState, reason: string): Promise<QueuedMessage | null> => {
      if (cancelled.has(id) || await fs.stat(cancelFile(id)).then(() => true, () => false)) return null;
      if (!attempted && item.state === state && item.reason === reason) return item;
      item.state = state;
      item.reason = reason;
      item.updated_at = new Date().toISOString();
      await write(item);
      if (cancelled.has(id) || await fs.stat(cancelFile(id)).then(() => true, () => false)) {
        await fs.unlink(file(id)).catch(() => {});
        return null;
      }
      return item;
    };
    const targetSession = (await listSessions()).find((session) => session.name === item.target);
    if (!targetSession || targetSession.key !== item.target_key) {
      return retain('target_missing', targetSession
        ? 'the target name now belongs to a different session'
        : 'target session no longer exists');
    }
    if (mode === 'safe' && targetSession.control !== 'write') {
      return retain('stuck', `the target Control setting is '${targetSession.control}'`);
    }
    try {
      if (mode === 'force') countAttempt();
      const result = mode === 'force'
        ? await delivery.force(item.target, item.text)
        : await delivery.safe(item.target, item.text, countAttempt);
      if (result.delivered) { await dismissMessage(id, 'delivered'); return null; }
      return retain(mode === 'force' || result.submitted ? 'failed' : 'stuck', result.reason);
    } catch (e) {
      return retain(mode === 'force' || attempted ? 'failed' : 'stuck', String((e as Error).message ?? e));
    }
  } finally {
    await lock?.close().catch(() => {});
    if (lock) await fs.unlink(lockFile(id)).catch(() => {});
    active.delete(id);
    cancelled.delete(id);
    await fs.unlink(cancelFile(id)).catch(() => {});
  }
}

export interface SweepOptions {
  now?: number;
  /** Override of the owner's setting, for tests; undefined reads the machine document. */
  autoForceAfterMs?: number;
  delivery?: Delivery;
}

const autoForceDue = (item: QueuedMessage, afterMs: number, now: number): boolean => afterMs > 0
  && !item.auto_forced_at
  && (item.state === 'stuck' || item.state === 'failed')
  && now - Date.parse(item.created_at) >= afterMs;

async function stampAutoForce(id: string, at: string): Promise<boolean> {
  try {
    const item = JSON.parse(await fs.readFile(file(id), 'utf8')) as QueuedMessage;
    item.auto_forced_at = at;
    item.updated_at = at;
    await write(item);
    return true;
  } catch { return false; }
}

/** One sweep: safe attempts for what is retryable, and — when the owner has switched it
 *  on — one force for anything retained longer than their delay, exactly as if they had
 *  pressed Force on that card. A message is auto-forced once; a failed force stays visible
 *  with its reason and the time, and only a manual press tries again. */
export async function processMessageQueue(options: SweepOptions = {}): Promise<void> {
  const now = options.now ?? Date.now();
  const afterMs = options.autoForceAfterMs ?? await readAutoForceAfterMs();
  for (const item of await listQueuedMessages(now)) {
    if (autoForceDue(item, afterMs, now)) {
      if (await stampAutoForce(item.id, new Date(now).toISOString())) await attemptMessage(item.id, 'force', options.delivery);
      continue;
    }
    if (item.state !== 'failed' && item.state !== 'target_missing') await attemptMessage(item.id, 'safe', options.delivery);
  }
}

export function startMessageQueue(): () => void {
  void processMessageQueue();
  return onClock('message_queue', 2_000, () => processMessageQueue());
}
