/** A folder's facts (KAN-809: the folder browser and picker went; Explorer is where folders are handled). */
import { stat } from 'node:fs/promises';
import { execFile as execFileP } from './spawn-broker.js';
import os from 'node:os';
import path from 'node:path';

const HOME = path.resolve(os.homedir());

/** What a Workspace row shows of its folder: whether it is there, and, for a repository, its
 * origin remote and branch (the repo's settings default its stable branch to that branch). */
export async function folderFacts(raw: string): Promise<{ dir: string; exists: boolean; repo: { remote: string; branch: string } | null }> {
  const dir = path.resolve(String(raw || '').replace(/^~(?=\/|$)/, HOME));
  const exists = await stat(dir).then((s) => s.isDirectory(), () => false);
  if (!exists || !(await stat(path.join(dir, '.git')).then(() => true, () => false))) return { dir, exists, repo: null };
  const git = (args: string[]) => execFileP('git', ['-C', dir, ...args], { timeout: 4000 }).then((r) => r.stdout.trim(), () => '');
  return { dir, exists, repo: { remote: await git(['remote', 'get-url', 'origin']), branch: await git(['branch', '--show-current']) } };
}
