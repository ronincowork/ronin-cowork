/* part of the tmux-ronin client — see js/README.md */
import { grid, saveState, tiles } from './state.js';

export function setLayout(n) {
  n = [1, 2, 4].includes(n) ? n : 4;
  grid.dataset.layout = String(n);
  grid.className = 'layout-' + n;
  document.querySelectorAll('.layouts button').forEach((b) => b.classList.toggle('active', b.dataset.layout === String(n)));
  // Touch has one button where desktop has three, and it wears the count it is on —
  // so the bar states the layout as well as changing it. Built in js/layout.js; absent
  // on desktop, and absent here until the bar is assembled, hence the null check.
  const cyc = document.getElementById('layoutcycle');
  if (cyc) {
    cyc.textContent = String(n);
    cyc.title = `${n} terminal${n === 1 ? '' : 's'} — tap for ${n === 1 ? 2 : n === 2 ? 4 : 1}`;
    cyc.setAttribute('aria-label', cyc.title);
  }
  tiles.forEach((t, i) => {
    t.el.style.display = i < n ? '' : 'none';
  });
  requestAnimationFrame(() => tiles.forEach((t, i) => i < n && t.doFit()));
  saveState();
}

