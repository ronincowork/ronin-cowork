/* One Workspace folders surface assembly, parameterized by its Workbench job. */
import { WorkspaceKit } from './workspace-kit.js';
import { buildProjectRoots } from './projectroots.js';
import { t } from './lexicon.js';
import { createGithubWorkspaceSetup } from './github-workspace-setup.js';

const el = (tag, cls = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  return out;
};

/**
 * Setup and Settings show the same collection through the same keep-or-ignore stones.
 * Campaign scope remains an input to that one surface, not a second presentation.
 */
export function createWorkspaceFoldersSurface({
  campaignId,
  connected,
  presentation = '',
  onShow = () => {},
  environment = null,
  workspace = 'workspace2',
  before = [],
  onGithubState = () => {},
} = {}) {
  const surface = WorkspaceKit.primitives.createSurface({
    label: t('cowork.tab_roots', 'Workspace folders'),
    className: 'setup-surface',
  });
  const back = WorkspaceKit.primitives.createAction({ label: t('roots.return_to_preset', 'Return to Preset') });
  back.el.hidden = true;
  back.el.addEventListener('click', () => environment?.returnFromWorkspaceFolders?.());
  surface.header?.actions.append(back.el);
  const rootHost = presentation === 'stones'
    ? surface.content
    : el('div', 'desk-pane desk-proj show');
  if (rootHost !== surface.content) surface.content.append(rootHost);

  let room = null;
  const github = presentation === 'stones' ? createGithubWorkspaceSetup({
    environment,
    workspace,
    onStateChange: (state) => { room?.updateExtraItems(); onGithubState(state); },
    onAuthenticated: () => {
      environment?.onGithubAuthenticated?.();
      room?.select('\0github-clone', { focus: true });
    },
    onCloned: async (root) => {
      await room?.refresh();
      if (root?.name) room?.select(root.name, { focus: true });
    },
  }) : null;
  room = buildProjectRoots(
    rootHost,
    () => connected?.(rootHost) ?? rootHost.isConnected,
    () => campaignId?.() || '',
    presentation ? {
      presentation,
      before,
      extraItems: github?.items || [],
      onSelection: (id) => environment?.onWorkspaceFolderChosen?.(id),
    } : {},
  );

  return {
    el: surface.el,
    show: () => {
      back.el.hidden = !environment?.workspaceFolderOrigin?.();
      void github?.show();
      room.enter();
      onShow();
    },
    destroy: () => github?.destroy(),
  };
}
