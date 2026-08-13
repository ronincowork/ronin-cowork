/* part of the tmux-ronin client — see js/README.md */
import { grid, saveState, tiles } from './state.js';

export function setLayout(n) {
  n = [1, 2, 4].includes(n) ? n : 4;
  grid.dataset.layout = String(n);
  grid.className = 'layout-' + n;
  document.querySelectorAll('.layouts button').forEach((b) => b.classList.toggle('active', b.dataset.layout === String(n)));
  tiles.forEach((t, i) => {
    t.el.style.display = i < n ? '' : 'none';
  });
  requestAnimationFrame(() => tiles.forEach((t, i) => i < n && t.doFit()));
  saveState();
}

