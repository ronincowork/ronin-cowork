import { onClock } from '../jikan.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { callHq } from './transport.js';
import { getEntitlementToken } from './secrets.js';

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

export async function sendDuePackets(): Promise<SendReport> {
  const report: SendReport = { attempted: 0, sent: 0, alreadyStored: 0, failed: 0, skipped: null };

  const token = await getEntitlementToken();
  if (!token) {
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
      await fs.rename(file, `${file}.unreadable`).catch(() => {});
      report.failed++;
      continue;
    }

    report.attempted++;
    try {
      const res = await callHq<Receipt>('POST', '/v1/ageru/tomodachi', { body: packet, token });

      if (res.status === 200 || res.status === 201) {
        if (res.body) await storeReceipt(res.body);
        await fs.rm(file, { force: true });
        if (res.status === 201) report.sent++; else report.alreadyStored++;
        continue;
      }

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

async function storeReceipt(r: Receipt): Promise<void> {
  if (!r?.packet_id) return;
  const dir = receiptDir();
  await fs.mkdir(dir, { recursive: true });
  const safe = r.packet_id.replace(/[^a-z0-9_-]/gi, '');
  if (!safe) return;
  await fs.writeFile(path.join(dir, `${safe}.json`), JSON.stringify(r, null, 2), { mode: 0o600 });
}

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

export function startTomodachiSender(everyMs = 3_600_000): () => void {
  setTimeout(() => { void sendDuePackets(); }, 60_000).unref();
  return onClock('tomodachi', everyMs, async () => { await sendDuePackets(); });
}
