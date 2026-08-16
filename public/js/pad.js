/* part of the tmux-ronin client — see js/README.md */
import { IS_TOUCH, S, WHEEL_DOWN, WHEEL_UP, grid, tiles } from './state.js';
import { request } from './request.js';
import { toast } from './ui.js';
import { curLayout, nextLayout, setLayout } from './viewport.js';

export const LS_PAD = 'tmuxgrid.worklouder';
export const PAD_CODE = /^F1[3-9]$|^F2[0-4]$/; // the ONLY codes the pad logic touches
// Creator Micro 2 geometry — key rows are 2/4/4/3 (confirmed by the device's own
// keymap.json format). Joystick top-right, touch strip bottom-left (verified);
// encoder drawn top-left. Encoder / joystick / touch keep their native jobs and
// are placeholders here. Bottom-right key = Wispr push-to-talk (the Fn key Glen
// uses all day): the pad emits it for Wispr, the browser never sees Fn, so it's
// drawn as a fixed 🎙 widget, not a bindable key. K1–K12 → F13–F24.
// SAFE CODES ON A MAC: F13 and F16–F24 only. NOT F14/F15 (display brightness) —
// and NOT Pause/ScrollLock, which carry the SAME HID codes as F15/F14 on Apple
// keyboards, so macOS treats them as brightness too (hardware-verified: the
// Pause key changed screen brightness). Both were tried; both are cursed.
// The bottom-right cluster is UNIVERSAL keys, written onto the device itself so
// they work in any app, not just Ronin: Enter above Wispr, ⌥⌫ and ⌥↵ beside it,
// Wispr push-to-talk (right ⌥) in the corner. Drawn as fixed widgets — the Mac
// handles them, Ronin stays out of the way. The other 7 keys are dumb macro
// codes that only mean something once bound below.
export const PAD_LAYOUT = [
  [{ w: 'enc' }, { k: 'F13' }, { k: 'F19' }, { w: 'joy' }],
  [{ k: 'F20' }, { k: 'F16' }, { k: 'F17' }, { k: 'F18' }],
  [{ w: 'kesc' }, { w: 'ktab' }, { w: 'adel' }, { w: 'ent' }],
  [{ w: 'touch' }, { k: 'F21' }, { w: 'aent' }, { w: 'wispr' }],
];
export const PAD_WIDGETS = {
  enc: ['◉', 'encoder — volume and play/pause; it speaks media-key only, so it cannot drive Ronin'],
  joy: ['✛', 'joystick — flick to move between tiles'],
  touch: ['▭', 'touch strip — cycles the pad layers (not bindable here)'],
  kesc: ['⎋ ESC', 'Escape — a real universal Esc key, works in any app'],
  ktab: ['⇥ TAB', 'Tab — a real universal Tab key, works in any app'],
  ent: ['↵ ENTER', 'Enter — a real universal Enter key, works in any app'],
  adel: ['⌥⌫ DEL', 'Option+Delete (delete word) — universal, works in any app'],
  aent: ['⌥↵ NEWLINE', 'Option+Enter (newline without send) — universal, works in any app'],
  wispr: ['🎙', 'Wispr push-to-talk (right ⌥) — Wispr handles it, Ronin stays out of the way'],
};

// ⌨ key bindings: a pad key can also press a terminal key in the ACTIVE tile —
// the keys that drive claude (Esc, Tab, ⇧Tab, Enter, arrows, ^C), same sequences
// as the top-bar and touch-keypad buttons. 'nexttile' is the odd one out: it
// cycles which tile is active instead of sending anything.
export const PAD_KEYS = {
  enter: { label: '↵ Enter', seq: '\r' },
  aenter: { label: '⌥↵ Newline', seq: '\x1b\r' }, // line break WITHOUT sending (claude)
  adel: { label: '⌥⌫ Delete word', seq: '\x1b\x7f' }, // backward-kill-word
  esc: { label: '⎋ Esc', seq: '\x1b' },
  tab: { label: '⇥ Tab', seq: '\t' },
  stab: { label: '⇧⇥ Shift-Tab', seq: '\x1b[Z' },
  up: { label: '↑ Up', seq: '\x1b[A' },
  down: { label: '↓ Down', seq: '\x1b[B' },
  left: { label: '← Left', seq: '\x1b[D' },
  right: { label: '→ Right', seq: '\x1b[C' },
  int: { label: '^C Interrupt', seq: '\x03' },
  nexttile: { label: '⇄ Next tile' },
  // Press once = the switcher opens over the active tile; arrows (or the same key's
  // scroll neighbours) walk the list; press it AGAIN and that session lands in the
  // tile and the list closes. One key, no mouse — see buildSessionPicker.
  sesspick: { label: '⌸ Session switcher' },
  // Opens the Commons over whatever tile is active, on its ⌂ Roster landing — the
  // same destination the き Commons button reaches. The panel overlays a connected
  // tile, so this works whether or not the tile is showing a session.
  commons: { label: '⌂ Commons' },
  tile1: { label: '⊞ Tile 1 (top-left)', tile: 0 },
  tile2: { label: '⊞ Tile 2 (top-right)', tile: 1 },
  tile3: { label: '⊞ Tile 3 (bottom-left)', tile: 2 },
  tile4: { label: '⊞ Tile 4 (bottom-right)', tile: 3 },
  scrollup: { label: '⤒ Scroll up', scroll: -1 },
  scrolldown: { label: '⤓ Scroll down', scroll: 1 },
  layoutcycle: { label: '▚ Layout 1→2→4' },
  tileup: { label: '🕹 Tile up', dir: [0, -1] },
  tiledown: { label: '🕹 Tile down', dir: [0, 1] },
  tileleft: { label: '🕹 Tile left', dir: [-1, 0] },
  tileright: { label: '🕹 Tile right', dir: [1, 0] },
};

