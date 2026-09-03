import { access, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './resources.js';
import { storeDir } from './resources.js';
import type { ResolvedRoutine } from './routines.js';

export interface RoutineToolProjection {
  dir: string;
  path: string;
  delivered: string[];
  missing: string[];
}

const sourceFor = async (name: string): Promise<{ command: string; source: string }> => {
  if (name.startsWith('shim/')) {
    const command = name.slice('shim/'.length);
    return { command, source: path.join(REPO_ROOT, 'bin', 'shim', command) };
  }
  const own = path.join(storeDir('tools'), name);
  try {
    await access(own);
    return { command: name, source: own };
  } catch {
    return { command: name, source: path.join(REPO_ROOT, 'ronin_bin', name) };
  }
};

export async function projectRoutineTools(
  session: string,
  routines: ResolvedRoutine[],
  parentPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
): Promise<RoutineToolProjection> {
  const dir = path.join(storeDir('session_commands'), session);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const names = new Set<string>(['shim/tmux']);
  for (const routine of routines) if (routine.enabled) for (const tool of routine.tools) names.add(tool);
  const delivered: string[] = [];
  const missing: string[] = [];
  for (const name of [...names].sort()) {
    const { command, source } = await sourceFor(name);
    try {
      await access(source);
      await symlink(source, path.join(dir, command));
      delivered.push(name);
    } catch {
      missing.push(name);
    }
  }
  return { dir, path: `${dir}:${parentPath}`, delivered, missing };
}
