/**
 * PARKING AN OFFICE — what a whole-machine archive carries besides the stores (KAN-502).
 *
 * `bin/ronin-archive` asks `POST /api/machine/park`, which archives every Agent through the
 * ordinary archive path and then asks here what lives OUTSIDE every store that a resumed
 * Agent needs. The stores themselves travel keyed by id, as `bin/ronin-export` carries them.
 * Everything named here travels keyed by its absolute path and lands at the same path:
 *
 * - every Workspace Folder's directory — the repositories, whose `.git/worktrees` the managed
 *   worktrees (in the `worktrees` store) point back into;
 * - each Agent's provider conversation: the journal segments its launch identity owns, and a
 *   segment's same-named folder beside it (Claude keeps sub-agent and tool-result files there);
 * - for each provider in use, its credentials and the declared `carry` files (the CLI's own
 *   settings, without which a fresh home asks first-run questions instead of resuming).
 *
 * A path inside a store is left out: the store already carries it. A folder that holds Ronin's
 * own roots — the "home" folder a fresh install registers is the home directory itself — is
 * not carried whole (that would be the stores twice, the install and every cache); the
 * Workspace Folders inside it travel one by one, and its loose files stay behind.
 */
import { stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AGENTS } from './agents.js';
import { readLaunchIdentity } from './launch-binding.js';
import { resolveLaunchSegments } from './launch-journal.js';
import { listProjectRoots } from './project-roots.js';
import { STORES, rootDir, storeDir } from './resources.js';
import type { ArchivedSession } from './session-archive.js';

const exists = (p: string) => stat(p).then(() => true, () => false);
const inside = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);

/** Keep only the outermost of nested paths, and nothing a store already holds. */
function outermost(paths: string[], storeDirs: string[]): string[] {
  const sorted = [...new Set(paths.map((p) => path.resolve(p)))].sort();
  const kept: string[] = [];
  for (const p of sorted) {
    if (storeDirs.some((dir) => inside(p, dir))) continue;
    if (kept.some((k) => inside(p, k))) continue;
    kept.push(p);
  }
  return kept;
}

export interface ParkCarry { folders: string[]; files: string[] }

export async function parkCarry(archived: readonly ArchivedSession[]): Promise<ParkCarry> {
  const storeDirs = STORES.map((s) => storeDir(s.id));
  const folders: string[] = [];
  const roots = [rootDir('user'), rootDir('data')].map((r) => path.resolve(r));
  for (const root of await listProjectRoots()) {
    if (!root.dir || !await exists(root.dir)) continue;
    if (roots.some((r) => inside(r, path.resolve(root.dir)))) continue; // holds Ronin's roots
    folders.push(root.dir);
  }

  const files: string[] = [];
  const clis = new Set<string>();
  for (const session of archived) {
    clis.add(session.agent);
    const identity = await readLaunchIdentity(session.key);
    if (!identity) continue;
    const chain = await resolveLaunchSegments(identity).catch(() => null);
    const segments = chain && 'files' in chain ? chain.files : identity.journalFile ? [identity.journalFile] : [];
    for (const file of segments) {
      files.push(file);
      const beside = file.replace(/\.jsonl$/, '');
      if (beside !== file && await exists(beside)) files.push(beside);
    }
  }
  for (const cli of clis) {
    const agent = AGENTS.find((a) => a.id === cli);
    if (!agent) continue;
    for (const rel of [...agent.credentials, ...agent.carry]) {
      const file = path.join(os.homedir(), rel);
      if (await exists(file)) files.push(file);
    }
  }
  const keptFolders = outermost(folders, storeDirs);
  return { folders: keptFolders, files: outermost(files, [...storeDirs, ...keptFolders]) };
}