// { chord: {macro, args, session, ask} | {key} } — session '' = active tile;
// ask = pop a prompt for the args on every press (e.g. buildout)
export let padBinds = {};
try {
  padBinds = JSON.parse(localStorage.getItem(LS_PAD) || '{}') || {};
} catch (_) {
  padBinds = {};
}
// Glen's standing defaults, seeded wherever unbound (rebindable, at the price
// that a cleared key returns to its default next load): the key above Wispr
// (F22) is Enter, the key left of Wispr (F24) is ⌥↵ newline-without-send.
// Enter/⌥↵/⌥⌫ moved onto the pad itself as universal device keys — retire their
// old seeded browser bindings wherever they're still the untouched defaults.
for (const [c, k] of [['F22', 'enter'], ['F24', 'aenter'], ['F21', 'adel']])
  if (padBinds[c] && padBinds[c].key === k) delete padBinds[c];
// Cockpit control codes moved when Pause/ScrollLock turned out to be brightness
// keys — clear OUR old control seeds wherever they still sit on a retired code.
export const PAD_CONTROL_JOBS = new Set(['scrollup', 'scrolldown', 'layoutcycle', 'tileup', 'tiledown', 'tileleft', 'tileright']);
for (const c of ['F19', 'F20', 'F22', 'F23', 'F24', 'Insert', 'Pause', 'ScrollLock'])
  if (padBinds[c] && padBinds[c].key && PAD_CONTROL_JOBS.has(padBinds[c].key)) delete padBinds[c];
// Glen's cockpit defaults (seeded wherever unbound): encoder turns scroll, the
// second key of the top row cycles the layout, joystick flicks move between tiles.
// Scroll can't live on the knob (consumer-control, see WL_ENCODER), so it gets
// the two keys either side of the layout cycler in the top rows.
if (!padBinds.F17) padBinds.F17 = { key: 'scrollup' };
if (!padBinds.F18) padBinds.F18 = { key: 'scrolldown' };
if (!padBinds.F19) padBinds.F19 = { key: 'layoutcycle' };
// K4 (F16, second row) = the session switcher: press to open the list, arrows to
// walk it, press again to land it. Rebindable like any other key. It was seeded on
// F13 for a day — carry that seed across wherever it's still untouched.
if (padBinds.F13 && padBinds.F13.key === 'sesspick') delete padBinds.F13;
if (!padBinds.F16) padBinds.F16 = { key: 'sesspick' };
// K1 (F13, top row) = the Commons over the active tile. Owner's pick.
if (!padBinds.F13) padBinds.F13 = { key: 'commons' };
if (!padBinds['S-F13']) padBinds['S-F13'] = { key: 'tileup' };
if (!padBinds['S-F16']) padBinds['S-F16'] = { key: 'tileright' };
if (!padBinds['S-F17']) padBinds['S-F17'] = { key: 'tiledown' };
if (!padBinds['S-F18']) padBinds['S-F18'] = { key: 'tileleft' };
// K2/K3 moved off F14/F15 (macOS brightness) to Pause/ScrollLock — carry any
// bindings made under the old codes across.
if (padBinds.F14 && !padBinds.Pause) padBinds.Pause = padBinds.F14;
if (padBinds.F15 && !padBinds.ScrollLock) padBinds.ScrollLock = padBinds.F15;
delete padBinds.F14;
delete padBinds.F15;
export const savePadBinds = () => localStorage.setItem(LS_PAD, JSON.stringify(padBinds));

/** Modifier-qualified physical key, e.g. "S-F13" = Shift+F13. */
export function padChord(e) {
  return (e.ctrlKey ? 'C-' : '') + (e.altKey ? 'A-' : '') + (e.metaKey ? 'M-' : '') + (e.shiftKey ? 'S-' : '') + e.code;
}

// The outcome chip (macros must SHOW their result, not just perform) grew up into
// the house toast — js/ui.js — because tile-scoped errors needed the same surface.

