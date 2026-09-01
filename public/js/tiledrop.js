/* part of the ronin-cowork client — see js/README.md */

/**
 * The coarse-pointer sheet primitives. Two exports, two jobs:
 *
 *   isCoarse()  the stylesheet-agreeing touch test — narrower than IS_TOUCH on purpose
 *   makeDrop()  a button and the sheet it drops, shared so every sheet behaves the same
 *
 * The one-row phone header that used to live here (collapseTileHead / expandTileHead,
 * hoisting the tile head into the app bar) is GONE: a phone never builds the bar at
 * all now — it gets the phone shell (js/phone.js, the MOBILE plan), whose メ sheet is
 * built from makeDrop below with the tile's own controls relocated into it. The keys
 * drawer that lived beside it went the same way: the keys ride every coarse tile's
 * composer (js/keysrow.js).
 */

/** Only run where the STYLESHEET agrees. IS_TOUCH is broader (it also accepts a bare
 *  `ontouchstart`), and on a device where the two disagree the relocated nodes would
 *  land in a container the CSS never unhides. When in doubt, leave the bar alone. */
export const isCoarse = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * A bar button and the sheet it drops. Every sheet behaves identically — open one and
 * its rivals close, tap outside or Escape to dismiss.
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
