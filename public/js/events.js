/* part of the ronin-cowork client — see js/README.md */
import { reconcileSessions } from './api.js';
import { refreshHome } from './home.js';
import { IS_TOUCH, S, TILE_COUNT, grid, tiles } from './state.js';
import { setLayout } from './viewport.js';

export function connectEvents() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/events`);
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch (_) {
      return;
    }
    if (m.t === 'sessions' && Array.isArray(m.list)) onSessionsEvent(m.list);
    if (m.t === 'team-page') for (const fn of teamPageHandlers) fn(m);
  };
  ws.onclose = () => setTimeout(connectEvents, 3000); // keep the feed alive
}

/** Who hears a team-page draft (`{t:'team-page', team, from, tab, tokens}`): the Team view registers on mount. */
export const teamPageHandlers = new Set();
/** Who hears the session list change, after `S.sessions` has been reconciled: the Team
 *  view, whose membership is read off that list live. */
export const sessionsHandlers = new Set();

export function onSessionsEvent(list) {
  const before = new Set(S.sessions.map((s) => s.name));
  const now = new Set(list.map((s) => s.name));
  reconcileSessions(list); // the one writer (api.js); pickers current everywhere
  // Death: the tile refreshes and returns to the home panel.
  tiles.forEach((t) => {
    if (t.session && !now.has(t.session)) t.detach();
  });
  // Birth: reveal it — unless a tile already shows it (we launched it ourselves).
  for (const s of list) {
    if (!before.has(s.name) && !tiles.some((t) => t.session === s.name)) showBirthChip(s.name);
  }
  refreshHome(); // fresh status/gauge for any home panels on screen
  for (const fn of sessionsHandlers) fn(list);
}

/* Chip: "a session appeared" — one tap to open, dismisses itself. */
export let chipEl = null;
export let chipTimer = null;
export function showBirthChip(name) {
  if (!chipEl) {
    chipEl = document.createElement('div');
    chipEl.id = 'chip';
    document.body.appendChild(chipEl);
  }
  chipEl.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = '＋ ' + name;
  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', () => {
    hideChip();
    openSessionSomewhere(name);
  });
  const x = document.createElement('button');
  x.className = 'chip-x';
  x.textContent = '✕';
  x.addEventListener('click', hideChip);
  chipEl.append(label, openBtn, x);
  chipEl.classList.add('show');
  clearTimeout(chipTimer);
  chipTimer = setTimeout(hideChip, 15000);
}
export function hideChip() {
  if (chipEl) chipEl.classList.remove('show');
}

/**
 * Put a session on screen: first empty visible tile; else (desktop) widen the layout
 * to reveal one — the origin tiles keep running; else the active tile (phone
 * single-tile — the picker is the way back).
 */
export function openSessionSomewhere(name) {
  let t = tiles.find((x) => x.el.style.display !== 'none' && !x.session);
  if (!t && !IS_TOUCH) {
    const n = Number(grid.dataset.layout) || TILE_COUNT;
    if (n < TILE_COUNT) {
      setLayout(n === 1 ? 2 : 4);
      t = tiles.find((x) => x.el.style.display !== 'none' && !x.session);
    }
  }
  t = t || S.active || tiles[0];
  t.connect(name);
  t.activate();
}

/* ---------- commons — the admin pane inside a tile (tab label: ⌂ Roster) ----------
 * commons (内 — inside, the house, ours): the counterpart of the dials' "outside
 * agents". It is the inside of a tile — the part that is yours, from which work is
 * dispatched to the outside agents the dials govern. The UI tab says "⌂ Roster" for
 * legibility; the concept is commons everywhere else. See docs/commons.md.
 *
 * The selectors below still say "home" (they predate the name) — new code should
 * say commons; renaming them is a single tidy-up pass, not a piecemeal one.
 */
// Shared data: one /api/home fetch feeds every visible panel; macros load once.
