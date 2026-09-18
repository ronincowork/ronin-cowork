/* Ronin Setup — the lightweight first-use workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { request } from './request.js';
import { SETUP_SCENES } from './setup-journey.js';
import { GARDEN_CANVAS_TYPE, registerGardenCanvas } from './garden-canvas.js';
import { normalizeGardenCanvasCatalog } from './garden-canvas-model.js';
import { PRESETS_TYPE, createKindsPreference, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { reserveWorkspaceTab } from './workspace.js';
import { createThemeToggle } from './theme-toggle.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';

const PROFILE = 'setup';
// Release toggles: unfinished programs stay out of Setup without changing the workbench.
export const SETUP_FEATURES = Object.freeze({ bounty: false });
const SCENES = Object.freeze(SETUP_SCENES
  .filter((scene) => SETUP_FEATURES.bounty || scene.type !== SETUP_SURFACE_TYPES.bounty)
  .map((scene, index) => Object.freeze({ ...scene, number: index + 1 })));
const ORDER = Object.freeze(SCENES.map((scene) => scene.type));
const ARRANGEMENT = Object.freeze({
  order: Object.freeze(['workspace1', 'selector', 'workspace2']),
  hidden: Object.freeze([]),
  widths: Object.freeze({ workspace1: 34, selector: 18, workspace2: 48 }),
});
const GARDEN_CONTENT_URL = '/content/setup-garden.v2.json';

function registerSetupWorkbench() {
  registerSetupSurfaces();
  registerPasswordSurface();
  registerGardenCanvas();
  registerPresetsSurface();
  return WorkspaceKit.workbench.profiles.define(PROFILE, [GARDEN_CANVAS_TYPE, PRESETS_TYPE, ...ORDER]);
}

export function createSetupView() {
  registerSetupWorkbench();
  let ctx = null;
  let bench = null;
  let runtime = null;
  let garden = null;
  let gardenContent = null;
  let providerSurface = null;
  let paintedSceneId = null;
  let completionLoaded = false;
  let completion = { registered: false, github: false, roots: false };
  let installationsComplete = false;
  let passwordLoaded = false;
  let launchComplete = false;
  let sceneOverride = 1;
  const providerSessions = createProviderSetupSessionMount();
  const kinds = createKindsPreference(globalThis.localStorage, (next) => request('/api/setup/preferences', { method: 'PATCH', json: { kinds: next } }));
  const nextAction = WorkspaceKit.primitives.createAction({ label: 'Next', launch: true, action: () => advance() });
  const themeToggle = createThemeToggle();
  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
  const environment = {
    setupOnboardingExtras: true,
    onGithubAuthenticated: () => { completion.github = true; paint(); },
    onWorkspaceFolderChosen: () => { completion.roots = true; save(); paint(); },
    onInstallationsState: (values) => { installationsComplete = Object.values(values || {}).some((value) => value === true); paint(); },
    onPasswordState: () => { passwordLoaded = true; paint(); },
    onSetupLaunched: () => { launchComplete = true; paint(); },
    setupRuntime: null,
    onSetupRuntime: (next) => { runtime = next; environment.setupRuntime = next; paint(); },
    kinds,
    runtime: () => runtime || {},
    launch: launchPresetPlan,
    launchUrl: presetLaunchUrl,
    reserveLaunchTab: reserveWorkspaceTab,
    setPathNote: (path_note) => request('/api/setup/preferences', { method: 'PATCH', json: { path_note } }),
    setIdentityChoice: (identity_choice) => request('/api/setup/preferences', { method: 'PATCH', json: { identity_choice } }),
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    showNewSession: (prompt) => { ctx?.patchViewState('launch', { prompt: String(prompt || '') }); ctx?.navigate('launch'); },
    openLaunchForm: () => ctx?.navigate('launch'),
    onGardenCanvas: (next) => {
      garden = next;
      garden.controls.replaceChildren();
      garden.controls.hidden = true;
      paintedSceneId = null;
      selectGarden(activeScene());
    },
    onProviderSurface: (next) => { providerSurface = next; },
    openGardenMedia: async (item) => {
      if (!garden) return;
      if (item.kind !== 'doc') { garden.showMedia({ label: item.label, kind: item.kind, src: item.src }); return; }
      const query = new URLSearchParams({ path: item.path });
      if (item.root) query.set('root', item.root);
      else query.set('product', '1');
      const result = await request('/api/file?' + query.toString());
      garden.showMedia({ label: item.label, kind: item.kind, text: result.ok ? result.data.text || '' : result.message });
    },
    openSetupAction: (action) => {
      if (action === 'setup.providers.choose') {
        const scene = SCENES.find((candidate) => candidate.type === SETUP_SURFACE_TYPES.providers);
        if (!scene) return;
        sceneOverride = scene.number;
        open(scene.number);
        providerSurface?.openFirst();
        return;
      }
      const scene = SCENES.find((candidate) => candidate.type === action);
      if (!scene) return;
      sceneOverride = scene.number;
      open(scene.number);
    },
  };
  const save = () => ctx?.patchViewState('setup', { ...bench.snapshot(), sceneOverride, setupCompletion: { roots: completion.roots } });
  const defaultScene = () => SCENES.find((scene) => !sceneComplete(scene)) || SCENES[SCENES.length - 1];
  const sceneAt = (number) => SCENES[Number(number) - 1] || defaultScene();
  const activeScene = () => sceneAt(sceneOverride);
  const sceneComplete = (scene) => {
    if (scene.type === SETUP_SURFACE_TYPES.providers) return Number(runtime?.activated_count || 0) > 0;
    if (scene.type === SETUP_SURFACE_TYPES.register) return completion.registered || kinds.get().length > 0;
    if (scene.type === SETUP_SURFACE_TYPES.roots) return completion.github || completion.roots;
    if (scene.type === SETUP_SURFACE_TYPES.installations) return installationsComplete;
    if (scene.type === PASSWORD_SURFACE_TYPE) return passwordLoaded;
    if (scene.type === SETUP_SURFACE_TYPES.launchOwn) return launchComplete;
    return false;
  };
  const seatNext = (visible) => {
    if (!visible) { nextAction.el.remove(); return; }
    const actions = bench?.host.querySelector('[data-workspace="workspace2"] > .wk-surface > .wk-surface-header .wk-surface-header-actions');
    if (!actions) return;
    actions.prepend(nextAction.el);
  };
  const selectGarden = (scene) => {
    if (!garden || !gardenContent || !scene || paintedSceneId === scene.id) return false;
    garden.paint(gardenContent.canvases[scene.canvas] || null);
    paintedSceneId = scene.id;
    return true;
  };
  const paint = () => {
    const active = activeScene();
    const canAdvance = active.number < SCENES.length && sceneComplete(active);
    seatNext(canAdvance);
    for (const card of bench?.host.querySelectorAll('[data-workbench-offer-type]') || []) {
      delete card.dataset.sceneRelevant;
      const position = ORDER.indexOf(card.dataset.workbenchOfferType);
      const scene = SCENES[position];
      if (scene?.id === active.id) card.setAttribute('aria-current', 'page');
      else card.removeAttribute('aria-current');
      const complete = Boolean(scene && sceneComplete(scene));
      const blocked = scene?.type === SETUP_SURFACE_TYPES.launchOwn
        && Number(runtime?.activated_count || 0) < 1;
      card.disabled = blocked;
      if (blocked) {
        card.setAttribute('aria-disabled', 'true');
        card.title = 'Activate a model provider before launching an Agent, Team, or Preset.';
      } else {
        card.removeAttribute('aria-disabled');
        card.removeAttribute('title');
      }
      card.dataset.complete = String(complete);
      const heading = card.querySelector('.wk-card-heading');
      let mark = heading?.querySelector('[data-setup-complete-mark]');
      if (complete && !mark) {
        mark = document.createElement('span');
        mark.className = 'wk-card-mark';
        mark.dataset.setupCompleteMark = '';
        mark.textContent = '✓';
        heading.prepend(mark);
      } else if (!complete) mark?.remove();
    }
  };
  const open = (number) => {
    const scene = sceneAt(number);
    selectGarden(scene);
    bench.place(scene.type, 'workspace2');
    bench.select('workspace2');
    paint();
    save();
  };
  function advance() {
    if (!sceneComplete(activeScene())) return;
    const next = SCENES[activeScene().number];
    if (!next) return;
    sceneOverride = next.number;
    open(next.number);
  }
  kinds.subscribe(() => paint());

  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'setup' },
    environment,
    defaultNode: blank,
    label: 'Ronin Setup',
    title: () => 'Ronin Setup',
    selectorWorkspace: 'workspace2',
    selectorCurrent: true,
    hintsCollapsed: true,
    hintsPreferenceScope: 'setup',
    selectorFilter: (type) => ORDER.includes(type),
    onSelectorRefresh: paint,
    onStateChange: save,
    onPlacement: (snapshot) => {
      const type = typeof snapshot?.seats?.workspace2 === 'string' ? snapshot.seats.workspace2 : snapshot?.seats?.workspace2?.type;
      const scene = SCENES.find((candidate) => candidate.type === type);
      if (scene) {
        sceneOverride = scene.number;
        selectGarden(scene);
        paint();
      }
      save();
    },
  });
  bench.host.dataset.selectorDensity = 'thin';
  bench.host.querySelector('.wk-workbench-selector-cards')?.addEventListener('click', () => queueMicrotask(() => bench.select('workspace2')));

  return {
    el: bench.host,
    glyph: '人',
    header: { actions: [themeToggle] },
    title: () => 'Ronin Setup',
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      if (!runtime) {
        const result = await request('/api/setup/runtime', { cache: 'no-store' });
        runtime = result.ok ? result.data : { providers: [], activated_count: 0 };
        environment.setupRuntime = runtime;
        environment.kinds.hydrate(runtime?.preferences?.kinds || []);
      }
      if (!completionLoaded) {
        const [registration, github] = await Promise.all([
          request('/api/setup/registration', { cache: 'no-store' }),
          request('/api/setup/github', { cache: 'no-store' }),
        ]);
        completion = {
          registered: registration.ok && registration.data?.registered === true,
          github: github.ok && github.data?.authenticated === true,
          roots: false,
        };
        completionLoaded = true;
      }
      if (!gardenContent) {
        const result = await request(GARDEN_CONTENT_URL);
        gardenContent = normalizeGardenCanvasCatalog(result.ok ? result.data : { schema_version: 2, canvases: {} });
      }
      const stored = context.viewState('setup') || {};
      completion.roots = stored.setupCompletion?.roots === true;
      sceneOverride = defaultScene().number;
      bench.enter({ ...stored, count: 2, arrangement: { ...ARRANGEMENT, widths: stored.arrangement?.widths || ARRANGEMENT.widths } });
      bench.setCount(2);
      bench.place(GARDEN_CANVAS_TYPE, 'workspace1');
      paint();
      open(sceneOverride);
    },
    leave: () => bench.leave(),
    destroy: () => { providerSessions.destroyAll(); bench.leave(); ctx = null; },
  };
}
