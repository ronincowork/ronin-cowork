/* part of the tmux-ronin client — see js/README.md */
/**
 * The /api/sessions calls — the session set's own little API. Transport goes through
 * request() like everything else; what a failure means is decided here.
 */
import { request } from './request.js';
import { S, tiles } from './state.js';

/**
 * Refresh the session set. A failed refresh KEEPS the last known list: emptying every
 * picker over a network blip made a wobbly connection read as "all my sessions died",
 * which is a lie the roster then repeated. Returns the request result so the one
 * caller that must report loudly (boot, in main.js) can tell "empty" from "unreached".
 */
export async function fetchSessions() {
  const r = await request('/api/sessions', { cache: 'no-store' });
  if (r.ok && Array.isArray(r.data)) S.sessions = r.data;
  tiles.forEach((t) => t.refreshOptions());
  return r;
}

export async function createSession(name) {
  const r = await request('/api/launch', { method: 'POST', json: { name } });
  if (!r.ok) throw new Error(r.message);
  return r.data.name;
}

/** Kill a tmux session on the host (and its grid_* viewers). */
export async function deleteSession(name) {
  const r = await request('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
  if (!r.ok) throw new Error(r.message);
}
