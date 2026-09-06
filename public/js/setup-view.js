/* Ronin Setup — the fourth workbench, composed entirely from registered surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { PRESETS_TYPE, createKindsPreference, createPresetsSurface, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { openWorkspaceStateTab, reserveWorkspaceTab } from './workspace.js';
import { request } from './request.js';
import { t } from './lexicon.js';

const PROFILE = 'setup';
// The selector's fixed order. Model providers comes first because it is the first job.
const ORDER = Object.freeze([
  SETUP_SURFACE_TYPES.providers, SETUP_SURFACE_TYPES.register, SETUP_SURFACE_TYPES.roots,
  SETUP_SURFACE_TYPES.services, SETUP_SURFACE_TYPES.gbrain, SETUP_SURFACE_TYPES.templates, SETUP_SURFACE_TYPES.launchOwn,
]);
// THE SAME SHAPE AS THE TEAM PAGE: workspace 1, the selector, workspace 2. Presets is
// pinned in workspace 1 and takes the widest column; the setup work sits compact in
// workspace 2. The widths are only defaults — the splitters and the layout map still
// belong to the person, as on every workbench.
const DEFAULT_ARRANGEMENT = Object.freeze({
  order: Object.freeze(['workspace1', 'selector', 'workspace2']),
  hidden: Object.freeze([]),
  widths: Object.freeze({ workspace1: 52, selector: 16, workspace2: 32 }),
});
const sameOrder = (a = [], b = []) => Array.isArray(a) && a.length === b.length && a.every((name, index) => name === b[index]);

const emptyRequirementState = () => ({ hovered: [], open: [], flash: [], flashCycle: 0 });
const requirementState = (next = {}) => ({
  hovered: [...new Set(Array.isArray(next.hovered) ? next.hovered.map(String) : [])],
  open: [...new Set(Array.isArray(next.open) ? next.open.map(String) : [])],
  flash: [...new Set(Array.isArray(next.flash) ? next.flash.map(String) : [])],
  flashCycle: Number.isFinite(next.flashCycle) ? Number(next.flashCycle) : 0,
});

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
  const requirementListeners = new Set();
  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'cv-blank' });
    const word = document.createElement('p'); word.className = 'cv-blank-word'; word.textContent = t('team.workspace_blank', 'Workspace');
    surface.content.append(word);
    return surface.el;
  };
  const presetEnvironment = () => ({
    customize: ({ template, user_message } = {}) => openWorkspaceStateTab(ctx, 'launch', { customize: { template, user_message: String(user_message || '') } }),
    launch: launchPresetPlan,
    launchUrl: presetLaunchUrl,
    reserveLaunchTab: reserveWorkspaceTab,
    kinds: environment.kinds,
    setSetupRequirementState: (next) => environment.setSetupRequirementState(next),
    navigateToSurface: (type, detail = {}) => {
      bench?.place(type, 'workspace2', detail);
      bench?.select('workspace2');
    },
  });
  let bench = null;
  const environment = {
    presets: (workspace) => createPresetsSurface({ environment: presetEnvironment(), workspace }),
    showNewSession: (prompt) => { ctx?.patchViewState('launch', { prompt: String(prompt || '') }); ctx?.navigate('launch'); },
    openTemplateMaker: () => ctx?.navigate('launch'),
    setupRuntime: null,
    // What the person uses Ronin for: one persisted preference shared by Register and Presets.
    kinds: createKindsPreference(globalThis.localStorage, (kinds) => request('/api/setup/preferences', { method: 'PATCH', json: { kinds } })),
    setupRequirementState: emptyRequirementState(),
    setSetupRequirementState: (next) => {
      environment.setupRequirementState = requirementState(next);
      bench?.refreshSelector();
      for (const listener of requirementListeners) listener(environment.setupRequirementState);
    },
    onSetupRequirementState: (listener) => {
      if (typeof listener !== 'function') return () => {};
      requirementListeners.add(listener);
      return () => requirementListeners.delete(listener);
    },
    mountProviderSetupSession: ({ host, provider, session, workspace, onClosed } = {}) => {
      if (!(host instanceof Node) || !session) return null;
      const terminal = WorkspaceKit.adapters.createTerminalTileHost({ mode: 'full' });
      terminal.el.dataset.provider = String(provider?.id || provider || '');
      terminal.el.dataset.workspace = String(workspace || 'workspace2');
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
    fixedWorkspaces: { workspace1: PRESETS_TYPE },
    selectorWorkspace: 'workspace2',
    selectorCurrent: true,
    selectorFilter: (type) => type !== PRESETS_TYPE,
    onStateChange: save,
    onPlacement: save,
  });
  return {
    el: bench.host,
    glyph: '人',
    hideFeedback: true,
    hideShapeControl: true,
    title: () => t('setup.title', 'Ronin Setup'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      if (!environment.setupRuntime) {
        const runtime = await request('/api/setup/runtime', { cache: 'no-store' });
        environment.setupRuntime = runtime.ok ? runtime.data : { providers: [] };
        if (runtime.ok) environment.kinds.hydrate(runtime.data?.preferences?.kinds || []);
      }
      // Provider cards are catalog discovery, not a client fallback list. Publish the
      // shared runtime truth before restoring a remembered surface into workspace 2.
      bench.refreshSelector();
      const stored = context.viewState('setup') || {};
      // Widths a person set on this shape are kept; a state saved by an earlier Setup
      // shape (selector first) is re-seated on the workbench order instead.
      const widths = sameOrder(stored.arrangement?.order, DEFAULT_ARRANGEMENT.order) ? stored.arrangement.widths : DEFAULT_ARRANGEMENT.widths;
      bench.enter({ ...stored, count: 2, arrangement: { ...DEFAULT_ARRANGEMENT, widths } });
      bench.setCount(2);
      const remembered = stored.seats?.workspace2;
      const held = typeof remembered === 'object' ? remembered.type : remembered;
      const detail = typeof remembered === 'object' && remembered.key ? { key: remembered.key, provider: remembered.key } : {};
      bench.place(PRESETS_TYPE, 'workspace1');
      bench.place(ORDER.includes(held) ? held : SETUP_SURFACE_TYPES.providers, 'workspace2', detail);
      bench.select('workspace2');
      bench.refreshSelector();
      save();
    },
    leave: () => { environment.setSetupRequirementState(); bench.leave(); },
    destroy: () => { for (const host of providerHosts) host.destroy(); providerHosts.clear(); bench.leave(); ctx = null; },
  };
}
