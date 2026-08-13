/**
 * A handoff dies with its session.
 *
 * The handoff is a session's BIRTH letter — the brief it was forked with. TEGAMI is its
 * LIVING letter. They describe the same session at two moments, so they should have the
 * same lifetime, and TEGAMI already works this way (it is a tmux user option; it cannot
 * outlive the session even in principle). A handoff is a file, so it can, and it did:
 * audited 2026-08-11, the repo held 38 handoffs for 16 live sessions. Every one carries an
 * `expires: when …` line because the forkit macro requires one, and in the entire history
 * of the repo not one had ever been deleted — a rule with a 0% enforcement rate.
 *
 * So this is not a cleanup, it is the removal of the thing that needed cleaning up. Nobody
 * has to remember, because remembering is what failed.
 *
 * WHY THIS HANGS OFF killSessionTree: that is the one implementation of the dangerous
 * thing, and every route to it — the trash button, `land`, `delete`, `tejun-harakiri` —
 * arrives there. Hooking each caller instead would be four places to forget, which is the
 * bug this file exists to delete.
 */
import { readdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `<repo>/co-working/user_repo/wip/handoffs` — resolved from this file, not from cwd. */
export const handoffDir = resolve(HERE, '..', 'co-working', 'user_repo', 'wip', 'handoffs');

/**
 * THE CASE TRAP, and why matching is case-insensitive.
 *
 * Handoff filenames do not reliably match their session's case: on 2026-08-11 the tree
 * held `RIREKI_RETHINK.md` for a live session named `rireki_rethink`, and four more of the
 * same shape. An exact-match check would have deleted 5 of 16 handoffs belonging to
 * sessions that were still running — a 31% false-delete rate on live work.
 *
 * Case-insensitive EQUALITY only. Never a prefix or substring match: `ad-facts` must not
 * reach `ad-facts-v2.md`, and a session named `co` must never take out `co-work.md`.
 */
function matches(fileBase: string, session: string): boolean {
  return fileBase.toLowerCase() === session.toLowerCase();
}

/**
 * Remove the handoff belonging to `session`, if it has one.
 *
 * Returns the path removed, or null if there was nothing to remove — an ordinary outcome,
 * not a failure: sessions started by hand never had a handoff.
 *
 * NEVER THROWS. A session must end whether or not its paperwork can be tidied; a failed
 * unlink that propagated would turn a delete into a hang, and the kill path is the last
 * place to add a way to fail. Problems are logged and swallowed.
 */
export async function removeHandoff(session: string): Promise<string | null> {
  if (!session) return null;
  try {
    const entries = await readdir(handoffDir);
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.md')) continue;
      if (!matches(entry.slice(0, -3), session)) continue;
      const path = join(handoffDir, entry);
      await unlink(path);
      console.log(`[tmux-ronin] handoff removed with session ${session}: ${entry}`);
      return path;
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    // No handoffs directory at all is normal in a fresh checkout, not worth a line.
    if (code !== 'ENOENT') {
      console.error(`[tmux-ronin] handoff cleanup for ${session}:`, (e as Error)?.message ?? e);
    }
  }
  return null;
}
