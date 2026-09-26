/* part of the ronin-cowork client — see js/README.md */
/**
 * DESKS — one session's worktrees, read from `/api/desks?session=<name>` when asked.
 *
 * A desk is one repository's branch and the worktree on it; a session has one per repo it
 * is changing. The server DERIVES every fact here from git and the desk registry at the
 * moment of asking — nothing an agent maintains in prose.
 *
 * ONE READER. The Work Record ladder shows the desks when it opens (js/tile.js
 * `openLadder`) and paints what this read answers. Desks are not a published resource:
 * nothing pushes them, the store does not hold them, and nothing keeps a clock for them,
 * so the reading is as fresh as the opening.
 */
import { request } from './request.js';

/** One session's desks and roll-up, or null when it has none or the read failed. */
export async function readDesks(session) {
  const r = await request('/api/desks?session=' + encodeURIComponent(session), { cache: 'no-store' });
  return r.ok ? r.data?.[session] || null : null;
}
