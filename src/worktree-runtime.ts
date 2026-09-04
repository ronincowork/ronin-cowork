import { access, cp, lstat, rm } from 'node:fs/promises';
import path from 'node:path';

const exists = (at: string): Promise<boolean> => access(at).then(() => true, () => false);

/** Give a managed worktree its own dependency tree. Never alias the live operator install. */
export async function materializeNodeModules(from: string, to: string): Promise<void> {
  const source = path.join(from, 'node_modules');
  const target = path.join(to, 'node_modules');
  if (!(await exists(source))) return;
  const stat = await lstat(target).catch(() => null);
  if (stat?.isSymbolicLink()) await rm(target);
  else if (stat) return;
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
}
