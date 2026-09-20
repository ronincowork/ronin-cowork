/* One Workspace folders surface assembly, parameterized by its Workbench job. */
import { WorkspaceKit } from './workspace-kit.js';
import { buildProjectRoots } from './projectroots.js';
import { t } from './lexicon.js';
import { createGithubWorkspaceSetup } from './github-workspace-setup.js';
import { createSetupZone, goodToGo } from './setup-zone.js';
import { request } from './request.js';

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

  /**
   * Step 3's header zone states GITHUB, not the folder list. The zone asks the thing that
   * needs a decision; registering a folder is an act, done on the surface, and answers
   * nothing (designer, 2026-09-20). A person can legitimately say they do not use GitHub,
   * and the machine cannot decide that for them.
   */
  const zone = presentation === 'stones' && environment?.answerSetupStep ? createSetupZone() : null;
  let connectedToGithub = false;
  const paintZone = () => {
    if (!zone) return;
    // Connected but nowhere to work is still worth saying: Agents start in a folder.
    const folders = (environment?.trackedRoots?.() || []).filter((entry) => entry?.name).length;
    const declined = environment?.setupProgress?.()?.steps?.find((step) => step.id === 'workspace')?.answer === 'not_now';
    if (connectedToGithub) {
      zone.paint({
        state: folders ? 'GitHub connected.' : 'GitHub connected. No folder registered.',
        picks: [goodToGo(() => environment?.nextSetupStep?.())],
      });
      return;
    }
    zone.paint({
      state: 'No GitHub connection found.',
      picks: [
        { label: 'Connect GitHub', action: () => rootHost.querySelector('.setup-roots-github-stone')?.click() },
        { label: 'I don\u2019t use GitHub', chosen: declined, action: () => environment?.answerSetupStep?.('workspace', 'not_now') },
      ],
    });
  };

  let room = null;
  const github = presentation === 'stones' ? createGithubWorkspaceSetup({
    environment,
    workspace,
    onStateChange: () => { room?.updateExtraItems(); paintZone(); },
    onAuthenticated: () => {
      connectedToGithub = true;
      paintZone();
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
      extraItems: github?.items || [],
      before: zone ? [zone.el] : [],
      onSelection: (id) => { environment?.onWorkspaceFolderChosen?.(id); paintZone(); },
    } : {},
  );

  return {
    el: surface.el,
    show: () => {
      back.el.hidden = !environment?.workspaceFolderOrigin?.();
      void github?.show();
      room.enter();
      onShow();
      if (zone) {
        paintZone();
        void request('/api/setup/github', { cache: 'no-store' }).then((result) => {
          connectedToGithub = result.ok && result.data?.authenticated === true;
          paintZone();
        });
      }
    },
    destroy: () => github?.destroy(),
  };
}
