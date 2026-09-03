/* part of the ronin-cowork client — see js/README.md */

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
      // raise a `ui.sheet` (🏷 and 📝) leave this drop OPEN behind their scrim — closing it
      // hid their own opener and `ui.sheet` had nowhere to put the keyboard back
      // (tilehead.js, the `modal` column). So this listener is now live at a moment it
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
