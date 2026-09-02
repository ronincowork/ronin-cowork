/* part of the ronin-cowork client — see js/README.md */
import { closeTileMore, fitDropToTile } from './tilemore.js';
import { t } from './lexicon.js';

/** This Agent's tracked documents. The letter already holds the paths; opening one is
 * handed back to the Tile, which owns the in-place editor. */
export function buildTileDocs(tile) {
  const btn = document.createElement('button');
  btn.className = 'tdocs-btn';
  btn.type = 'button';
  btn.textContent = '📄';
  btn.dataset.label = t('me.docs', 'Docs');

  const menu = document.createElement('div');
  menu.className = 'tdocs';
  const close = () => menu.classList.remove('open');

  const render = () => {
    menu.replaceChildren();
    const docs = tile.tegami?.docs || [];
    if (!docs.length) {
      const empty = document.createElement('div');
      empty.className = 'tdocs-empty';
      empty.textContent = t('docs.empty_session', 'Nothing tracked yet. Ask this Agent to update its Work Record with the docs it is tracking; they will appear here.');
      menu.append(empty);
      return;
    }
    for (const path of docs) {
      const parts = path.split('/');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tdocs-row';
      row.title = path;
      row.append(
        Object.assign(document.createElement('b'), { textContent: parts.pop() }),
        Object.assign(document.createElement('span'), { textContent: parts.slice(-2).join('/') }),
      );
      row.addEventListener('click', () => { close(); tile.openDoc(path); });
      menu.append(row);
    }
  };

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (btn.getAttribute('aria-disabled') === 'true') return;
    const wasOpen = menu.classList.contains('open');
    closeTileMore();
    document.querySelectorAll('.tmac.open, .tdocs.open').forEach((drop) => drop.classList.remove('open'));
    if (wasOpen) return;
    render();
    menu.classList.add('open');
    fitDropToTile(btn, menu);
  });
  menu.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', close);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  return { el: btn, menu, close };
}
