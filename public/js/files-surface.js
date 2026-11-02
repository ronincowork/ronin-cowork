/* Files (owner, KAN-146): the machine's file explorer, copyparty framed at /files/, from the home folder.
 * Its card is Explorer in the Workspaces selector (owner, 2026-11-02), offered only where Ronin found
 * Python at start (the page says so in <html data-files>); seated in Tilespace 2 of Workspaces. A folder link dragged out of it is /files/<path>,
 * which the Workspace page adds as $HOME/<path>. Server half: src/files.ts. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';

export const FILES_TYPE = 'ronin.files';
export const FILES_ON = document.documentElement.dataset.files === 'on';

export function registerFilesSurface() {
  const { library } = WorkspaceKit.workbench;
  if (library.has(FILES_TYPE)) return;
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
