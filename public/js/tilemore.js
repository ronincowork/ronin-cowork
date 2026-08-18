/* part of the tmux-ronin client — see js/README.md */

/**
 * メ ON THE TILE HEADER — the six controls that used to end the row, dropped in one
 * horizontal strip.
 *
 * WHY. The header ended in EIGHT controls (⛩ ⚡ 🔒 🏷 ⛽ 🎛 📝 🗑) squeezing a session
 * picker that has to fit a name, and at four tiles up there is not room for both. The
 * owner's ruling 2026-08-17: three stay on top — ⛩ Commons, ⚡ Macros, メ — and the rest
 * go behind メ. His words: *"consolidate the Lock, the Tags, the Gauge, the Dial, the
 * Save status, and the Trash Can into a single button… When you click it, you just see
 * those boxes exactly as they are, but maybe it just drops down horizontally."*
 *
 * So this drops the BUILT NODES, not a redesign of them. The dial is still the dial and
 * the gauge is still the gauge: `buildTileHead` appends the very elements its table made
 * into this menu instead of into the row, so every handler, every live setter and every
 * `needs` rule they already carried comes along, because it is the same element. There is
 * no second copy of a control to keep in sync — the same rule `tiledrop.js` works by.
 *
 * メ IS A RECLAIMED GLYPH, and this shape is not new. It was the tile-head Commons button
 * until 2026-08-17, when ⛩ took the Commons on every surface and freed it. On touch it
 * already means exactly this — `tiledrop.js` collapses the whole header into one bar row
 * where メ is THIS SESSION and drops Status · Ladder · Macros · Groups · Note · Control ·
 * Kill. Desktop is being brought into line with a design the phone has worn for months.
 * The only difference is the shape of the drop: a pointer does not need the word beside
 * the icon, and a desktop header has the width for a strip rather than a list.
 *
 * WHY NOT `ui.popover`. It was deleted on 2026-08-17 with its last consumer (the き
 * Commons menu) and could have been restored from git; it does not fit. It hides with the
 * `hidden` ATTRIBUTE, and the drops that already hang off a tile header close each other
 * with a CLASS sweep — ⚡ runs `querySelectorAll('.tmac.open')`, the phone's drops run
 * `.tdrop.open, .tmac.open`. ⚡ sits immediately to メ's left and both anchor to the same
 * corner of the same header, so a `hidden`-based drop is one no existing sweep can see,
 * and the two would open on top of each other. Restoring the primitive so that one of two
 * adjacent header dropdowns used it and the other did not would be a THIRD convention,
 * not a shared one. This follows ⚡'s, which is also the phone's: one feature, one
 * grammar, both surfaces.
 *
 * WHAT IT TAKES FROM THE RETIRED PRIMITIVE ANYWAY, because ⚡ never had it and
 * docs/ui.md still asks for it: `aria-haspopup` / `aria-expanded` on the opener, and
 * focus back on メ when the drop closes under the keyboard. That half of `popover()` was
 * about ACCESS and is not repealed by the half that was about `hidden`.
 *
 * THE FOCUS HALF WAS A DEAD LETTER UNTIL 2026-08-18, and worth recording because the line
 * above read as if it worked. `close()` only hands focus to メ when focus is INSIDE the
 * drop — and the two rows that raise a sheet used to shut the drop on the way out, so by
 * the time anything came back the focus was in a sheet and the opener was hidden in a
 * `display:none` strip that could not take it. Nobody saw it: the render gate was
 * crashing before it got this far. 🏷 and 📝 are `modal` rows now (tilehead.js) and leave
 * this drop UP behind their scrim, which is what finally gives that sentence something to
 * be true about — and see the Escape listener below for the order the two layers unwind.
 */

/**
 * Every メ on the page — four tiles build four of them, and the drops must close each
 * other. A raw `.tmore.open` class sweep would strip the CLASS off another tile's drop
 * and leave that tile's button still claiming `aria-expanded="true"`, which is the bug
 * a fixed id or a fixed selector always turns out to be in a four-tile grid. So the
 * closes go through the buttons that own them.
 *
 * Nothing is ever removed: tiles are built once at boot and live for the page
 * (docs/ui.md § Lifecycle), so there is no unmount at which a set would leak.
 */
const drops = new Set();

/** Shut every メ drop on the page. ⚡ and 📄 call this when their own menu opens. */
export const closeTileMore = () => drops.forEach((close) => close());

