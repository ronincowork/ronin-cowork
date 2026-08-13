import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { exactPane } from './tmux.js';
import { storeDir } from './stores.js';

const pexec = promisify(execFile);

/**
 * THE SESSION DIRECTORY — one directory per session, outside every repo.
 *
 * CORE, deliberately: the `session` store holds every tenant's files — RIREKI's tape,
 * MICHI's letter, Koshi's koshi.json — and the KYOKAI ruling (owner, 2026-08-13) is
 * that resolving it is nobody's private property: a service reaches its tenancy through
 * this module rather than through another service's. `src/stores.ts` decides where the
 * store is; this module only derives the per-session key and directory.
 *
 * The exported names keep their history (`RIREKI_DIR` — the recorder got here first);
 * renaming them is churn with no behavior, so it waits for a reason.
 */
export const RIREKI_DIR = storeDir('session');

/**
 * A session's KEY — its identity, not its name.
 *
 * tmux names are mutable and reusable, which cost us two real bugs: a rename orphaned
 * the tape under a name that no longer existed, and a recreated session appended into
 * the dead one's tape. `<name>-<created-epoch>` is stable across renames and unique per
 * creation. `@ronin-key` is the stamped copy — a pointer, not state — and is preferred
 * so a rename cannot change the answer. The applet derives the identical value with no
 * Ronin involved, which is what keeps it standalone.
 */
export async function sessionKey(name: string): Promise<string> {
  try {
    const { stdout } = await pexec('tmux', [
      'display-message',
      '-p',
      '-t',
      exactPane(name),
      '#{@ronin-key}\t#{session_created}',
    ]);
    return parseSessionKey(stdout, name);
  } catch {
    return name; // no server: best effort, callers treat a missing dir as "no tape"
  }
}

/**
 * The pure half of sessionKey: tmux's `#{@ronin-key}\t#{session_created}` output → key.
 * Exported for the unit floor (tests/rireki.test.ts) — the bug below is its spec.
 *
 * SPLIT BEFORE TRIMMING. tmux prints an EMPTY FIELD for an unset user option, so an
 * unstamped session's output begins with the tab: "\t1786281078". `.trim()` ate that
 * leading tab, the split then yielded one field, and the created-epoch was mistaken
 * for the stamped key — state landing in <store>/<epoch>/ instead of
 * <store>/<name>-<epoch>/. Every session is unstamped for the window between
 * its creation and the janitor's next pass, which is exactly when a newborn session
 * is seeded, so this fired on every fresh session and on nothing else.
 */
export function parseSessionKey(stdout: string, name: string): string {
  const [stamped, created] = stdout.replace(/\r?\n+$/, '').split('\t');
  const born = (created ?? '').trim();
  return stamped?.trim() || (born ? `${name}-${born}` : name);
}

/** The whole per-session directory — ours plus every other tenant's. */
export function sessionDir(key: string): string {
  return path.join(RIREKI_DIR, key);
}
