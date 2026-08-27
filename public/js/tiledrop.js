/* part of the ronin-cowork client — see js/README.md */
import { t } from './lexicon.js';

/**
 * TOUCH ONLY: ONE header row for the whole phone.
 *
 * It started as two rows and a drawer. The app bar (⛩ ronin + category toggles), the
 * tile header (nine 34px controls — メ ⛩ ⚡ 🔒 🏷 ⛽ 🤖 📝 🗑, which is 306px of a 402px
 * screen and left the session <select> FOURTEEN pixels), and a drawer that pushed the
 * pane down again whenever it opened. Three bands of chrome above the terminal.
 *
 * Now there is one row:
 *
 *     ⛩ ronin  │  [ session ▾ ]  │  メ  │  ニ
 *
 * メ is THIS SESSION — status, ladder, TEGAMI, macros, groups, note, control, detach,
 * kill. ニ is RONIN — keys, home, new, board, pad. Each drops down the right side as
 * icon + word. Nothing else is on screen; the rest is terminal.
 *
 * THE TWO GLYPHS. They were ⋯ and ☰, which Glen could not find: two grey marks in
 * furniture-coloured boxes, in a bar whose only other content is grey. Kana carry a
 * stroke weight that punctuation does not, and they take Kojin's house colours —
 * kaki (persimmon, agent action) for the session, aiiro (indigo, navigation) for
 * Ronin — so the pair reads as two DIFFERENT things at a glance rather than two
 * buttons. See karate/SYSTEM.md; the tokens are at the top of style.css.
 *
 * Everything inside a drop is the SAME node the bar used, RELOCATED not cloned, so
 * every handler already bound to it keeps working, the live widgets (gauge needle,
 * dial pointer, ladder chip) keep updating from their existing owners, and there is
 * no second copy to keep in sync.
 *
 * WHY THIS NEEDS ONE TILE: a tile header is per-tile and the app bar is per-page, so
 * hoisting one into the other is only honest when there is exactly one tile. That used
 * to be a standing fact on touch — there was no way to ask for a second terminal. Now
 * the bar's grid count cycles here too, so it is a CONDITION instead: `setLayout` calls
 * `collapseTileHead` at one tile and `expandTileHead` at two or four, and the merge
 * lasts exactly as long as it is true. A phone still opens on one terminal, which is
 * both the first-run default and the only usable count at 402px.
 *
 * Desktop never calls any of this: it has room, and per the cardinal rule it does
 * not change.
 */

/** The tile's controls, in drop order, with the word that goes beside each. */
// A function, not a table: the lexicon loads after this module is evaluated.
function items() {
  return [
  // FIRST, and the only row that is not a door. Context percent and which model is
  // answering — a READING, not a control, so it does not take a tap and does not
  // light up under one. This is the only place either appears: the strip above the
  // text entry is gone, because the bottom of a phone is the keyboard and the box
  // you type in, and there is no room down there.
  ['.gauge', t('me.status', 'Status')],
  ['.shingo-chip', t('me.ladder', 'Ladder')],
  ['.checkout.branch', t('me.branches', 'Branches')],
  // ['.torii', 'TEGAMI'] stood here until 2026-08-17, removed with the button itself.
  // The ⛩ on the tile head is the Commons now, and it is already reachable on touch as
  // the ニ sheet's own Commons row — a second door to it does not belong in this list.
  ['.tmac-btn', t('me.macros', 'Macros')],
  ['.tmention-btn', t('me.mention', 'Mention session')],
  ['.tags', t('me.groups', 'Groups')],
  // 📄 THIS session's listed docs (2026-08-18). It has to be named here or it is
  // STRANDED: the desktop builds it into メ's drop, touch builds it into the header row
  // instead, and a control the hoist does not name stays behind in a header the
  // stylesheet then hides. Its own drop follows its button up — see the hoist below.
  ['.tdocs-btn', t('me.docs', 'Docs')],
  ['.note', t('me.note', 'Note')],
  ['.dial', t('me.control', 'Control')],
  ['.kill', t('me.kill', 'Kill session')],
  ];
}

