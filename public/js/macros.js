/* part of the tmux-ronin client — see js/README.md */
import { openSessionSomewhere } from './events.js';
import { jobIcon } from './home.js';
import { padToast } from './pad.js';
import { IS_TOUCH, S, tiles } from './state.js';

/* ---------- session switcher (one pad key: open → arrow → same key lands it) ---------- */
// Deliberately NOT the tile's native <select>: a browser can't open a native
// dropdown from script, and once the OS list is up the arrow keys belong to the
// OS, not to us — the pad could never take the second press. So this is our own
// list, which means one physical key can own the whole gesture. It changes
// nothing about the <select>; that's still the mouse way in.
export function buildSessionPicker() {
  const sheet = document.createElement('div');
  sheet.id = 'sesspick';
  sheet.innerHTML = `<div class="sp-card">
      <div class="sp-title"></div>
      <div class="sp-list"></div>
      <div class="sp-hint">↑↓ move · same key (or ↵) opens it · Esc cancels</div>
    </div>`;
  document.body.appendChild(sheet);
  const title = sheet.querySelector('.sp-title');
  const list = sheet.querySelector('.sp-list');
  let names = [];
  let idx = 0;

  const render = () => {
    list.innerHTML = '';
    names.forEach((name, i) => {
      const s = S.sessions.find((x) => x.name === name) || {};
      const row = document.createElement('button');
      row.className = 'sp-row' + (i === idx ? ' on' : '') + (S.active && S.active.session === name ? ' cur' : '');
      const b = document.createElement('b');
      const mark = jobIcon(s);
      b.textContent = (mark ? mark + ' ' : '') + name;
      // Groups, not window counts: when you're choosing what to pull into a tile, what
      // you want to know is which piece of work this belongs to.
      const meta = document.createElement('span');
      meta.className = 'sp-meta';
      meta.textContent = (s.tags || []).join(' · ');
      row.append(b, meta);
      row.addEventListener('click', () => {
        idx = i;
        commit();
      });
      list.appendChild(row);
    });
    const on = list.querySelector('.sp-row.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
  };

  const isOpen = () => sheet.classList.contains('open');
  const close = () => sheet.classList.remove('open');
  const open = () => {
    names = S.sessions.map((s) => s.name);
    if (!names.length) {
      padToast('⌸ no sessions to switch to', false);
      return;
    }
    const t = S.active || tiles[0];
    const n = tiles.indexOf(t) + 1;
    title.textContent = `Switch tile ${n || 1}` + (t && t.session ? ` — now: ${t.session}` : '');
    idx = Math.max(0, names.indexOf(t && t.session));
    render();
    sheet.classList.add('open');
  };
  const move = (d) => {
    if (!isOpen()) return;
    idx = (idx + d + names.length) % names.length;
    render();
  };
  const commit = () => {
    const name = names[idx];
    close();
    if (!name) return;
    const t = S.active || tiles[0];
    if (!t || t.el.style.display === 'none') {
      openSessionSomewhere(name);
      return;
    }
    t.connect(name);
    t.activate();
    if (!IS_TOUCH) t.focusTerminal();
  };

  sheet.addEventListener('pointerdown', (e) => {
    if (e.target === sheet) close();
  });
  // Keyboard fallback (and what makes ↑↓ work while the list is up): capture-phase
  // so the arrows steer the list instead of reaching xterm/tmux. Only ever active
  // while the list is open — every other key on every device is untouched.
  document.addEventListener(
    'keydown',
    (e) => {
      if (!isOpen()) return;
      const k = e.key;
      if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'Enter' && k !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (k === 'ArrowUp') move(-1);
      else if (k === 'ArrowDown') move(1);
      else if (k === 'Enter') commit();
      else close();
    },
    true,
  );
  S.sessPicker = { open, close, isOpen, move, commit };
}
