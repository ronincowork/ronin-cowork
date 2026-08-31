/**
 * WAYS SHELF — the optional ways of working, listed for the loadout trays.
 *
 * A typed read surface over shipped `ways/` and the owner's whole-file shadows.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { storeDir } from './stores.js';
import type { Origin } from './catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK_WAYS = path.join(ROOT, 'ways');

export interface WayRow {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
  shadowed: boolean;
}

const isWay = (name: string): boolean =>
  name.endsWith('.md') && !name.startsWith('.') && name !== 'README.md';

async function readShelf(dir: string, origin: Origin): Promise<Map<string, WayRow>> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter(isWay).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw e;
  }
  const rows = new Map<string, WayRow>();
  for (const file of names) {
    let content = '';
    try {
      content = await readFile(path.join(dir, file), 'utf8');
    } catch {
      continue; // vanished mid-read
    }
    const name = file.slice(0, -3);
    const label = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || name;
    const blurb = content
      .split(/\n\s*\n/)
      .map((part) => part.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim())
      .find((part) => part && !part.startsWith('#')) || '';
    rows.set(name, { name, label, blurb: blurb.slice(0, 200), origin, shadowed: false });
  }
  return rows;
}

/** Resolved alphabetical shelf; an owner's same-name file wins whole. */
export async function listWays(): Promise<WayRow[]> {
  const [stock, user] = await Promise.all([
    readShelf(STOCK_WAYS, 'stock'),
    readShelf(storeDir('ways'), 'user'),
  ]);
  const merged = new Map(stock);
  for (const [name, row] of user) merged.set(name, { ...row, shadowed: stock.has(name) });
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
}
