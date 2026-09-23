/* part of the ronin-cowork client — see js/README.md */
/**
 * HOME DATA — the client's one cache of what the server knows about sessions and
 * catalogs, and the one place that refreshes it.
 *
 * This module was always the de-facto repository (`homeData`, `projectData`, an
 * inflight guard); it is now the declared one. Every reader —
 * the roster, the launcher, and the tile pickers — renders from these
 * caches, and every refresh path (boot, visibility, bfcache, the 8s poll, a
 * mutation's follow-up) lands here rather than fetching its own copy.
 *
 * A failed refresh keeps the LAST GOOD data and records the fault (`homeFault`)
 * instead of swallowing it: stale-and-labelled beats empty-and-silent, and the
 * roster draws the label (js/roster.js). The catalogs (projects, presets,
 * saved launches) stay best-effort — they change when the owner changes them, and
 * the next successful load heals them without a banner.
 */
import { request } from './request.js';
import { fetchSessions } from './api.js';
import { tiles } from './state.js';
import { t } from './lexicon.js';

export let homeData = null; // session list enriched with status + ctx
export let homeInflight = false;
/** Why the roster might be stale: the last /api/home failure's message, or null. */
export let homeFault = null;

export async function refreshHome() {
  if (homeInflight) return;
  homeInflight = true;
  const r = await request('/api/home', { cache: 'no-store' });
  if (r.ok && Array.isArray(r.data)) {
    homeData = r.data;
    homeFault = null;
  } else if (!r.ok) {
    homeFault = r.message; // keep the last good list; say why it may be stale
  }
  homeInflight = false;
  tiles.forEach((tile) => tile.renderHome?.());
}

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

/** /api/saved-launches — the launcher form, filled in ahead of time and named.
 *  USER SCOPE ONLY: nothing ships, so an empty list is the ordinary state. */
export let savedLaunchData = null;

export async function loadSavedLaunches() {
  const r = await request('/api/saved-launches');
  if (r.ok && Array.isArray(r.data)) savedLaunchData = r.data;
  tiles.forEach((tile) => tile.renderHome?.());
}

/** The status word for a row — a function, not a table, because the lexicon is loaded
 *  after this module is evaluated and a table would freeze the stock words. */
/**
 * What an Agent is doing now, in the owner's words. The backend decides which of these it
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
