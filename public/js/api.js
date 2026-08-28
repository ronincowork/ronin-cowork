/* part of the ronin-cowork client — see js/README.md */
/**
 * The /api/sessions calls — the session set's own little API. Transport goes through
 * request() like everything else; what a failure means is decided here.
 */
import { request } from './request.js';
import { S, tiles } from './state.js';

/**
 * THE ONE WRITER of `S.sessions`. Every path a session list arrives by — the boot
 * fetch, visibility/bfcache refreshes, the /events push — lands here, so "what just
 * changed the session set" is one grep instead of a hunt. It writes the fact and
 * fans the pickers; what an arrival MEANS (births, deaths, chips) stays with the
 * caller that knows. The full update-path map is docs/ui.md §Update paths.
 */
export function reconcileSessions(list) {
  S.sessions = list;
  tiles.forEach((t) => t.refreshOptions());
}

/**
 * Refresh the session set. A failed refresh KEEPS the last known list: emptying every
 * picker over a network blip made a wobbly connection read as "all my sessions died",
 * which is a lie the roster then repeated. Returns the request result so the one
 * caller that must report loudly (boot, in main.js) can tell "empty" from "unreached".
 */
export async function fetchSessions() {
  const r = await request('/api/sessions', { cache: 'no-store' });
  if (r.ok && Array.isArray(r.data)) reconcileSessions(r.data);
  else tiles.forEach((t) => t.refreshOptions());
  return r;
}

export async function renameSession(name, next) {
  const r = await request('/api/sessions/' + encodeURIComponent(name) + '/rename', {
    method: 'POST', json: { name: next },
  });
  if (!r.ok) throw new Error(r.message);
  return r.data.name;
}

/** Kill a tmux session on the host (and its grid_* viewers). */
export async function deleteSession(name) {
  const r = await request('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!r.ok) throw new Error(r.message);
}

/** Retire a live session without keeping its tmux process resident. */
export async function archiveSession(name) {
  const r = await request('/api/sessions/' + encodeURIComponent(name) + '/archive', { method: 'POST' });
  if (!r.ok) throw new Error(r.message);
  return r.data.archived;
}

export async function fetchArchivedSessions() {
  const r = await request('/api/archived-sessions', { cache: 'no-store' });
  if (!r.ok) throw new Error(r.message);
  return Array.isArray(r.data) ? r.data : [];
}

export async function rehydrateSession(id) {
  const r = await request('/api/archived-sessions/' + encodeURIComponent(id) + '/rehydrate', { method: 'POST' });
  if (!r.ok) throw new Error(r.message);
  return r.data.name;
}

export async function deleteArchivedSession(id) {
  const r = await request('/api/archived-sessions/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!r.ok) throw new Error(r.message);
}
