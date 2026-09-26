/* part of the ronin-cowork client — see js/README.md */
/**
 * DESKS — one session's worktrees, as the store last read them from `/api/desks`.
 *
 * A desk is one repository's branch and the worktree on it; a session has one per repo it
 * is changing. The server DERIVES every fact here from git and the desk registry at the
 * moment of asking — nothing an agent maintains in prose.
 *
 * ONE READER. The Work Record ladder shows the desks when it opens (js/tile.js
 * `openLadder`): it reads `/api/desks` through the store's snapshot at that moment, then
 * asks here for its session's entry. Nothing pushes desks and nothing keeps a clock for
 * them, so the reading is as fresh as the opening.
 */
import { get } from './store.js';

/** One session's desks and roll-up, or null when nothing has been read for it. */
export const desksOf = (name) => (name && get('desks')?.[name]) || null; // session name -> { desks: [], rollup: {} }
