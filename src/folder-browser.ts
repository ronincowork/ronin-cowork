import { mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { execFile as execFileP } from './spawn-broker.js';
import os from 'node:os';
import path from 'node:path';
import { HIDDEN_REFUSED, refusedHere } from './open-places.js';

const HOME = path.resolve(os.homedir());
const NAME = /^[^/\\\0]{1,120}$/;

async function safeDirectory(raw: string): Promise<string> {
  const requested = path.resolve(String(raw || HOME));
  const resolved = await realpath(requested);
  const relative = path.relative(HOME, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a folder inside your home directory.');
  if (await refusedHere(requested, resolved)) throw new Error(HIDDEN_REFUSED);
  if (!(await stat(resolved)).isDirectory()) throw new Error('That is not a folder.');
  return resolved;
}

export interface FolderListing {
  home: string;
  dir: string;
  parent: string | null;
  /** Whether hidden folders can be shown here: never in an office (open-places.ts). */
  hidden_shown: boolean;
  folders: Array<{ name: string; dir: string; kind: 'repository' | 'folder'; repository: boolean }>;
}

/** What a Workspace row shows of its folder: whether it is there, and, for a repository, its
 * origin remote and branch (the repo's settings default its stable branch to that branch). */
export async function folderFacts(raw: string): Promise<{ dir: string; exists: boolean; repo: { remote: string; branch: string } | null }> {
  const dir = path.resolve(String(raw || '').replace(/^~(?=\/|$)/, HOME));
  const exists = await stat(dir).then((s) => s.isDirectory(), () => false);
  if (!exists || !(await stat(path.join(dir, '.git')).then(() => true, () => false))) return { dir, exists, repo: null };
  const git = (args: string[]) => execFileP('git', ['-C', dir, ...args], { timeout: 4000 }).then((r) => r.stdout.trim(), () => '');
  return { dir, exists, repo: { remote: await git(['remote', 'get-url', 'origin']), branch: await git(['branch', '--show-current']) } };
}

export async function browseFolders(raw: string, options: { hidden?: boolean; query?: string } = {}): Promise<FolderListing> {
  const dir = await safeDirectory(raw || HOME);
  const hiddenShown = !(await refusedHere(path.join(HOME, '.hidden')));
  const query = String(options.query ?? '').trim().toLocaleLowerCase().slice(0, 80);
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => entry.isDirectory() && ((options.hidden && hiddenShown) || !entry.name.startsWith('.')))
    .filter((entry) => !query || entry.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 200);
  const folders = await Promise.all(visible.map(async (entry) => {
    const entryDir = path.join(dir, entry.name);
    const repository = await stat(path.join(entryDir, '.git')).then(() => true, () => false);
    return { name: entry.name, dir: entryDir, kind: repository ? 'repository' as const : 'folder' as const, repository };
  }));
  return { home: HOME, dir, parent: dir === HOME ? null : path.dirname(dir), hidden_shown: hiddenShown, folders };
}

export async function createFolder(parentRaw: string, nameRaw: string, initGit = false): Promise<{ dir: string; git: boolean }> {
  const parent = await safeDirectory(parentRaw || HOME);
  const name = String(nameRaw ?? '').trim();
  if (!NAME.test(name) || name === '.' || name === '..') throw new Error('Use a folder name without slashes.');
  const dir = path.join(parent, name);
  const relative = path.relative(HOME, dir);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a folder inside your home directory.');
  if (await refusedHere(dir)) throw new Error(HIDDEN_REFUSED);
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
