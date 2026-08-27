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

