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

/** Shut every メ drop on the page. ⚡ calls this when its own menu opens. */
export const closeTileMore = () => drops.forEach((close) => close());

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
    // Every rival first. ⚡'s macro list anchors to the same corner of the same header,
    // so two open at once is two panels on one spot; and a second tile's メ is a drop
    // describing a session you are no longer looking at.
    closeTileMore();
    document.querySelectorAll('.tmac.open').forEach((m) => m.classList.remove('open'));
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
      e.stopPropagation();
      close();
    },
    true,
  );

  return { el: btn, menu, close };
}
