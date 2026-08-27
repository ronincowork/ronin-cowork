/* part of the ronin-cowork client — see js/README.md */
import { grid, saveState, tiles } from './state.js';
import { collapseTileHead, expandTileHead, isCoarse } from './tiledrop.js';
import { t } from './lexicon.js';

/** The ring the grid count steps round, and the only statement of it: the bar button,
 *  the pad's layout key and the button's own label all ask here, so they cannot drift. */
export const nextLayout = (n) => (n === 1 ? 2 : n === 2 ? 4 : 1);

/** What the grid is showing right now. Read from the DOM rather than a variable because
 *  the grid IS the state — `saveState` reads it back out of the same attribute. */
export const curLayout = () => Number(grid.dataset.layout) || 4;

export function setLayout(n) {
  n = [1, 2, 4].includes(n) ? n : 4;
  grid.dataset.layout = String(n);
  grid.className = 'layout-' + n;
  // THE ONE PLACE the count is written. The button wears the number it is on, so the
  // bar states the layout as well as changing it — and it is the only writer, so every
  // other way in (the cycle click, the pad's layout key, ⌥⌘1/2/4, boot) lands on a face
  // that is true. It replaced a segmented 1|2|4: three boxes to say what one says, two
  // of them dark at any moment, and too narrow to hit on a phone. Null-checked because
  // setLayout can run before the bar is assembled.
  const cyc = document.getElementById('layoutcycle');
  if (cyc) {
    cyc.textContent = String(n);
    cyc.title = n === 1 ? t('bar.layout_one', '{n} terminal — click for {next}', { n, next: nextLayout(n) }) : t('bar.layout_many', '{n} terminals — click for {next}', { n, next: nextLayout(n) });
    cyc.setAttribute('aria-label', cyc.title);
  }
  // TOUCH: the merged header follows the COUNT, not the device. Tile 1's controls live
  // in the app bar only while tile 1 is the only tile — a per-page bar cannot say which
  // of two tiles it means. Ask for two and the head goes home, so every tile on screen
  // wears its own; come back to one and it is hoisted again. Both calls are idempotent,
  // so running this on every setLayout costs nothing when the count did not cross 1.
  if (isCoarse() && tiles[0]) (n === 1 ? collapseTileHead : expandTileHead)(tiles[0]);
  tiles.forEach((t, i) => {
    t.el.style.display = i < n ? '' : 'none';
  });
  requestAnimationFrame(() => tiles.forEach((t, i) => i < n && t.doFit()));
  saveState();
}

