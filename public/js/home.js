/* part of the ronin-cowork client — see js/README.md */
/**
 * The workspace-folder catalog and the words for an Agent's stance. The home rows
 * themselves are the store's (js/store.js).
 *
 * The catalog stays best-effort — it changes when the owner changes it, and the next
 * successful load heals it without a banner.
 */
import { request } from './request.js';
import { t } from './lexicon.js';
import { subscribe } from './store.js';

// The restored roster (js/roster.js) reads the pushed rows here. The store reconnects on
// its own and says so, so the roster's stale line has no fault to show.
export let homeData = null;
export const homeFault = null;
subscribe('home', (rows) => { homeData = rows; });

export let projectData = null; // /api/project-roots: [{name, title, dir, match[], remit, docs[], plans[]}]
// The provider catalog is not cached here: form-steps.js reads it for the one picker and
// the Campaign's Model providers surface, fresh on every surface entry.

const projectListeners = new Set();
/** Hear the catalog change: the Workspace folders surface reloads it after every keep or exclude. */
export function onProjects(listener) { projectListeners.add(listener); return () => projectListeners.delete(listener); }

export async function loadProjects() {
  const r = await request('/api/project-roots');
  if (r.ok && Array.isArray(r.data)) projectData = r.data;
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
