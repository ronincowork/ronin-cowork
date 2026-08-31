/**
 * WAYS SHELF — the optional ways of working, listed for the loadout trays.
 *
 * A typed read surface over shipped `ways/` only. The shelf's own README promises the
 * owner may replace a book whole, but no `ways` store exists in the registry yet — that
 * is a stores decision, raised rather than taken here — so every row is honestly
 * `stock` until one is ruled. The forms read this list; birth delivery of a selected
 * book is the loadout wiring, which is not this reader's business.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Origin } from './catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK_WAYS = path.join(ROOT, 'ways');

export interface WayRow {
  name: string;
  label: string;
  blurb: string;
  origin: Origin;
}

const isWay = (name: string): boolean =>
  name.endsWith('.md') && !name.startsWith('.') && name !== 'README.md';

/** The shipped shelf, alphabetical by token — the catalog is the count. */
export async function listWays(): Promise<WayRow[]> {
  let names: string[];
  try {
    names = (await readdir(STOCK_WAYS)).filter(isWay).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  const rows: WayRow[] = [];
  for (const file of names) {
    let content = '';
    try {
      content = await readFile(path.join(STOCK_WAYS, file), 'utf8');
    } catch {
      continue; // vanished mid-read
    }
    const name = file.slice(0, -3);
    const label = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || name;
    const blurb = content
      .split(/\n\s*\n/)
      .map((part) => part.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim())
      .find((part) => part && !part.startsWith('#')) || '';
    rows.push({ name, label, blurb: blurb.slice(0, 200), origin: 'stock' });
  }
  return rows;
}
