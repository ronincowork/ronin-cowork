/** Resolve journals only inside the location owned by the launch declaration. */
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { writeLaunchIdentity } from './launch-binding.js';
import type { LaunchIdentity } from './sockets-contract.js';
const field = (value: unknown, key: string): unknown => key.split('.').reduce<unknown>((v, k) =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined, value);
const matches = (name: string, pattern: string) => new RegExp('^' + pattern.split('*')
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name);
async function files(root: string, pattern: string): Promise<string[]> {
  const rows = await readdir(root, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return []; throw e;
  });
  const nested = await Promise.all(rows.map(row => row.isDirectory() ? files(path.join(root, row.name), pattern)
    : Promise.resolve(row.isFile() && matches(row.name, pattern) ? [path.join(root, row.name)] : [])));
  return nested.flat().sort();
}
export async function resolveLaunchJournal(identity: LaunchIdentity): Promise<string | null> {
  if (identity.journalFile) return identity.journalFile;
  if (!identity.journal || identity.strategy === 'unbound') return null;
  const declaration = identity.journal;
  const pattern = declaration.pattern.replaceAll('{session_id}', identity.providerSession);
  for (const file of await files(declaration.root, pattern)) {
    if (identity.providerSession && declaration.pattern.includes('{session_id}')) {
      identity.journalFile = file;
      await writeLaunchIdentity(identity);
      return file;
    }
    const handle = await open(file, 'r');
    let row: unknown;
    try {
      const buf = Buffer.alloc(65536);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      const end = buf.subarray(0, bytesRead).indexOf(10);
      if (end < 0) return null; // the first journal record is still being appended
      row = JSON.parse(buf.subarray(0, end).toString('utf8'));
    } finally { await handle.close(); }
    const child = declaration.childPath ? field(row, declaration.childPath) : undefined;
    if (child === true || (child !== null && typeof child === 'object')) continue;
    const id = field(row, declaration.idPath);
    if (typeof id !== 'string' || !id) return null;
    // Named/minted identities select their declared id; isolated identities own this directory.
    if (identity.providerSession && identity.providerSession !== id) continue;
    identity.providerSession = id;
    identity.journalFile = file;
    await writeLaunchIdentity(identity);
    return file;
  }
  return null;
}
