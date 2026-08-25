/**
 * SOP SHELF — resolved stock and owner files, whole-file shadowed by filename.
 *
 * This is a typed read surface, not an editor. It reads only the two declared SOP roots:
 * shipped `ronin_sops/` and `storeDir('sops')`. A user file of the same name replaces the
 * stock file whole; a new user file joins the shelf. Missing user storage is ordinary.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { storeDir } from './stores.js';
import type { Origin } from './catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK_SOPS = path.join(ROOT, 'ronin_sops');

export interface SopRow {
  name: string;
  label: string;
  blurb: string;
  content: string;
  origin: Origin;
  shadowed: boolean;
}

const isSop = (name: string): boolean =>
  name.endsWith('.md') && !name.startsWith('.') && name !== 'README.md';

async function readShelf(dir: string, origin: Origin): Promise<Map<string, SopRow>> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw e;
  }

  const rows = new Map<string, SopRow>();
  for (const file of entries
    .filter((entry) => entry.isFile() && isSop(entry.name))
    .map((entry) => entry.name)
    .sort()) {
    let content: string;
    try {
      content = await readFile(path.join(dir, file), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw e;
    }
    const name = file.slice(0, -3);
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || name;
    const blurb = content
      .split(/\n\s*\n/)
      .map((part) => part.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim())
      .find((part) => part && !part.startsWith('#')) || '';
    rows.set(name, { name, label: title, blurb, content, origin, shadowed: false });
  }
  return rows;
}

/** Resolved alphabetical shelf, with provenance sufficient for the shared UI marks. */
export async function listSops(): Promise<SopRow[]> {
  const [stock, user] = await Promise.all([
    readShelf(STOCK_SOPS, 'stock'),
    readShelf(storeDir('sops'), 'user'),
  ]);
  const merged = new Map(stock);
  for (const [name, row] of user) merged.set(name, { ...row, shadowed: stock.has(name) });
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
}
