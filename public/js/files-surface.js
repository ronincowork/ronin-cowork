/* Files (owner, KAN-146): the machine's file explorer, copyparty framed at /files/, from the home folder.
 * Its card is Explorer in the Workspaces selector (owner, 2026-11-02), offered only where Ronin found
 * Python at start (the page says so in <html data-files>); seated in Tilespace 2 of Workspaces. A folder link dragged out of it is /files/<path>,
 * which the Workspace page adds as $HOME/<path>. Server half: src/files.ts. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

export const FILES_TYPE = 'ronin.files';
export const FILES_ON = document.documentElement.dataset.files === 'on';

/* An iframe swallows every drag that crosses it, so a stone or selector dropped on Explorer's tile would
 * land in copyparty (as an upload) instead of replacing the tile. While a drag started in Ronin is under
 * way, the frame lets the pointer through (html.ronin-dragging, style.css). Files dragged in from the
 * desktop start no drag here, so they still reach copyparty and upload. */
function passDragsThrough() {
  const root = document.documentElement;
  document.addEventListener('dragstart', () => root.classList.add('ronin-dragging'), true);
  for (const end of ['dragend', 'drop']) document.addEventListener(end, () => root.classList.remove('ronin-dragging'), true);
}

export function registerFilesSurface() {
  const { library } = WorkspaceKit.workbench;
  if (library.has(FILES_TYPE)) return;
  passDragsThrough();
  library.register({
    type: FILES_TYPE,
    header: 'surface',
    className: 'wk-selector-utility',
    visible: () => FILES_ON,
    label: () => t('files.title', 'Explorer'),
    summary: () => t('files.summary', 'Your home folder: view, move, manage and edit'),
    create: () => createFilesSurface(),
  });
}

function createFilesSurface() {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('files.title', 'Explorer'), className: 'files-surface', flush: true });
  const frame = document.createElement('iframe');
  frame.className = 'files-frame';
  frame.title = t('files.title', 'Explorer');
  frame.src = '/files/';
  out.content.append(frame);
  return { el: out.el };
}
