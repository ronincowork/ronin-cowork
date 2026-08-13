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
  lastSelection: '', // last non-empty terminal selection (see below)
  tagPanel: null, // session-groups editor { open(session), close } — all devices
  sessPicker: null, // pad-key session switcher { open, close, isOpen, move, commit }
};
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

export const THEME = {
  background: '#0b0e14',
  foreground: '#c5c8c6',
  cursor: '#e0af68',
  cursorAccent: '#0b0e14',
  selectionBackground: '#2a3145',
  black: '#1d1f21',
  red: '#cc6666',
  green: '#b5bd68',
  yellow: '#f0c674',
  blue: '#81a2be',
  magenta: '#b294bb',
  cyan: '#8abeb7',
  white: '#c5c8c6',
  brightBlack: '#6b7488',
  brightRed: '#d54e53',
  brightGreen: '#b9ca4a',
  brightYellow: '#e7c547',
  brightBlue: '#7aa6da',
  brightMagenta: '#c397d8',
  brightCyan: '#70c0b1',
  brightWhite: '#eaeaea',
};

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
