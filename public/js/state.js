/* tmux-ronin — browser grid of live tmux sessions. No framework, just xterm.js. */
'use strict';

export const grid = document.getElementById('grid');
export const NEW = '__new__';
export const TILE_COUNT = 4;
export const LS_SESSIONS = 'tmuxgrid.sessions';
export const LS_LAYOUT = 'tmuxgrid.layout';

// Touch device (iPhone/iPad): a tap must NOT auto-focus the terminal (which pops
// the keyboard); scrolling is driven by drag + buttons that inject wheel events.
export const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/**
 * WHICH KEY FORCES A SELECTION IN A LOCKED TILE — and it is not the same key everywhere.
 *
 * A locked tile is a live TUI with tmux `mouse on` (src/tmux.ts), so a plain drag becomes
 * mouse escapes: tmux enters copy-mode and copies to the PASTE BUFFER ON THE HOST. Nothing
 * reaches the laptop's clipboard, and it looks like it worked, which is the trap.
 *
 * xterm decides whether to select locally instead, and its rule (5.5.0,
 * `SelectionService.shouldForceSelection`) is:
 *
 *     isMac ? altKey && macOptionClickForcesSelection : shiftKey
 *
 * So Mac is Option and EVERYTHING ELSE IS SHIFT. Ronin said "Option" everywhere and never
 * said "Shift" once, which left a Windows or Linux laptop with no path at all.
 *
 * The platform test is xterm's own list against `navigator.platform`, deliberately copied
 * rather than improved: if this ever disagrees with xterm we name the wrong key, which is
 * worse than the silence it replaces. `navigator.platform` is deprecated and is still what
 * xterm reads — the day it changes, this changes with it.
 */
export const IS_MAC = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'].includes(navigator.platform);
/** The modifier's name, for anything that has to SAY it. */
export const SELECT_MOD = IS_MAC ? '⌥ Option' : '⇧ Shift';
/** Did this mouse event carry it? Mirrors xterm's rule above. */
export const forcesSelection = (e) => (IS_MAC ? e.altKey : e.shiftKey);
// SGR mouse-wheel sequences. With tmux `mouse on`, injecting these scrolls the
// scrollback (verified: enters copy-mode, scroll_position advances).
export const WHEEL_UP = '\x1b[<64;1;1M';
export const WHEEL_DOWN = '\x1b[<65;1;1M';

/**
 * SHARED MUTABLE STATE — one object, on purpose.
 *
 * These were ten top-level `let`s that any part of the file could reassign. Split
 * across modules that becomes invisible coupling: an ES module's imported binding is
 * read-only for the importer, so `compose = x` in another file is a hard error, and
 * the tempting workarounds (re-exporting setters, circular imports) are worse than
 * the disease. Holding them on ONE object keeps every writer honest and greppable —
 * writing `S.active = t` says exactly what it does, from anywhere.
 *
 * `tiles` stays a plain const array: it is mutated in place, never reassigned.
 */
export const S = {
  sessions: [], // [{name, windows, attached, created}]
  active: null,
  dictation: null, // the ONE mic currently listening { listening, stop } — see voice.js
  notePanel: null, // shared per-session note editor { open(session), close } — all devices
  padPanel: null, // Work Louder pad panel { open, close, isOpen, hit } — all devices (owner override)
  padAsk: null, // ask-on-press prompt for pad macros { open(bind), isOpen }
  locked: !IS_TOUCH, // DEFAULT for a NEW tile only — the switch itself is per-tile now
  // THE SWITCH, service half: true when the operator reports no 🔓 stream handler
  // (cowork alone — no record service). Every tile is then born 🔒, stays 🔒, and the
  // lock button is inert and opaque: the surface says "not plugged in", not "broken".
  // Set once at boot from /api/version (main.js); false is the full install's answer.
  streamOff: false,
  // Registered service names from the same answer (michi | koshi | rireki | counting |
  // koe), or null when the operator predates the field. A surface owned by a service
  // not on the roster is drawn opaque-and-inert and never fetched (sockets.ts's rule).
  services: null,
  lastSelection: '', // last non-empty terminal selection (see below)
  tagPanel: null, // session-groups editor { open(session), close } — all devices
  sessPicker: null, // pad-key session switcher { open, close, isOpen, move, commit }
};

