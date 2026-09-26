/* part of the ronin-cowork client — see js/README.md */
/**
 * HOME DATA — the client's cache of what the server knows about sessions and catalogs.
 *
 * The rows themselves are the store's (js/store.js): the server pushes them on connect and
 * on change, and this module is their reader for the modules that import `homeData` — the
 * launcher and the tile pickers. A change of rows repaints the home panels once.
 *
 * The catalogs (projects) stay best-effort — they change when the owner changes them, and
 * the next successful load heals them without a banner.
 */
import { request } from './request.js';
import { subscribe } from './store.js';
import { tiles } from './state.js';
import { t } from './lexicon.js';

export let homeData = null; // session list enriched with status + ctx

subscribe('home', (rows) => {
  homeData = rows;
  tiles.forEach((tile) => tile.renderHome?.());
});

export let projectData = null; // /api/project-roots: [{name, title, dir, match[], remit, docs[], plans[]}]
// The provider catalog is not cached here: form-steps.js reads it for the one picker and
// the Campaign's Model providers surface, fresh on every surface entry.

const projectListeners = new Set();
/** Hear the catalog change: the Workspace folders surface reloads it after every keep or exclude. */
export function onProjects(listener) { projectListeners.add(listener); return () => projectListeners.delete(listener); }

export async function loadProjects() {
  const r = await request('/api/project-roots');
  if (r.ok && Array.isArray(r.data)) projectData = r.data;
  tiles.forEach((tile) => tile.renderHome?.());
  for (const listener of projectListeners) { try { listener(projectData); } catch (error) { console.error(error); } }
}

/**
 * What an Agent is doing now, in the owner's words — a function, not a table, because the
 * lexicon is loaded after this module is evaluated and a table would freeze the stock words. The backend decides which of these it
 * is — from the journal, except `asking`, which is the one thing only the screen shows —
 * and nothing here infers anything from anything.
 */
export function stanceLabel(stance) {
  return {
    working: t('home.stance_working', 'working…'),
    replying: t('home.stance_replying', 'replying…'),
    awaiting_you: t('home.stance_awaiting_you', 'awaiting you'),
    asking: t('home.stance_asking', 'asking you'),
    unknown: t('home.stance_unknown', ''),
  }[stance];
}
