/** Durable inbound session delivery. A delivered item is absence, never archived state. */
import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './stores.js';
import { getControl, sessionExists } from './tmux.js';
import { deliverForce, deliverSafe } from './send.js';

export type MessageState = 'pending' | 'stuck' | 'failed';
export type MessageSource = 'tell' | 'wipeboard_notice' | 'owner' | 'house';

export interface QueuedMessage {
  id: string;
  from: string;
  target: string;
  text: string;
  source: MessageSource;
  state: MessageState;
  reason: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}

const DIR = storeDir('message_queue');
const active = new Set<string>();
const file = (id: string) => path.join(DIR, `${id}.json`);
const lockFile = (id: string) => path.join(DIR, `${id}.lock`);
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

async function write(item: QueuedMessage): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${file(item.id)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(item));
  await fs.rename(tmp, file(item.id));
}

export async function listQueuedMessages(): Promise<QueuedMessage[]> {
  let names: string[];
  try { names = await fs.readdir(DIR); } catch { return []; }
  const rows: QueuedMessage[] = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    try { rows.push(JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8')) as QueuedMessage); } catch { /* incomplete/hand-edited file stays out of execution */ }
  }
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const sourceFrom = (source: MessageSource): string => ({
  tell: 'Agent', wipeboard_notice: 'Wipeboard', owner: 'Owner', house: 'Ronin House',
})[source];

export async function enqueueMessage(target: string, text: string, source: MessageSource, from = sourceFrom(source)): Promise<QueuedMessage> {
  const at = new Date().toISOString();
  const item: QueuedMessage = {
    id: randomUUID(), from, target, text, source, state: 'pending', reason: 'waiting for delivery',
    attempts: 0, created_at: at, updated_at: at,
  };
  await write(item);
  return item;
}

export async function dismissMessage(id: string): Promise<boolean> {
  if (!validId(id)) return false;
  try { await fs.unlink(file(id)); return true; } catch { return false; }
}

export async function attemptMessage(id: string, mode: 'safe' | 'force' = 'safe'): Promise<QueuedMessage | null> {
  if (!validId(id)) return null;
  if (active.has(id)) {
    // `null` means the item is gone because it delivered. A concurrent in-process
    // attempt still owns a live item, so return that item instead of falsely
    // reporting delivery to a second caller.
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
      // Another CLI or the operator owns this attempt. A dead claim is reclaimed after
      // Force's maximum duration plus margin; a live claim is never raced.
      try {
        const age = Date.now() - (await fs.stat(lockFile(id))).mtimeMs;
        if (age > 15_000) { await fs.unlink(lockFile(id)); return attemptMessage(id, mode); }
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
    const retain = async (state: MessageState, reason: string): Promise<QueuedMessage> => {
      // The worker checks eligibility frequently, but a busy check is not a delivery
      // attempt. Do not churn the record—or its visible counter—when nothing changed.
      if (!attempted && item.state === state && item.reason === reason) return item;
      item.state = state;
      item.reason = reason;
      item.updated_at = new Date().toISOString();
      await write(item);
      return item;
    };
    if (!(await sessionExists(item.target))) {
      return retain('failed', 'target session does not exist');
    }
    if (mode === 'safe') {
      const control = await getControl(item.target);
      if (control !== 'write') {
        return retain('stuck', `target dial is ${control}`);
      }
    }
    try {
      if (mode === 'force') countAttempt();
      const result = mode === 'force'
        ? await deliverForce(item.target, item.text)
        : await deliverSafe(item.target, item.text, countAttempt);
      if (result.delivered) { await dismissMessage(id); return null; }
      // Once text was submitted but confirmation became ambiguous, automatic retries
      // must stop: typing a second copy is worse than leaving one visible for the owner.
      return retain(mode === 'force' || result.submitted ? 'failed' : 'stuck', result.reason);
    } catch (e) {
      return retain(mode === 'force' ? 'failed' : 'stuck', String((e as Error).message ?? e));
    }
  } finally {
    await lock?.close().catch(() => {});
    if (lock) await fs.unlink(lockFile(id)).catch(() => {});
    active.delete(id);
  }
}

export async function processMessageQueue(): Promise<void> {
  for (const item of await listQueuedMessages()) {
    if (item.state !== 'failed') await attemptMessage(item.id, 'safe');
  }
}

export function startMessageQueue(): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void processMessageQueue().finally(() => { running = false; });
  }, 2_000);
  timer.unref();
  void processMessageQueue();
  return () => clearInterval(timer);
}
