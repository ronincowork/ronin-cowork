/** Build the command lookup projected into one Cowork Agent at birth. */
import { access, mkdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './config.js';
import { storeDir } from './stores.js';
import type { ResolvedRoutine } from './routines.js';

export interface RoutineToolProjection {
  dir: string;
  path: string;
  delivered: string[];
  missing: string[];
}

const sourceFor = (name: string): { command: string; source: string } => name === 'shim/tmux'
  ? { command: 'tmux', source: path.join(REPO_ROOT, 'bin', 'shim', 'tmux') }
  : { command: name, source: path.join(REPO_ROOT, 'ronin_bin', name) };

/**
 * The guard shim is floor. Every other bare command comes from an enabled Routine.
 * Missing commands are reported, never fatal: an unavailable Routine does not refuse
 * birth. The directory is per session so simultaneous births cannot alter each other.
 */
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
    const { command, source } = sourceFor(name);
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
