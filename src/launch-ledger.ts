import { appendFile, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './resources.js';
import type { Resolved, SpawnForm } from './spawn.js';
import { sessionKey, sessionDir } from './session-dir.js';

const LEDGER = path.join(storeDir('ledger'), 'spawns.jsonl');

/** Keep the Cowork-birth truth inside the newborn session's own durable tenancy. */
export async function persistBirthReceipt(session: string, receipt: unknown): Promise<string> {
  return persistBirthReceiptAt(sessionDir(await sessionKey(session)), receipt);
}

/** Pure-path half for testing and maintenance without a live tmux server. */
export async function persistBirthReceiptAt(dir: string, receipt: unknown): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, 'birth-receipt.json');
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  await rename(tmp, target);
  return target;
}

/** Append-only local launch history. Failure never costs the owner their session. */
export async function appendLaunchLedger(form: SpawnForm, resolved: Resolved, ok: boolean): Promise<void> {
  try {
    await mkdir(path.dirname(LEDGER), { recursive: true });
    await appendFile(LEDGER, JSON.stringify({
      ts: new Date().toISOString(),
      session_role: form.session_role ?? '',
      team: form.team ?? '',
      intent: form.prompt,
      picks: { project_root: form.project_root, tags: form.tags, seed: form.seed, reference: form.reference },
      fill: null,
      resolved: { name: resolved.name, dir: resolved.dir, cmd: resolved.cmd, dial: resolved.dial },
      boot: ok ? { state: 'open', opened_at: new Date().toISOString() } : { state: 'failed' },
      spawn: { name: resolved.name, ok },
      outcome: null,
    }) + '\n', 'utf8');
  } catch (e) {
    console.error('[ronin] ledger:', (e as Error)?.message ?? e);
  }
}