/** Rows that are not plain doors. See `addRow`. */
const MODE = { '.gauge': 'inert', '.dial': 'stay' };

/** Only run where the STYLESHEET agrees. IS_TOUCH is broader (it also accepts a bare
 *  `ontouchstart`), and on a device where the two disagree the relocated nodes would
 *  land in a container the CSS never unhides. When in doubt, leave the bar alone. */
export const isCoarse = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * A bar button and the sheet it drops. Shared by メ and ニ so the two behave
 * identically — open one and the other closes, tap outside or Escape to dismiss.
 */
export function makeDrop(glyph, title, kind) {
  const menu = document.createElement('div');
  menu.className = 'tdrop';
  // Declared before anything closes over it. An arrow that runs later would survive
  // the temporal dead zone, but a bar that assembles top-to-bottom is exactly the
  // habit the 2026-08-08 constructor bug earned.
  const close = () => menu.classList.remove('open');

  const btn = document.createElement('button');
  btn.className = 'tdrop-btn' + (kind ? ' ' + kind : '');
  btn.type = 'button';
  btn.textContent = glyph;
  btn.title = title;

  const rows = [];

  /** Put a control in the sheet under `label`. Returns the word element, because the
   *  status row's word is written to later.
   *
   *  `mode` is what the row DOES:
   *    'door'   tap it and the sheet closes behind you — nearly everything
   *    'stay'   tap it and the sheet stays — the dial cycles three detents
   *    'inert'  not a tap target at all — a reading, not a control */
  const addRow = (ctl, label, mode = 'door') => {
    const row = document.createElement('div');
    row.className = 'tdrop-row' + (mode === 'inert' ? ' inert' : '');
    const word = document.createElement('span');
    word.textContent = label;
    row.append(ctl, word); // append MOVES the node — listeners come along
    if (mode !== 'inert') {
      // The whole row is the tap target, not just the 34px control: the word is the
      // bigger half of it and reads as part of the button.
      word.addEventListener('click', () => ctl.click());
      // CAPTURE phase, deliberately. ⚡ stops propagation in its own handler (it opens
      // the .tmac menu against the same anchor), so a bubble-phase listener here would
      // never run and the drop would sit ON TOP of the menu it just opened.
      if (mode === 'door') row.addEventListener('click', () => close(), true);
    }
    menu.append(row);
    rows.push({ row, ctl });
    return word;
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    // 📄's doc list joined the sweep on 2026-08-18: it hangs off this same bar once the
    // header is hoisted, so it is a rival exactly as ⚡'s macro list is.
    document.querySelectorAll('.tdrop.open, .tmac.open, .tdocs.open').forEach((m) => m.classList.remove('open'));
    if (wasOpen) return;
    // A control that hides itself (no ladder up, no context reading) must not leave
    // its word stranded on a row with nothing to tap. CSS `:has()` does this too;
    // syncing here as well means it is right on an engine that lacks it.
    rows.forEach(({ row, ctl }) => {
      row.style.display = ctl.hidden ? 'none' : '';
    });
    menu.classList.add('open');
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { btn, menu, addRow, close };
}

/**
 * Hoist the tile's header into the app bar, behind メ. Called for the ONE tile a phone
 * shows; the tile's own header row is then empty and the stylesheet hides it.
 */
export function collapseTileHead(tile) {
  if (!isCoarse()) return;
  const head = tile.el.querySelector('.tile-head');
  const bar = document.getElementById('bar');
  if (!head || !bar) return;

  // ⟳ Reconnect goes, and does not come back. It is `connect(this.session)` — the
  // same thing re-picking the session in the <select> already does — and the round
  // arrow read as the top bar's ⟳ Refresh, which is a different action entirely.
  head.querySelector('.rc')?.remove();

  if (tile.headKids) return; // already up there
  // Everything that is about to leave, in the order it sits in now. `expandTileHead`
  // puts the list back with one `append`, so the head is restored exactly — no second
  // list of what goes where, which is the copy that would rot. Snapshotted AFTER ⟳ is
  // removed, because ⟳ does not come back.
  tile.headKids = [...head.children];

  const drop = makeDrop('メ', t('me.title', 'This session — status, ladder, TEGAMI, macros, groups, docs, note, control'), 'me');
  tile.headDrop = drop;
  for (const [sel, label] of items()) {
    const ctl = head.querySelector(sel);
    if (!ctl) continue;
    const word = drop.addRow(ctl, label, MODE[sel]);
    // The status row's word is live text, not a label: setFooter writes the reading
    // into it. Handed to the tile so there is one writer, as with every other widget.
    if (sel === '.gauge') {
      word.className = 'tdrop-status';
      tile.dropStatus = word;
    }
  }

  // The connection lamp and the picker come up to the bar as they are — they ARE the
  // header, and the header is now the bar's middle. `.grow` stays behind: it existed
  // to push a row of buttons to the far edge, and the picker wants that room.
  const dot = head.querySelector('.dot');
  const sel = head.querySelector('select.sess');
  // BEFORE the grid count, which is the row's right-hand end along with ニ. On first
  // build the count is the last thing in the bar and appending would land after it;
  // when the head comes back UP (the count went 2 → 1) the count is already sitting
  // between メ and ニ. Inserting against it reads left-to-right either way round —
  // appending was right exactly once, on the first pass.
  const anchor = bar.querySelector('#layoutcycle');
  // ⚡'s menu is anchored to whatever it sits in; it follows its button up here. So does
  // 📄's (2026-08-18) — a menu left in the hidden header is a button that opens nothing.
  const tmac = head.querySelector('.tmac');
  const tdocs = head.querySelector('.tdocs');
  for (const n of [dot, sel, drop.btn, drop.menu, tmac, tdocs]) {
    if (n) anchor ? bar.insertBefore(n, anchor) : bar.append(n);
  }
  // The emptied head STAYS in the tile, hidden by the stylesheet. It is still the
  // anchor the ladder inserts itself after (`toggleLadder`), and removing it would
  // make that a null dereference — the cheapest possible way to blank a tile.
  head.classList.add('hoisted');

  // The reading may already have arrived before the drop existed — repaint it into
  // the row we just built rather than waiting 30s for the next poll.
  tile.setFooter(tile.ctxPct ?? null, tile.ctxModel ?? null);
}

/**
 * TOUCH: give the tile its head back — the merge undone, because it stopped being true.
 *
 * The merge rests on ONE claim: a tile header is per-tile and the app bar is per-page, so
 * hoisting one into the other is only honest when there is exactly one tile. It used to be
 * a standing fact — the phone was pinned to a single terminal and had no way to ask for
 * more. Now the bar's grid count cycles on touch as well, and an iPad has room for four:
 * ask for two and tile 1 was left with no header at all, its picker stranded in the app
 * bar controlling a tile you could no longer tell apart, while tile 2 wore its own. A tile
 * inside a tile, as the owner put it.
 *
 * So the merge follows the count instead of the device. One tile: hoisted. Two or four:
 * every tile keeps its own header and the bar goes back to being about the page.
 *
 * The head is restored from the snapshot `collapseTileHead` took, in one `append` — nodes
 * MOVE, so this reverses the hoist exactly and every live widget (needle, pointer, chip)
 * keeps the owner it always had. Idempotent: no snapshot means nothing was hoisted.
 */
export function expandTileHead(tile) {
  const kids = tile?.headKids;
  if (!kids) return;
  const head = tile.el.querySelector('.tile-head');
  if (!head) return;

  head.append(...kids); // append MOVES each node back, in the order it was taken
  // メ is the bar's half of the merge and has no meaning beside a header that is back in
  // its tile. Dropped rather than hidden, so the next collapse builds a fresh one against
  // whatever the header holds by then.
  tile.headDrop?.btn.remove();
  tile.headDrop?.menu.remove();
  head.classList.remove('hoisted');
  tile.headDrop = null;
  tile.headKids = null;
  tile.dropStatus = null; // the status row went with the sheet; setFooter checks for it
}
