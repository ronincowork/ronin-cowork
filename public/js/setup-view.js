/* Ronin Setup — the fourth workbench, composed entirely from registered surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { PRESETS_TYPE, createPresetsSurface, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { reserveWorkspaceTab } from './workspace.js';
import { request } from './request.js';
import { t } from './lexicon.js';

const PROFILE = 'setup';
const ORDER = Object.freeze([
  SETUP_SURFACE_TYPES.register, SETUP_SURFACE_TYPES.providers, SETUP_SURFACE_TYPES.roots,
  SETUP_SURFACE_TYPES.services, SETUP_SURFACE_TYPES.gbrain, SETUP_SURFACE_TYPES.templates,
]);

export function registerSetupWorkbench() {
  registerSetupSurfaces();
  registerPresetsSurface();
  return WorkspaceKit.workbench.profiles.define(PROFILE, [PRESETS_TYPE, ...ORDER]);
}

export function createSetupView() {
  registerSetupWorkbench();
  const { createSurface } = WorkspaceKit.primitives;
  let ctx = null;
  const providerHosts = new Set();
  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'cv-blank' });
    const word = document.createElement('p'); word.className = 'cv-blank-word'; word.textContent = t('team.workspace_blank', 'Workspace');
    surface.content.append(word);
    return surface.el;
  };
  const presetEnvironment = () => ({
    customize: () => ctx?.navigate('launch'),
    launch: launchPresetPlan,
    launchUrl: presetLaunchUrl,
    reserveLaunchTab: reserveWorkspaceTab,
    navigateToSurface: (type, detail = {}) => {
      bench?.place(type, 'workspace1', detail);
      bench?.select('workspace1');
    },
  });
  let bench = null;
  const environment = {
    presets: (workspace) => createPresetsSurface({ environment: presetEnvironment(), workspace }),
    showNewSession: (prompt) => { ctx?.patchViewState('launch', { prompt: String(prompt || '') }); ctx?.navigate('launch'); },
    openTemplateMaker: () => ctx?.navigate('launch'),
    setupRuntime: null,
    mountProviderSetupSession: ({ host, provider, session, workspace, onClosed } = {}) => {
      if (!(host instanceof Node) || !session) return null;
      const terminal = WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' });
      terminal.el.dataset.provider = String(provider?.id || provider || '');
      terminal.el.dataset.workspace = String(workspace || 'workspace1');
      host.replaceChildren(terminal.el);
      terminal.mount(String(session));
      providerHosts.add(terminal);
      let closed = false;
      const destroy = () => {
        if (closed) return;
        closed = true;
        providerHosts.delete(terminal);
        terminal.destroy();
        onClosed?.();
      };
      return { el: terminal.el, fit: terminal.fit, park: terminal.park, destroy };
    },
  };
  const save = () => ctx?.patchViewState('setup', bench.snapshot());
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'setup' },
    environment,
    defaultNode: blank,
    label: t('setup.title', 'Ronin Setup'),
    title: () => t('setup.title', 'Ronin Setup'),
    fixedWorkspaces: { workspace2: PRESETS_TYPE },
    selectorWorkspace: 'workspace1',
    selectorFilter: (type) => type !== PRESETS_TYPE,
    onStateChange: save,
    onPlacement: save,
  });
  return {
    el: bench.host,
    glyph: '人',
    hideFeedback: true,
    title: () => t('setup.title', 'Ronin Setup'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      if (!environment.setupRuntime) {
        const runtime = await request('/api/setup/runtime', { cache: 'no-store' });
        environment.setupRuntime = runtime.ok ? runtime.data : { providers: [] };
      }
      const stored = context.viewState('setup') || {};
      bench.enter({ ...stored, count: 2 });
      bench.setCount(2);
      bench.arrangement.move('selector', 0);
      const remembered = stored.seats?.workspace1;
      const held = typeof remembered === 'object' ? remembered.type : remembered;
      const detail = typeof remembered === 'object' && remembered.key ? { key: remembered.key, provider: remembered.key } : {};
      bench.place(ORDER.includes(held) ? held : SETUP_SURFACE_TYPES.register, 'workspace1', detail);
      bench.place(PRESETS_TYPE, 'workspace2');
      bench.select('workspace1');
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { for (const host of providerHosts) host.destroy(); providerHosts.clear(); bench.leave(); ctx = null; },
  };
}
