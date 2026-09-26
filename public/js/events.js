/* part of the ronin-cowork client — see js/README.md */
import { reconcileSessions } from './api.js';
import { store } from './store.js';
import { S, tiles } from './state.js';
import { t } from './lexicon.js';

/**
 * WHAT THE /events MESSAGES MEAN TO THE PAGE.
 *
 * The socket and the resources are the store's (js/store.js). This module turns a changed
 * session list into birth chips and tiles returning home, and hands the feeds that are not
 * resources — transcripts, Team page drafts, Mika, Setup progress — to their surfaces.
 *
 * WHAT THIS TAB IS SHOWING, said once and re-said whenever it changes. The server sends an
 * Agent's records only to connections that asked for them, so a phone watching one Agent is
 * never woken by another. One registration per connection: a tile shows one Agent in one
 * reading, so a new watch replaces the old and there is nothing to unsubscribe.
 */
let watching = null; // {session, reading} — kept so a reconnect can say it again

export function watchTranscript(session, reading) {
  watching = session ? { session, reading: reading || '' } : null;
  sendWatch();
}

function sendWatch() {
  store.send({ t: 'watch', session: watching?.session || '', reading: watching?.reading || '' });
}

/** Who hears an Agent's records arriving, and the reconnect that means a gap to fill. */
export const transcriptHandlers = new Set();
/** Who hears a team-page draft (`{t:'team-page', team, from, tab, tokens}`): the Team view registers on mount. */
export const teamPageHandlers = new Set();
/** Who hears the session list change, after `S.sessions` has been reconciled: the Team
 *  view, whose membership is read off that list live. */
export const sessionsHandlers = new Set();
/** Who hears Mika's `show` (`{t:'mika-show', tab, workspace, surface}`): the Help panel of the tab it names. */
export const mikaShowHandlers = new Set();
/** Who hears the server-owned five-step Setup record after a scan or answer lands. */
export const setupProgressHandlers = new Set();

// A reconnect is a new connection with no memory, so it is told again at once. The tab
// then asks for what it missed while the socket was down.
store.onOpen(() => { sendWatch(); for (const fn of transcriptHandlers) fn({ t: 'reconnected' }); });
store.listen('transcript', (m) => { for (const fn of transcriptHandlers) fn(m); });
store.listen('team-page', (m) => { for (const fn of teamPageHandlers) fn(m); });
store.listen('mika-show', (m) => { for (const fn of mikaShowHandlers) fn(m); });
store.listen('setup-progress', (m) => { if (Array.isArray(m.steps)) for (const fn of setupProgressHandlers) fn(m); });
store.reduce('sessions', (list) => onSessionsEvent(list));

/** A changed session list: reconcile it, return dead tiles home, and offer the newborn. */
function onSessionsEvent(list) {
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
  for (const fn of sessionsHandlers) fn(list);
}

/* Chip: "a session appeared" — one tap to open, dismisses itself. */
let chipEl = null;
let chipTimer = null;
const BIRTH_CHIP_HOLD_MS = 7500;
function showBirthChip(name) {
  if (!chipEl) {
    chipEl = document.createElement('div');
    chipEl.id = 'chip';
    document.body.appendChild(chipEl);
  }
  chipEl.innerHTML = '';
  const label = document.createElement('span');
  label.textContent = '＋ ' + name;
  const openBtn = document.createElement('button');
  openBtn.textContent = t('events.open', 'Open');
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
  chipTimer = setTimeout(hideChip, BIRTH_CHIP_HOLD_MS);
}
function hideChip() {
  if (chipEl) chipEl.classList.remove('show');
}

/**
 * Put a session on screen: first empty visible tile; else (desktop) widen the layout
 * to reveal one — the origin tiles keep running; else the active tile (phone
 * single-tile — the picker is the way back).
 */
export function openSessionSomewhere(name) {
  if (S.connectSession?.(name)) return true;
  const tile = S.active || tiles.find((candidate) => candidate.el.style.display !== 'none') || tiles[0];
  if (!tile || tile.connect(name) === false) return false;
  tile.activate();
  return true;
}
