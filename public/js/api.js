/* part of the tmux-ronin client — see js/README.md */
import { S, tiles } from './state.js';

export async function fetchSessions() {
  try {
    const r = await fetch('/api/sessions', { cache: 'no-store' });
    S.sessions = await r.json();
    if (!Array.isArray(S.sessions)) S.sessions = [];
  } catch (_) {
    S.sessions = [];
  }
  tiles.forEach((t) => t.refreshOptions());
  return S.sessions;
}

export async function createSession(name) {
  const r = await fetch('/api/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data.name;
}

/** Kill a tmux session on the host (and its grid_* viewers). */
export async function deleteSession(name) {
  const r = await fetch('/api/sessions/' + encodeURIComponent(name), { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
}

/* ---------- cockpit dial (the house motif for discrete multi-position controls) ---------- */
// A literal little rotary dial: tick marks for the detents, a pointer for the current
// one, tap = flip to the next position. Reusable — pass your own positions/onPick.
