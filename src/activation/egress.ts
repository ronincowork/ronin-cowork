/**
 * THE EGRESS RECORD — what left this machine, readable by the person who owns it.
 *
 * Append-only JSON lines under the data root. It holds the FACT of a call, never its
 * contents: no token, no address, no body. An owner asking "what has this thing sent?"
 * gets a complete answer; an attacker reading the same file gets nothing to present.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../stores.js';

export interface EgressLine {
  at: string;
  host: string;
  method: string;
  path: string;
  status: number;
  outcome: string;
  ms: number;
}

const file = () => path.join(storeDir('session'), '..', 'egress.jsonl');

export async function appendEgress(line: EgressLine): Promise<void> {
  const f = path.resolve(file());
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.appendFile(f, JSON.stringify(line) + '\n', { mode: 0o600 });
}

/** Newest first, bounded — the Configuration card shows a window, not a lifetime. */
export async function readEgress(limit = 50): Promise<EgressLine[]> {
  try {
    const raw = await fs.readFile(path.resolve(file()), 'utf8');
    return raw.trimEnd().split('\n').slice(-limit).reverse()
      .map((l) => JSON.parse(l) as EgressLine);
  } catch {
    return [];
  }
}
