/* part of the ronin-cowork client — see js/README.md */
import { buildDocs } from './docs.js';
import { t } from './lexicon.js';

function closeButton(title) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'tile-doc-close';
  close.textContent = '×';
  close.title = title;
  return close;
}

/** The shared document editor, scoped to and painted over one Agent tile. */
export function buildTileDocView(tile) {
  const root = document.createElement('div');
  root.className = 'home-docs tile-doc-view';
  const docs = buildDocs(root, (name) => name === tile.session);
  const closeTitle = t('docs.close_agent', 'Close documents and return to this Agent');
  const shelfClose = closeButton(closeTitle);
  const editorClose = closeButton(closeTitle);
  root.querySelector('.dc-pills')?.append(shelfClose);
  root.querySelector('.dc-bar')?.append(editorClose);
  const leave = () => {
    if (!tile.surfaceHost.is('docs')) return true;
    if (docs.leave()) {
      docs.close();
      tile.syncSurface(false);
      return true;
    }
    return false;
  };
  shelfClose.addEventListener('click', leave);
  editorClose.addEventListener('click', leave);
  return {
    el: root,
    async open(path) {
      tile.surfaceHost.select('docs');
      docs.enter();
      await docs.open(path);
    },
    close: leave,
    isOpen: () => tile.surfaceHost.is('docs'),
    dispose: () => docs.close(),
  };
}

/**
 * Docs over a chat that has no tile around it (Irasshai's): the same editor, painted over its
 * `.tile-body` as the Docs surface; × hands the chat back. One per body, reused.
 */
export function openDocOver(body, path) {
  if (!body) return;
  let view = body.querySelector(':scope > .tile-doc-view');
  if (!view) {
    view = document.createElement('div');
    view.className = 'home-docs tile-doc-view';
    view.docs = buildDocs(view, () => false);
    const closeTitle = t('docs.close_chat', 'Close documents and return to Chat');
    const shelfClose = closeButton(closeTitle);
    const editorClose = closeButton(closeTitle);
    view.querySelector('.dc-pills')?.append(shelfClose);
    view.querySelector('.dc-bar')?.append(editorClose);
    const close = () => {
      if (!view.docs.leave()) return;
      view.docs.close();
      body.dataset.surface = view.back;
    };
    shelfClose.addEventListener('click', close);
    editorClose.addEventListener('click', close);
    body.append(view);
  }
  if (body.dataset.surface !== 'docs') view.back = body.dataset.surface;
  body.dataset.surface = 'docs';
  view.docs.enter();
  void view.docs.open(path);
}
