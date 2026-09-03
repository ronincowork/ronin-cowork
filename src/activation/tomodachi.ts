/**
 * AGERU'S SEND — the weekly Tomodachi packet actually leaving the machine.
 *
 * THE SEAM. Core must not import `src/services/` (KYOKAI), and Tomodachi is produced by the
 * paid layer. So the producer DROPS a finished packet into an outbox and AGERU picks it up.
 * Core never learns how a packet is made; services never learns how one is sent. Neither
 * side imports the other, and a box with no Services installed simply has an empty outbox.
 *
 * THE RETRY IS THE POINT. A timeout tells us nothing about whether HQ stored the packet, so
 * the only safe move is to send the identical bytes again. That is safe because the packet
 * id is derived from (install, week): the same week produces the same id and the same bytes,
 * and SHIWAKE returns the receipt it already issued instead of storing a duplicate.
 *
 * A packet is therefore only removed from the outbox once a RECEIPT is in hand.
 */
import { onClock } from '../jikan.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { callHq } from './transport.js';
import { getEntitlementToken } from './secrets.js';

/** Where the producer leaves finished packets, and where receipts land beside them. */
const outboxDir = () => path.join(storeDir('telemetry'), 'outbox');
const receiptDir = () => path.join(storeDir('telemetry'), 'receipts');

export interface Receipt {
  receipt_id: string;
  entitlement_id: string;
  packet_id: string;
  received_at: string;
}

export interface SendReport {
  attempted: number;
  sent: number;
  alreadyStored: number;
  failed: number;
  skipped: 'no-entitlement' | 'nothing-due' | null;
}

/**
 * Send everything waiting in the outbox.
 *
 * Safe to call repeatedly and safe to call concurrently with itself: every send is
 * idempotent by construction, so the worst case of an overlap is one wasted request.
 */
export async function sendDuePackets(): Promise<SendReport> {
  const report: SendReport = { attempted: 0, sent: 0, alreadyStored: 0, failed: 0, skipped: null };

  const token = await getEntitlementToken();
  if (!token) {
    // Declining Services, or simply not having asked, sends nothing. Not an error.
    report.skipped = 'no-entitlement';
    return report;
  }

  let names: string[];
  try {
    names = (await fs.readdir(outboxDir())).filter((n) => n.endsWith('.json'));
  } catch {
    names = [];
  }
  if (!names.length) { report.skipped = 'nothing-due'; return report; }

  for (const name of names) {
    const file = path.join(outboxDir(), name);
    let packet: unknown;
    try {
      packet = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      // A packet we cannot parse will never be accepted. Move it aside rather than
      // retrying it forever, and leave it where a person can look.
      await fs.rename(file, `${file}.unreadable`).catch(() => {});
      report.failed++;
      continue;
    }

    report.attempted++;
    try {
      const res = await callHq<Receipt>('POST', '/v1/ageru/tomodachi', { body: packet, token });

      if (res.status === 200 || res.status === 201) {
        if (res.body) await storeReceipt(res.body);
        // Only now is the packet done. Deleting before the receipt is in hand would lose
        // the one thing the sender can prove delivery with.
        await fs.rm(file, { force: true });
        if (res.status === 201) report.sent++; else report.alreadyStored++;
        continue;
      }

      // A closed refusal that will never succeed — an unsupported version, or bytes that
      // conflict with something already stored under this id. Retrying is pure noise.
      if (res.error && res.error.retryable === false) {
        await fs.rename(file, `${file}.refused`).catch(() => {});
        report.failed++;
        continue;
      }

      report.failed++;   // retryable: leave it in the outbox for the next run
    } catch {
      report.failed++;   // unreachable: same
    }
  }

  return report;
}

/** The receipt, kept beside what was sent, because it is the sender's only proof. */
async function storeReceipt(r: Receipt): Promise<void> {
  if (!r?.packet_id) return;
  const dir = receiptDir();
  await fs.mkdir(dir, { recursive: true });
  const safe = r.packet_id.replace(/[^a-z0-9_-]/gi, '');
  if (!safe) return;
  await fs.writeFile(path.join(dir, `${safe}.json`), JSON.stringify(r, null, 2), { mode: 0o600 });
}

/** Every receipt this install holds, newest first — what the owner's egress view shows. */
export async function listReceipts(limit = 20): Promise<Receipt[]> {
  try {
    const names = (await fs.readdir(receiptDir())).filter((n) => n.endsWith('.json')).sort().reverse();
    const out: Receipt[] = [];
    for (const n of names.slice(0, limit)) {
      out.push(JSON.parse(await fs.readFile(path.join(receiptDir(), n), 'utf8')));
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * THE SCHEDULE. Hourly, not weekly, and the difference matters: the producer decides WHEN a
 * packet exists, and an hourly sweep of an outbox that is usually empty is what makes a
 * missed week catch up by itself after a machine was off. A weekly timer on a laptop that
 * was closed on the day simply never fires.
 *
 * Unref'd, so it never holds the process open.
 */
export function startTomodachiSender(everyMs = 3_600_000): () => void {
  // On JIKAN's clock (src/jikan.ts): the hourly sweep, and one sweep shortly after
  // boot for the machine that was off when a packet was written.
  setTimeout(() => { void sendDuePackets(); }, 60_000).unref();
  return onClock('tomodachi', everyMs, async () => { await sendDuePackets(); });
}
