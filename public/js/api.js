/* part of the ronin-cowork client — see js/README.md */
/**
 * The /api/sessions calls — the session set's own little API. Transport goes through
 * request() like everything else; what a failure means is decided here.
 */
import { request } from './request.js';
import { S, tiles } from './state.js';

/**
 * THE ONE WRITER of `S.sessions`. The session list arrives one way — pushed on /events and
 * reduced by the store (js/events.js) — and lands here. It writes the fact and fans the
 * pickers; what an arrival MEANS (births, deaths, chips) stays with the caller that knows.
 * The full update-path map is docs/architecture/ui.md §Update paths.
 */
export function reconcileSessions(list) {
  S.sessions = list;
  tiles.forEach((t) => t.refreshSessionName());
}

export async function setSessionTitle(name, title) {
  const r = await request('/api/sessions/' + encodeURIComponent(name) + '/title', {
    method: 'PUT', json: { title },
  });
  if (!r.ok) throw new Error(r.message);
  return r.data.title;
}

/** Start the observable safe Agent+desk shutdown transaction. */
export async function startSessionShutdown(name, body) {
  const r = await request('/api/sessions/' + encodeURIComponent(name) + '/shutdown', { method: 'POST', ...(body ? { json: body } : {}) });
  if (!r.ok) throw new Error(r.message);
  return r.data;
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
