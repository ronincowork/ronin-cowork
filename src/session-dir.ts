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
/**
 * THE ANSWER IS STABLE; THE SPAWN IS NOT FREE.
 *
 * A key is `@ronin-key` or `<name>-<created-epoch>` — stamped precisely so a rename cannot
 * change it, which is the same property that makes it safe to remember. Asking tmux again
 * costs a `fork()` out of a Node process carrying a ~42 GB address space, and the page-table
 * copy that implies is charged to the EVENT LOOP, not to a worker.
 *
 * Twenty-three call sites reach for the key, several of them more than once per request
 * (`tegami.ts` alone resolves it eight times), so a single browser tick asked tmux the same
 * unchanging question dozens of times. Profiled 2026-08-28 against the live server: `spawn`
 * was 90.5% of main-thread CPU and this function was 64.8% of it — a `/api/health` that
 * touches nothing measured p50 629 ms while the box sat 79% idle.
 *
 * Two guards, no new state anyone depends on: concurrent callers share one in-flight spawn,
 * and a resolved key is reused for TTL. The TTL matches the membership poll's own resolution
 * (`ws/events.ts`, 2s), so nothing here is staler than what the page is already drawing. A
 * failed read is never cached — no server means best effort, every time.
 */
const KEY_TTL_MS = 2_000;
const keyCache = new Map<string, { key: string; at: number }>();
const keyInFlight = new Map<string, Promise<string>>();

export async function sessionKey(name: string): Promise<string> {
  const hit = keyCache.get(name);
  if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
  const flying = keyInFlight.get(name);
  if (flying) return flying;

  const ask = (async () => {
    try {
      const { stdout } = await pexec('tmux', [
        'display-message',
        '-p',
        '-t',
        exactPane(name),
        '#{@ronin-key}\t#{session_created}',
      ]);
      const key = parseSessionKey(stdout, name);
      keyCache.set(name, { key, at: Date.now() });
      return key;
    } catch {
      return name; // no server: best effort, callers treat a missing dir as "no tape"
    } finally {
      keyInFlight.delete(name);
    }
  })();
  keyInFlight.set(name, ask);
  return ask;
}

/** Forget a remembered key — for a session that just died, was renamed or was recreated. */
export function forgetSessionKey(name?: string): void {
  if (name === undefined) keyCache.clear();
  else keyCache.delete(name);
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
