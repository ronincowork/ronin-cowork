import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A file an Agent links in Chat, as it wrote it: `~/…` is this machine's home, a full path is
 * itself, and a path relative to where it works is found in the first of `bases` that holds it
 * (its desks, then its working folder, its session folder and drop, the Workspace folders, the
 * library); failing those, a document on its work record that the path names the tail of
 * (ronin_cowork/plans/x.md for a plan in Ronin Lab, KAN-749). Only a file that is there: null
 * otherwise, so Chat links only what opens (KAN-701).
 */
export function resolveFileLink(link: string, bases: string[], docs: string[] = [], home = os.homedir()): string | null {
  const p = String(link ?? '').trim();
  if (!p) return null;
  const isFile = (file: string) => { try { return fs.statSync(file).isFile(); } catch { return false; } };
  if (p === '~' || p.startsWith('~/')) { const file = path.join(home, p.slice(1)); return isFile(file) ? file : null; }
  if (path.isAbsolute(p)) return isFile(p) ? p : null;
  for (const base of bases) {
    if (!base) continue;
    const file = path.resolve(base, p);
    if (isFile(file)) return file;
  }
  const tail = path.sep + path.normalize(p);
  return docs.find((doc) => path.isAbsolute(doc) && doc.endsWith(tail) && isFile(doc)) ?? null;
}
