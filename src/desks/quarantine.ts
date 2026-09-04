import { randomUUID } from 'node:crypto';
import { mkdir, copyFile, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storeDir } from '../resources.js';
import { git, gitOut } from './git.js';
import { parsePorcelainZ, type EndingChanges, type EndingDeskFact } from './ending.js';

export interface QuarantineManifest {
  version: 1;
  id: string;
  created_at: string;
  repo: string;
  branch: string;
  line: string;
  owners: string[];
  team: string;
  tip: string;
  line_tip: string;
  quarantine_ref: string;
  changes: EndingChanges;
  staged_patch: string;
  unstaged_patch: string;
  untracked_root: string;
}

export interface DiscardReceipt {
  version: 1;
  id: string;
  discarded_at: string;
  confirmation: string;
  repo: string;
  branch: string;
  owners: string[];
  commits: string[];
  files: string[];
}

const safe = (token: string): string => token.replace(/[^A-Za-z0-9._-]/g, '_');
const root = () => path.join(storeDir('desks'), 'quarantine');

async function atomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await rename(tmp, file);
}

async function copyUntracked(worktree: string, files: string[], destination: string): Promise<void> {
  for (const relative of files) {
    const source = path.resolve(worktree, relative);
    const base = path.resolve(worktree) + path.sep;
    if (!source.startsWith(base)) throw new Error(`untracked path escapes worktree: ${relative}`);
    const st = await lstat(source);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error(`quarantine only copies regular untracked files: ${relative}`);
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(source, target);
  }
}

export async function quarantineDesk(fact: EndingDeskFact, id = `q_${Date.now()}_${randomUUID().slice(0, 8)}`): Promise<QuarantineManifest> {
  const dir = path.join(root(), safe(fact.repo), safe(id));
  await mkdir(path.dirname(dir), { recursive: true, mode: 0o700 });
  await mkdir(dir, { recursive: false, mode: 0o700 });
  const changes = fact.mounted
    ? parsePorcelainZ((await git(fact.worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout)
    : fact.changes;
  const quarantine_ref = fact.tip ? `refs/ronin/quarantine/${safe(id)}` : '';
  try {
    if (quarantine_ref) await git(fact.repo_dir, ['update-ref', quarantine_ref, fact.tip]);
    const staged_patch = path.join(dir, 'staged.patch');
    const unstaged_patch = path.join(dir, 'unstaged.patch');
    if (fact.mounted) {
      await writeFile(staged_patch, await gitOut(fact.worktree, ['diff', '--cached', '--binary']), { mode: 0o600 });
      await writeFile(unstaged_patch, await gitOut(fact.worktree, ['diff', '--binary']), { mode: 0o600 });
      await copyUntracked(fact.worktree, changes.untracked, path.join(dir, 'untracked'));
    } else {
      await writeFile(staged_patch, '', { mode: 0o600 });
      await writeFile(unstaged_patch, '', { mode: 0o600 });
    }
    const manifest: QuarantineManifest = {
      version: 1, id, created_at: new Date().toISOString(), repo: fact.repo, branch: fact.branch,
      line: fact.line, owners: fact.owners, team: fact.team, tip: fact.tip, line_tip: fact.line_tip,
      quarantine_ref, changes,
      staged_patch: path.relative(dir, staged_patch), unstaged_patch: path.relative(dir, unstaged_patch),
      untracked_root: 'untracked',
    };
    await atomicJson(path.join(dir, 'manifest.json'), manifest);
    return manifest;
  } catch (error) {
    if (quarantine_ref) await git(fact.repo_dir, ['update-ref', '-d', quarantine_ref]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function readQuarantine(repo: string, id: string): Promise<QuarantineManifest> {
  return JSON.parse(await readFile(path.join(root(), safe(repo), safe(id), 'manifest.json'), 'utf8')) as QuarantineManifest;
}

export async function writeDiscardReceipt(input: Omit<DiscardReceipt, 'version' | 'id' | 'discarded_at'>): Promise<DiscardReceipt> {
  if (!input.confirmation.trim()) throw new Error('intentional discard requires explicit confirmation');
  const receipt: DiscardReceipt = {
    version: 1, id: `discard_${Date.now()}_${randomUUID().slice(0, 8)}`,
    discarded_at: new Date().toISOString(), ...input,
  };
  await atomicJson(path.join(storeDir('desks'), 'discard-receipts', safe(input.repo), `${safe(receipt.id)}.json`), receipt);
  return receipt;
}
