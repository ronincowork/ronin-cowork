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

/**
 * Where a named tool's executable is. A guard shim is only ever ours. Every other bare
 * command resolves the way every shelf does — the owner's `tools` store first (a template
 * bundle installs there, src/bundles.ts), then the shipped `ronin_bin/`. A user file of
 * the same name shadows ours whole, exactly as a user SOP or macro does.
 */
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
  /**
   * BOTH GUARD SHIMS ARE FLOOR, and `systemctl` is here for a reason that cost this box
   * every live session twice in one day. An Agent does not source an rc file, so the
   * `bin/shim` directory on the owner's login PATH never reaches it: `systemctl` resolved
   * to `/usr/bin/systemctl` and the refusal that stands between an ordinary-looking
   * command and stopping the unit that owns every session simply never ran. Projecting it
   * here puts the guard in front of exactly the population that cannot get it any other
   * way. It passes `restart ronin` straight through; it is only ever in the way of the
   * one command nobody means to type.
   */
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
