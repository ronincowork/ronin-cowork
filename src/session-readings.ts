/**
 * SESSION READINGS — a typed, read-only inventory of the boot-shelf levels.
 *
 * A leaf symlink is an explicit shelf entry and may be read; symlinked directories are
 * refused so one link cannot turn this typed surface into an arbitrary directory browser.
 * No resolved filesystem path crosses the API.
 */
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { storeDir } from './stores.js';
import type { Origin } from './resources.js';
import { renderGlossary, renderSessionMacrosReading } from './session-boot.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOCK = path.join(ROOT, 'ronin_session_boot');

export interface SessionReadingRow {
  name: string;
  label: string;
  blurb: string;
  content: string;
  level: string;
  origin: Origin;
  shadowed: boolean;
  linked: boolean;
}

interface LevelDir { level: string; dir: string; origin: Origin }

async function realDirectories(base: string, prefix: string): Promise<LevelDir[]> {
  let entries;
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ level: `${prefix}/${entry.name}`, dir: path.join(base, entry.name), origin: 'stock' as Origin }));
}

async function levelDirs(base: string, origin: Origin): Promise<LevelDir[]> {
  const out: LevelDir[] = [];
  const add = async (level: string, dir: string) => {
    try {
      if ((await lstat(dir)).isDirectory()) out.push({ level, dir, origin });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  };
  await add('all', path.join(base, 'all'));
  for (const prefix of ['root', 'role', 'routine']) {
    for (const item of await realDirectories(path.join(base, prefix), prefix)) out.push({ ...item, origin });
  }
  let top;
  try {
    top = await readdir(base, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return out;
    throw e;
  }
  for (const entry of top.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.name.endsWith('_connected') || entry.name.startsWith('.') || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    out.push({ level: entry.name, dir: path.join(base, entry.name), origin });
  }
  return out;
}

async function filesIn(level: LevelDir): Promise<SessionReadingRow[]> {
  const entries = await readdir(level.dir, { withFileTypes: true });
  const rows: SessionReadingRow[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || (!entry.isFile() && !entry.isSymbolicLink())) continue;
    const file = path.join(level.dir, entry.name);
    try {
      if (!(await stat(file)).isFile()) continue;
      const content = await readFile(file, 'utf8');
      rows.push({
        name: `${level.level}/${entry.name}`,
        label: entry.name,
        blurb: level.level,
        content,
        level: level.level,
        origin: level.origin,
        shadowed: false,
        linked: entry.isSymbolicLink(),
      });
    } catch {
      // Dangling, unreadable or vanished shelf entries do not reach a session either.
    }
  }
  return rows;
}

/** Every concrete live level, with owner files replacing stock by level + filename. */
export async function listSessionReadings(): Promise<SessionReadingRow[]> {
  const [stockDirs, userDirs] = await Promise.all([levelDirs(STOCK, 'stock'), levelDirs(storeDir('session_boot'), 'user')]);
  const rows = new Map<string, SessionReadingRow>();
  for (const level of [...stockDirs, ...userDirs]) {
    for (const row of await filesIn(level)) {
      const prior = rows.get(row.name);
      rows.set(row.name, { ...row, shadowed: row.origin === 'user' && prior?.origin === 'stock' });
    }
  }
  // Generated last at birth, so it wins this filename here too. It is rendered in memory:
  // inspecting Customize must not create the disposable boot cache.
  // The glossary, likewise rendered in memory from the copy that won and the owner's desk words.
  const glossaryRow = rows.get('all/KOTOBA_GLOSSARY.md');
  if (glossaryRow) {
    rows.set('all/KOTOBA_GLOSSARY.md', { ...glossaryRow, content: await renderGlossary(glossaryRow.content), blurb: `${glossaryRow.blurb} · rendered for the owner's desk profile` });
  }
  rows.set('all/SESSION_MACROS.md', {
    name: 'all/SESSION_MACROS.md',
    label: 'SESSION_MACROS.md',
    blurb: 'all · generated from the live macro catalog',
    content: await renderSessionMacrosReading(),
    level: 'all',
    origin: 'stock',
    shadowed: false,
    linked: false,
  });
  return [...rows.values()].sort((a, b) => a.level.localeCompare(b.level) || a.label.localeCompare(b.label));
}
