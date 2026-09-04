import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { execFile as execFileP } from './spawn-broker.js';
import os from 'node:os';
import path from 'node:path';

const HOME = path.resolve(os.homedir());
const NAME = /^[^/\\\0]{1,120}$/;

async function safeDirectory(raw: string): Promise<string> {
  const requested = path.resolve(String(raw || HOME));
  const resolved = await realpath(requested);
  const relative = path.relative(HOME, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a folder inside your home directory.');
  if (!(await stat(resolved)).isDirectory()) throw new Error('That is not a folder.');
  return resolved;
}

export interface FolderListing {
  home: string;
  dir: string;
  parent: string | null;
  folders: Array<{ name: string; dir: string }>;
}

export async function browseFolders(raw: string, options: { hidden?: boolean; query?: string } = {}): Promise<FolderListing> {
  const dir = await safeDirectory(raw || HOME);
  const query = String(options.query ?? '').trim().toLocaleLowerCase().slice(0, 80);
  const entries = await readdir(dir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && (options.hidden || !entry.name.startsWith('.')))
    .filter((entry) => !query || entry.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200)
    .map((entry) => ({ name: entry.name, dir: path.join(dir, entry.name) }));
  return { home: HOME, dir, parent: dir === HOME ? null : path.dirname(dir), folders };
}

export async function createFolder(parentRaw: string, nameRaw: string, initGit = false): Promise<{ dir: string; git: boolean }> {
  const parent = await safeDirectory(parentRaw || HOME);
  const name = String(nameRaw ?? '').trim();
  if (!NAME.test(name) || name === '.' || name === '..') throw new Error('Use a folder name without slashes.');
  const dir = path.join(parent, name);
  const relative = path.relative(HOME, dir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a folder inside your home directory.');
  await mkdir(dir);
  if (initGit) {
    try {
      await execFileP('git', ['init', '-b', 'main', dir], { timeout: 10_000 });
    } catch (error) {
      await import('node:fs/promises').then(({ rmdir }) => rmdir(dir).catch(() => {}));
      throw error;
    }
  }
  return { dir, git: initGit };
}
