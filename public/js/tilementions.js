/* part of the ronin-cowork client — see js/README.md */
import { S } from './state.js';
import { closeTileMore, fitDropToTile } from './tilemore.js';

export const MENTION_MIME = 'application/x-ronin-session-mention';

/** The @ control on a tile: choose a session without spelling its name by hand. */
export function buildTileMentions(tile) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tmention-btn';
  btn.textContent = '@';
  btn.title = 'Mention another session';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'tmention';
  menu.setAttribute('role', 'menu');

  const close = () => {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };

  const insert = (name) => {
    const mention = `@${name} `;
    const ta = tile.composerTa;
    if (ta && !tile.locked) {
      const start = ta.selectionStart;
      const lead = start > 0 && !/\s/.test(ta.value[start - 1]) ? ' ' : '';
      ta.setRangeText(lead + mention, start, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
      ta.focus();
    } else if (tile.locked) {
      tile.sendRaw(mention);
      tile.focusTerminal();
    } else {
      tile.pending += mention;
      tile.renderPending();
    }
    close();
  };

  const render = () => {
    menu.innerHTML = '';
    for (const session of S.sessions) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tmention-row';
      row.textContent = session.name;
      row.title = session.name;
      row.draggable = true;
      row.setAttribute('role', 'menuitem');
      row.addEventListener('click', () => insert(session.name));
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(MENTION_MIME, session.name);
        e.dataTransfer.setData('text/plain', `@${session.name} `);
      });
      menu.appendChild(row);
    }
    if (!S.sessions.length) menu.textContent = 'no sessions yet';
  };

  btn.addEventListener('click', () => {
    const opening = !menu.classList.contains('open');
    document.querySelectorAll('.tdrop.open, .tmac.open, .tdocs.open, .tmention.open')
      .forEach((node) => node.classList.remove('open'));
    closeTileMore();
    if (!opening) return close();
    render();
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    fitDropToTile(btn, menu);
  });

  document.addEventListener('pointerdown', (e) => {
    if (menu.classList.contains('open') && !menu.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      close();
      btn.focus();
    }
  });

  return { el: btn, menu, close };
}
