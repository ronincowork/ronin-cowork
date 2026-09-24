import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mandate } from './agent-defaults.js';
import { listBehaviours } from './resource-adapters.js';
import { sessionDir, sessionKey } from './session-dir.js';
import { readTegami } from './tegami-read.js';

type Receipt = { mandate?: unknown; behaviours?: Array<{ book?: string; file?: string }>; stated_by?: unknown };
export const birthMandateFromReceipt = (receipt: Receipt) => receipt.mandate === undefined ? null : mandate(receipt.mandate);

async function receiptFor(name: string): Promise<Receipt> {
  return JSON.parse(await readFile(path.join(sessionDir(await sessionKey(name)), 'birth-receipt.json'), 'utf8')) as Receipt;
}

const additionsFile = (key: string) => path.join(sessionDir(key), 'composition-additions.json');
const additionWrites = new Map<string, Promise<unknown>>();
async function additionsFor(key: string): Promise<Array<{ name: string; path: string }>> {
  try {
    const rows = JSON.parse(await readFile(additionsFile(key), 'utf8')) as unknown;
    return Array.isArray(rows) ? rows.flatMap((row) => row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string'
      ? [{ name: (row as { name: string }).name, path: String((row as { path?: unknown }).path ?? '') }] : []) : [];
  } catch { return []; }
}

export async function addCurrentBehaviourAt<T = undefined>(dir: string, behaviour: { name: string; path: string }, deliver?: () => Promise<T>) {
  const target = path.join(dir, 'composition-additions.json');
  const previous = additionWrites.get(target) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    let rows: Array<{ name: string; path: string }> = [];
    try { rows = JSON.parse(await readFile(target, 'utf8')) as Array<{ name: string; path: string }>; } catch { /* first addition */ }
    if (rows.some((row) => row.name === behaviour.name)) return { added: false, rows, delivery: undefined };
    const delivery = deliver ? await deliver() : undefined;
    rows.push(behaviour);
    const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8'); await rename(temp, target);
    return { added: true, rows, delivery };
  });
  additionWrites.set(target, write);
  try { return await write; } finally { if (additionWrites.get(target) === write) additionWrites.delete(target); }
}

export async function addCurrentBehaviour<T = undefined>(name: string, behaviour: { name: string; path: string }, deliver?: () => Promise<T>) {
  return addCurrentBehaviourAt(sessionDir(await sessionKey(name)), behaviour, deliver);
}

export async function readAgentComposition(name: string) {
  const key = await sessionKey(name);
  const [receipt, work, brief, catalog, additions] = await Promise.all([
    receiptFor(name), readTegami(name), readFile(path.join(sessionDir(key), 'brief.md'), 'utf8').catch(() => ''), listBehaviours(), additionsFor(key),
  ]);
  if (!work) throw new Error(`@${name} has no readable work record`);
  const born = (receipt.behaviours ?? []).map((row) => ({ name: row.book ?? '', path: row.file ?? '' })).filter((row) => row.name);
  const bornMandate = birthMandateFromReceipt(receipt);
  return {
    birth: { mandate: bornMandate, behaviours: born, brief, provenance: receipt.stated_by ?? null },
    current: { mandate: work.mandate, behaviours: [...born, ...additions.filter((row) => !born.some((item) => item.name === row.name))] },
    available_behaviours: catalog.filter((row) => row.scope === 'selected').map((row) => ({ name: row.name, label: row.label, blurb: row.blurb, path: row.page })),
  };
}
