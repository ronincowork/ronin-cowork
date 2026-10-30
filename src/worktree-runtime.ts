import { access, lstat, symlink } from 'node:fs/promises';
import path from 'node:path';

const exists = (at: string): Promise<boolean> => access(at).then(() => true, () => false);

/**
 * Point a managed worktree's node_modules at the home checkout's (owner, KAN-89). Copying it
 * held every launch for up to 28 s. A worktree that already has a node_modules, linked or its
 * own copy, keeps it.
 */
export async function linkNodeModules(from: string, to: string): Promise<void> {
  const source = path.join(from, 'node_modules');
  const target = path.join(to, 'node_modules');
  if (!(await exists(source))) return;
  if (await lstat(target).then(() => true, () => false)) return;
  await symlink(source, target, 'dir');
}
