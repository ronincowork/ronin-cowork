/* part of the ronin-cowork client — see js/README.md */
import { buildDocs } from './docs.js';
import { refreshHome } from './home.js';
import { t } from './lexicon.js';

/** The shared document editor, scoped to and painted over one Agent tile. */
export function buildTileDocView(tile) {
  const root = document.createElement('div');
  root.className = 'home-docs tile-doc-view';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tile-doc-close';
  close.textContent = '×';
  close.title = t('docs.close_agent', 'Close documents and return to this Agent');
  root.append(close);

  const docs = buildDocs(tile, root, () => root.classList.contains('open'), (name) => name === tile.session);
  close.addEventListener('click', () => {
    if (docs.leave()) root.classList.remove('open');
  });
  return {
    el: root,
    async open(path) {
      root.classList.add('open');
      await refreshHome();
      docs.enter();
      await docs.open(path);
    },
    close() { if (docs.leave()) root.classList.remove('open'); },
  };
}
