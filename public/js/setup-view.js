/* Ronin Setup — the fourth workbench, composed entirely from registered surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { PRESETS_TYPE, createPresetsSurface, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { reserveWorkspaceTab } from './workspace.js';
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
  });
  let bench = null;
  const environment = {
    presets: (workspace) => createPresetsSurface({ environment: presetEnvironment(), workspace }),
    showNewSession: (prompt) => { ctx?.patchViewState('launch', { prompt: String(prompt || '') }); ctx?.navigate('launch'); },
    openTemplateMaker: () => ctx?.navigate('launch'),
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
    selectorFilter: (type) => type !== PRESETS_TYPE,
    onStateChange: save,
    onPlacement: save,
  });
  return {
    el: bench.host,
    glyph: '人',
    title: () => t('setup.title', 'Ronin Setup'),
    mount: (_host, context) => { ctx = context; },
    enter: (context) => {
      ctx = context;
      const stored = context.viewState('setup') || {};
      bench.enter({ ...stored, count: 2 });
      bench.setCount(2);
      bench.place(PRESETS_TYPE, 'workspace1');
      const held = typeof stored.seats?.workspace2 === 'object' ? stored.seats.workspace2.type : stored.seats?.workspace2;
      bench.place(ORDER.includes(held) ? held : SETUP_SURFACE_TYPES.register, 'workspace2');
      bench.select('workspace2');
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { bench.leave(); ctx = null; },
  };
}

