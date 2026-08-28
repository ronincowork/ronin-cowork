import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from './stores.js';

export interface TeamTemplate { name: string; draft: Record<string, unknown> }
const file = () => path.join(storeDir('catalogs'), 'TEAM_TEMPLATES.json');
const valid = (name: string) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(name);

export async function listTeamTemplates(): Promise<TeamTemplate[]> {
  try {
    const rows = JSON.parse(await readFile(file(), 'utf8'));
    return Array.isArray(rows) ? rows.filter((row) => valid(row?.name) && row?.draft && typeof row.draft === 'object') : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function write(rows: TeamTemplate[]): Promise<void> {
  await mkdir(storeDir('catalogs'), { recursive: true });
  const target = file(), temp = `${target}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  await rename(temp, target);
}

export async function saveTeamTemplate(name: string, draft: Record<string, unknown>): Promise<void> {
  if (!valid(name)) throw new Error('Template name: lowercase letters, digits, - and _.');
  const rows = await listTeamTemplates(), clean = structuredClone(draft);
  delete clean.transaction;
  if (clean.team && typeof clean.team === 'object') {
    (clean.team as Record<string, unknown>).name = '';
    (clean.team as Record<string, unknown>).wipeboard = '';
  }
  const at = rows.findIndex((row) => row.name === name);
  const next = { name, draft: clean };
  if (at < 0) rows.push(next); else rows[at] = next;
  await write(rows.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function removeTeamTemplate(name: string): Promise<void> {
  if (!valid(name)) throw new Error('Invalid template name.');
  const rows = await listTeamTemplates(), next = rows.filter((row) => row.name !== name);
  if (next.length === rows.length) throw new Error(`Template "${name}" does not exist.`);
  await write(next);
}