/**
 * BOUND A DROP TO THE ROOM UNDER THE HEADER — shared by every drop that hangs off one,
 * because the trap belongs to the header, not to any one menu.
 *
 * `.tile` is `overflow: hidden` and these menus hang off `.tile-head` inside it, so a drop
 * taller than the room below the header is not "overflowing" — it is CUT, with no
 * scrollbar and no sign that anything is missing. Measured 2026-08-17 on ⚡'s cards at four
 * tiles up: the fourth card lost its bottom half. Lived in `tilemacros.js` until
 * 2026-08-18, when 📄 became the second drop needing the same guarantee (`tiledocs.js`) and
 * a measurement spelled twice is a measurement that drifts.
 *
 * No CSS length can say it — `60vh` is the window, `100%` is the header's own 35px, and
 * `cqh` needs the size containment the tile deliberately does not have (`@container tile`
 * cannot be asked from here at all: that container is `.tile-body`, this menu's SIBLING).
 * So it is measured, at OPEN time rather than once — the grid count, the window and the
 * phone's keyboard all resize a tile under a menu that is not showing.
 *
 * `floor` because a tile can be shorter than one row, and a 12px-tall scroller with
 * nothing legible in it is worse than a menu that overhangs a very small tile.
 *
 * Silent when the anchor is not in a tile: on touch `tiledrop.js` HOISTS these menus into
 * the app bar, where there is no `.tile-head` above them and nothing to measure against.
 */
export function fitDropToTile(anchor, menu, floor = 140) {
  const head = anchor.closest('.tile-head');
  const box = anchor.closest('.tile');
  if (!head || !box) return;
  const room = box.getBoundingClientRect().bottom - head.getBoundingClientRect().bottom - 8;
  menu.style.maxHeight = `${Math.max(floor, Math.round(room))}px`;
}

/**
 * The メ button and the strip it drops. Returned in the {el, menu} shape every other
 * header widget uses, so `buildTileHead` needs no second convention for it.
 *
 * @returns {{el: HTMLElement, menu: HTMLElement, close: () => void}}
 */
export function buildTileMore() {
  const btn = document.createElement('button');
  btn.className = 'tmore-btn';
  btn.type = 'button';
  btn.textContent = 'メ';
  // No `title` here on purpose: the hover text is the `help` on メ's row in
  // `tilehead.js`, like every other control's, and the same sentence spelled in two
  // files is the drift the one-row rule exists to end.
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'tmore';

  // Declared before anything closes over it — the habit the 2026-08-08 constructor
  // outage earned, and the same order `tiledrop.js` assembles its drops in.
  const close = () => {
    if (!menu.classList.contains('open')) return;
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    // Only when focus is INSIDE the drop. A mouse user who clicked somewhere else is
    // not asking for the caret to jump backwards to a button they have left behind.
    if (menu.contains(document.activeElement)) btn.focus();
  };
  drops.add(close);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    // Every rival first. ⚡'s macro list and 📄's doc list anchor to the same corner of the
    // same header, so two open at once is two panels on one spot; and a second tile's メ is
    // a drop describing a session you are no longer looking at.
    closeTileMore();
    document.querySelectorAll('.tmac.open, .tdocs.open').forEach((m) => m.classList.remove('open'));
    if (wasOpen) return; // the click that closes is the click on メ itself
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  });

  // Clicks INSIDE the strip are not dismissals — they are you working the controls. A
  // control that opens something closes the drop on its own; `buildTileHead` wires that
  // per row, because only the table knows which rows are instruments.
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', close);

  // CAPTURE phase, and only while open — the precedent is the job menu (`widgets.js`).
  // Escape has to reach the drop before the terminal underneath, or a locked pane eats
  // the keystroke and the drop stays up. The `open` guard is the other half of that
  // bargain: a listener that swallowed Escape while the drop was SHUT would be taking
  // it away from the pane every time, which is the one thing this must not do.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !menu.classList.contains('open')) return;
      // AND NOT WHILE A MODAL SHEET IS UP OVER IT. Since 2026-08-18 the two rows that
      // raise a `ui.sheet` (🏷 and 📝) leave this drop OPEN behind their scrim — closing it
      // hid their own opener and `ui.sheet` had nowhere to put the keyboard back
      // (tilehead.js, the `modal` column). So this listener is now live at a moment it
      // never used to be, and being a document CAPTURE listener it reaches Escape before
      // the sheet does. Without this line the first Escape shut the drop out from under a
      // sheet that stayed open — "Escape closes the topmost transient surface"
      // (docs/ui.md) run exactly backwards. The sheet takes this press; the next one
      // takes the drop, which is the order they are stacked on screen.
      if (document.querySelector('.ui-sheet.open')) return;
      e.stopPropagation();
      close();
    },
    true,
  );

  return { el: btn, menu, close };
}
