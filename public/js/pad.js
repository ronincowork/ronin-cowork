/* part of the ronin-cowork client — see js/README.md */
import { IS_TOUCH, S, WHEEL_DOWN, WHEEL_UP, tiles } from './state.js';
import { request } from './request.js';
import { toast } from './ui.js';
import { t } from './lexicon.js';

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
// A function, not a table: the lexicon loads after this module is evaluated.
export function PAD_WIDGETS() {
  return {
    enc: ['◉', t('pad.w_encoder', 'encoder — volume and play/pause; it speaks media-key only, so it cannot drive Ronin')],
    joy: ['✛', t('pad.w_joystick', 'joystick — flick to move between tiles')],
    touch: ['▭', t('pad.w_touch', 'touch strip — cycles the pad layers (not bindable here)')],
    kesc: ['⎋ ESC', t('pad.w_esc', 'Escape — a real universal Esc key, works in any app')],
    ktab: ['⇥ TAB', t('pad.w_tab', 'Tab — a real universal Tab key, works in any app')],
    ent: ['↵ ENTER', t('pad.w_enter', 'Enter — a real universal Enter key, works in any app')],
    adel: ['⌥⌫ DEL', t('pad.w_delete_word', 'Option+Delete (delete word) — universal, works in any app')],
    aent: ['⌥↵ NEWLINE', t('pad.w_newline', 'Option+Enter (newline without send) — universal, works in any app')],
    wispr: ['🎙', t('pad.w_wispr', 'Wispr push-to-talk (right ⌥) — Wispr handles it, Ronin stays out of the way')],
  };
}

// ⌨ key bindings: a pad key can also press a terminal key in the ACTIVE tile —
// the keys that drive claude (Esc, Tab, ⇧Tab, Enter, arrows, ^C), same sequences
// as the top-bar and touch-keypad buttons. 'nexttile' is the odd one out: it
// cycles which tile is active instead of sending anything.
// The table is a function so the labels read the lexicon at the time a person sees them
// (the module is evaluated before the lexicon loads); the sequences never change.
export function PAD_KEYS() {
  return {
  enter: { label: t('pad.key_enter', '↵ Enter'), seq: '\r' },
  aenter: { label: t('pad.key_newline', '⌥↵ Newline'), seq: '\x1b\r' }, // line break WITHOUT sending (claude)
  adel: { label: t('pad.key_delete_word', '⌥⌫ Delete word'), seq: '\x1b\x7f' }, // backward-kill-word
  esc: { label: t('pad.key_esc', '⎋ Esc'), seq: '\x1b' },
  tab: { label: t('pad.key_tab', '⇥ Tab'), seq: '\t' },
  stab: { label: t('pad.key_shift_tab', '⇧⇥ Shift-Tab'), seq: '\x1b[Z' },
  up: { label: t('pad.key_up', '↑ Up'), seq: '\x1b[A' },
  down: { label: t('pad.key_down', '↓ Down'), seq: '\x1b[B' },
  left: { label: t('pad.key_left', '← Left'), seq: '\x1b[D' },
  right: { label: t('pad.key_right', '→ Right'), seq: '\x1b[C' },
  int: { label: t('pad.key_interrupt', '^C Interrupt'), seq: '\x03' },
  nexttile: { label: t('pad.key_next_tile', '⇄ Next tile') },
  // Press once = the switcher opens over the active tile; arrows (or the same key's
  // scroll neighbours) walk the list; press it AGAIN and that session lands in the
  // tile and the list closes. One key, no mouse — see buildSessionPicker.
  sesspick: { label: t('pad.key_session_switcher', '⌸ Session switcher') },
  // Opens the Commons over whatever tile is active, on its ⌂ Roster landing — the
  // same destination the ⛩ Commons button reaches. The panel overlays a connected
  // tile, so this works whether or not the tile is showing a session.
  commons: { label: t('pad.key_commons', '⌂ Commons') },
  tile1: { label: t('pad.key_tile_1', '⊞ Tile 1 (top-left)'), tile: 0 },
  tile2: { label: t('pad.key_tile_2', '⊞ Tile 2 (top-right)'), tile: 1 },
  tile3: { label: t('pad.key_tile_3', '⊞ Tile 3 (bottom-left)'), tile: 2 },
  tile4: { label: t('pad.key_tile_4', '⊞ Tile 4 (bottom-right)'), tile: 3 },
  scrollup: { label: t('pad.key_scroll_up', '⤒ Scroll up'), scroll: -1 },
  scrolldown: { label: t('pad.key_scroll_down', '⤓ Scroll down'), scroll: 1 },
  layoutcycle: { label: t('pad.key_layout_cycle', '▚ Layout 1→2→4') },
  tileup: { label: t('pad.key_tile_up', '🕹 Tile up'), dir: [0, -1] },
  tiledown: { label: t('pad.key_tile_down', '🕹 Tile down'), dir: [0, 1] },
  tileleft: { label: t('pad.key_tile_left', '🕹 Tile left'), dir: [-1, 0] },
  tileright: { label: t('pad.key_tile_right', '🕹 Tile right'), dir: [1, 0] },
  };
}

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
    const k = PAD_KEYS()[bind.key];
    if (!k) return;
    if (k.scroll) {
      // Encoder detents: locked = inject wheel events ONLY when the app listens for
      // mouse (otherwise they land as typed input under viewer mouse off — see
      // termview.mouseTracking), else scroll xterm's local buffer; unlocked =
      // scrub the local DVR — same split as touch drag-scroll.
      if (!S.active) return;
      if (S.active.locked && S.active.term.mouseTracking()) for (let i = 0; i < 3; i++) S.active.sendRaw(k.scroll < 0 ? WHEEL_UP : WHEEL_DOWN);
      else if (S.active.locked) S.active.term.scrollLines(k.scroll < 0 ? -3 : 3);
      else if (S.active.tapeMode) {
        // A tape-fed tile hides xterm — its transcript lives in the tape div, so the
        // scroll keys page that instead of a canvas nobody can see.
        S.active.tape.scrollByPages(k.scroll * 0.8);
      } else S.active.term.scrollLines(k.scroll * 3);
      return;
    }
    if (k.dir) {
      const visible = tiles.filter((tile) => tile.el.style.display !== 'none');
      if (visible.length < 2) return;
      const at = Math.max(0, visible.indexOf(S.active));
      const step = k.dir[0] < 0 || k.dir[1] < 0 ? -1 : 1;
      const t = visible[(at + step + visible.length) % visible.length];
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
