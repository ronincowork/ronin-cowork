import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { storeDir } from './resources.js';
import { listSessions } from './tmux.js';
import { deliverForce, deliverSafe } from './send.js';
import { onClock } from './jikan.js';

export type MessageSource = 'tell' | 'wipeboard_notice' | 'owner' | 'house' | 'jikan';
export interface QueuedMessage { id: string; from: string; target: string; text: string; source: MessageSource; created_at: string }

const DIR = storeDir('message_queue');
export const AUTO_FORCE_AFTER_MS = 120_000;
const file = (id: string) => path.join(DIR, `${id}.json`);
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);
let processing = false;

const sourceFrom = (source: MessageSource): string => ({
  tell: 'Agent', wipeboard_notice: 'Wipeboard', owner: 'Owner', house: 'Ronin House', jikan: 'Cron jobs',
})[source];

/** Tell carries its queue-recorded sender into the recipient's prompt, not just the queue UI. */
export function deliveryText(item: Pick<QueuedMessage, 'source' | 'from' | 'text'>): string {
  if (item.source !== 'tell') return item.text;
  const from = item.from && item.from !== 'Agent' ? `@${item.from}` : 'an unidentified Agent';
  return `Tell from ${from}:\n${item.text}`;
}

async function remove(id: string): Promise<boolean> {
  if (!validId(id)) return false;
  try { await fs.unlink(file(id)); return true; } catch { return false; }
}

export async function listQueuedMessages(): Promise<QueuedMessage[]> {
  let names: string[];
  try { names = await fs.readdir(DIR); } catch { return []; }
  const rows: QueuedMessage[] = [];
  for (const name of names.filter((entry) => entry.endsWith('.json')).sort()) {
    try {
      const item = JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8')) as QueuedMessage;
      if (!validId(item.id) || !item.target || !item.text || !Date.parse(item.created_at)) {
        await fs.unlink(path.join(DIR, name)).catch(() => {});
        continue;
      }
      rows.push(item);
    } catch { /* an incomplete write is not executable */ }
  }
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function enqueueMessage(target: string, text: string, source: MessageSource, from = sourceFrom(source)): Promise<QueuedMessage> {
  const item: QueuedMessage = { id: randomUUID(), from, target, text, source, created_at: new Date().toISOString() };
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${file(item.id)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(item));
  await fs.rename(tmp, file(item.id));
  return item;
}

export async function dismissMessage(id: string): Promise<boolean> { return remove(id); }
export async function dismissMessages(ids: readonly string[]): Promise<{ dismissed: string[]; not_found: string[] }> {
  const dismissed: string[] = [];
  const not_found: string[] = [];
  for (const id of [...new Set(ids)]) (await remove(id) ? dismissed : not_found).push(id);
  return { dismissed, not_found };
}

interface Delivery { safe: typeof deliverSafe; force: typeof deliverForce }

/** One worker owns delivery. A recognizable draft/dialog is the only reason to retain a
 * letter before its deadline. Every attempted or undeliverable letter is then shredded. */
export async function processMessageQueue(options: { now?: number; delivery?: Delivery } = {}): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const now = options.now ?? Date.now();
    const delivery = options.delivery ?? { safe: deliverSafe, force: deliverForce };
    for (const item of await listQueuedMessages()) {
      if (!(await listSessions()).some((session) => session.name === item.target)) {
        await remove(item.id);
        continue;
      }
      const overdue = now - Date.parse(item.created_at) >= AUTO_FORCE_AFTER_MS;
      try {
        const text = deliveryText(item);
        const result = overdue ? await delivery.force(item.target, text) : await delivery.safe(item.target, text);
        if (!overdue && !result.delivered && !result.submitted) continue;
      } catch { /* one failed attempt is still finished */ }
      await remove(item.id);
    }
  } finally {
    processing = false;
  }
}

export function startMessageQueue(): () => void {
  void processMessageQueue();
  return onClock('message_queue', 2_000, () => processMessageQueue());
}