// Which service owns which optional commons pane. A pane not listed is core and always
// on. Both the tab strip and the Commons menus consult this, same as the lock button
// consults streamOff: absent service = the surface is visible but opaque-and-inert.
const PANE_SERVICE = { hotwords: 'koe', stats: 'counting', koshi: 'koshi' };
/**
 * Is a SERVICE absent from this install? The one way to ask.
 *
 * `null` services means the operator predates the roster field, and that reads as
 * PRESENT — an old operator must not have its surfaces greyed out by a question it
 * cannot answer.
 *
 * This is the primitive; `serviceOff` below is the pane-shaped question asked in terms
 * of it. They were separate, and the difference bit: `serviceOff` takes a PANE name, so
 * `serviceOff('michi')` looked exactly like a service check, found no pane by that name,
 * and quietly answered "present" — leaving a michi-only button lit on a build with no
 * michi. A third spelling of the same test lived inline in tile.js. One question, one
 * function, and the pane map is now only a lookup table.
 */
export const serviceMissing = (svc) => !!svc && Array.isArray(S.services) && !S.services.includes(svc);

/** Is the service that owns this commons PANE absent? A pane not listed is core. */
export const serviceOff = (pane) => serviceMissing(PANE_SERVICE[pane]);
export const tiles = [];
// The 🔒/🔓 switch (changed ONLY by the button):
// LOCKED  = the original lock-step mirror, wired to NOTHING new. Scroll and every
//           keystroke round-trip to the tmux terminal on the host exactly as always.
// UNLOCKED = DVR. The server terminal is left alone at the bottom printing output;
//           the browser records the stream and scrolling scrubs that recording
//           locally. Typed text parks locally until Enter sends the whole parcel;
//           command keys (^C, Esc, arrows, Tab…) still go straight through.
// Desktop stays on the attach mirror by default — it works, and it is not being
// moved until dogfooding says so. Touch is FIXED unlocked: locked is a shit show on a
// phone (every scroll gesture round-trips through tmux copy-mode), so the phone always
// reads the tape and the lock button is hidden there entirely.
//
// LOCK IS A PROPERTY OF A TILE, and `S.locked` is only the default a new one is born
// with. It used to be one global that every tile read, so flipping it reconnected all
// four at once — a surprise and a reconnect storm, when you only ever mean the pane you
// are looking at. Each Tile owns `this.locked`; the header button acts on the active
// tile and mirrors its state, and each tile head carries the same switch.
// lastSelection: kept so a live-TUI redraw that clears the on-screen highlight
// can't lose the text before ⌘C reads it.

// THE TERMINAL PALETTE LIVED HERE as a THEME literal — the same sixteen colours the
// stylesheet also spelled, in a second language, and the two drifted (TOKENS' D2).
// It is now `--term-*` tokens in style.css, read back by js/theme.js `termTheme()`:
// one spelling, and xterm derives from it.

/* ---------- failure containment ----------
 * On 2026-08-08 one bad line in Tile's constructor took the ENTIRE UI down: the
 * throw killed build(), build() killed init(), and init() never wired a handler.
 * The static header still rendered, so the page looked fine and did nothing —
 * the worst possible failure, and the reason it took hours to locate.
 *
 * Two rules from that day, and they are the point of this block:
 *   1. Every failure is VISIBLE. A silent blank page is never acceptable.
 *   2. No single tile or step can take the whole page down.
 */
export function saveState() {
  localStorage.setItem(LS_SESSIONS, JSON.stringify(tiles.map((t) => t.session || '')));
  localStorage.setItem(LS_LAYOUT, String(grid.dataset.layout || TILE_COUNT));
}
export function loadState() {
  let map = [];
  try {
    map = JSON.parse(localStorage.getItem(LS_SESSIONS) || '[]');
  } catch (_) {
    map = [];
  }
  const layout = Number(localStorage.getItem(LS_LAYOUT)) || TILE_COUNT;
  return { map, layout };
}

/* ---------- server calls ---------- */
/* ---------- layout ---------- */