/** Route a pad press: terminal key, next-tile, ask-for-args popup, or macro send. */
export function firePadBinding(bind) {
  // While the session switcher is up it OWNS the pad: its own key lands the
  // highlighted session, up/down (however they're spelled on this pad — arrows,
  // scroll keys, joystick) walk the list, Esc backs out. Nothing reaches a pane,
  // so a stray press can't type into a session while you're choosing one.
  if (S.sessPicker && S.sessPicker.isOpen()) {
    const k = bind.key;
    if (k === 'sesspick' || k === 'enter') S.sessPicker.commit();
    else if (k === 'up' || k === 'scrollup' || k === 'tileup') S.sessPicker.move(-1);
    else if (k === 'down' || k === 'scrolldown' || k === 'tiledown') S.sessPicker.move(1);
    else if (k === 'esc') S.sessPicker.close();
    return;
  }
  if (bind.key === 'sesspick') {
    if (S.sessPicker) S.sessPicker.open();
    return;
  }
  if (bind.key) {
    const k = PAD_KEYS[bind.key];
    if (!k) return;
    if (k.scroll) {
      // Encoder detents: locked = inject wheel events (the mirror), unlocked =
      // scrub the local DVR — same split as touch drag-scroll.
      if (!S.active) return;
      if (S.active.locked) for (let i = 0; i < 3; i++) S.active.sendRaw(k.scroll < 0 ? WHEEL_UP : WHEEL_DOWN);
      else if (S.active.tapeMode) {
        // A tape-fed tile hides xterm — its transcript lives in the tape div, so the
        // scroll keys page that instead of a canvas nobody can see.
        S.active.tape.scrollByPages(k.scroll * 0.8);
      } else S.active.term.scrollLines(k.scroll * 3);
      return;
    }
    if (bind.key === 'commons') {
      // Same tile resolution as the き Commons button: the active tile, else the
      // first one actually on screen — so the key still lands somewhere when
      // nothing has been clicked yet.
      const t = S.active || tiles.find((x) => x.el.style.display !== 'none') || tiles[0];
      if (!t) return;
      // The key TOGGLES: press again and you are back on the session you left.
      // A tile with no session has nothing behind the panel to go back to, so
      // there the second press just re-lands on Roster rather than blanking it.
      if (t.homeVisible() && t.session) t.hideHome();
      else t.showHome('sessions');
      return;
    }
    if (bind.key === 'layoutcycle') {
      setLayout(nextLayout(curLayout())); // same ring as the bar button — one statement of it
      return;
    }
    if (k.dir) {
      // Joystick: move the active tile directionally in the current layout.
      const n = Number(grid.dataset.layout) || 4;
      if (n === 1) return;
      const cur = Math.max(0, tiles.indexOf(S.active));
      let col = n === 4 ? cur % 2 : cur;
      let row = n === 4 ? cur >> 1 : 0;
      col = Math.max(0, Math.min(n === 4 ? 1 : 1, col + k.dir[0]));
      row = Math.max(0, Math.min(n === 4 ? 1 : 0, row + k.dir[1]));
      const t = tiles[n === 4 ? row * 2 + col : col];
      if (!t || t.el.style.display === 'none' || t === S.active) return;
      if (IS_TOUCH) t.activate();
      else t.focusTerminal();
      return;
    }
    if (bind.key === 'nexttile' || k.tile != null) {
      let t;
      if (k.tile != null) {
        t = tiles[k.tile];
        if (!t || t.el.style.display === 'none') return; // tile not in this layout
      } else {
        const vis = tiles.filter((x) => x.el.style.display !== 'none');
        if (!vis.length) return;
        t = vis[(vis.indexOf(S.active) + 1) % vis.length];
      }
      if (IS_TOUCH) t.activate();
      else t.focusTerminal();
      return;
    }
    if (!S.active) {
      toast(k.label + ' — no active tile', false);
      return;
    }
    S.active.sendRaw(k.seq); // deliberately no toast: these fire often and show in the pane
    return;
  }
  if (bind.ask) {
    if (S.padAsk) S.padAsk.open(bind);
    return;
  }
  firePadSend(bind.macro, bind.args, bind.session);
}

/** Fire a macro: same invocation + /send path as the home-panel macro rows. */
export async function firePadSend(macro, args, session) {
  const dest = session || (S.active && S.active.session) || '';
  const inv = '+' + (args ? `${macro}: ${args}` : macro);
  if (!dest) {
    toast(`${inv} — no target: bind a session, or open one in the active tile`, false);
    return;
  }
  const r = await request('/api/sessions/' + encodeURIComponent(dest) + '/send', {
    method: 'POST',
    json: { text: inv },
  });
  if (!r.ok) toast(`⚡ ${inv} → ${dest} ✗ ${r.message}`, false);
  else toast(`⚡ ${inv} → ${dest} ${r.data.started ? '✓' : "— pane didn't react, check it"}`, !!r.data.started);
}

// Codes emitted by the encoder and joystick rather than by a key. They ARE
// bindings like any other, but they have no square on the board — the panel
// shows them on the ◉ / ✛ widgets instead of the captured-chords row.
export const PAD_CONTROLS = { 'S-F13': 'joy', 'S-F16': 'joy', 'S-F17': 'joy', 'S-F18': 'joy' };
