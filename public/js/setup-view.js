/* Ronin Setup — the lightweight first-use workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { workbenchView } from './workspace-contract.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { request } from './request.js';
import { SETUP_SCENES } from './setup-journey.js';
import { GARDEN_CANVAS_TYPE, registerGardenCanvas } from './garden-canvas.js';
import { normalizeGardenCanvasCatalog } from './garden-canvas-model.js';
import { PRESETS_TYPE, createKindsPreference, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { reserveWorkspaceTab, workbenchLaunchUrl } from './workspace.js';
import { onProjects, projectData } from './home.js';
import { createThemeToggle } from './theme-toggle.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';
import { campaignById, loadCampaigns, normalizeSelection, saveCampaign } from './campaigns.js';
import { firstUnansweredSetupStep, setupAnswers as readSetupAnswers } from './setup-progress.js';
import { createSetupStepsBar, setupStepMarks } from './setup-steps-bar.js';
import { t } from './lexicon.js';
import { toast } from './ui.js';

const PROFILE = 'setup';
// Release toggles: unfinished programs stay out of Setup without changing the workbench.
export const SETUP_FEATURES = Object.freeze({ bounty: false });
const SCENES = Object.freeze(SETUP_SCENES
  .filter((scene) => SETUP_FEATURES.bounty || scene.type !== 'setup.bounty')
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
  let answers = {};
  let savingAnswer = false;
  let enterGeneration = 0;
  let sceneOverride = 1;
  let workspaceFolderOrigin = null;
  const providerSessions = createProviderSetupSessionMount();
  const kinds = createKindsPreference(globalThis.localStorage, (next) => request('/api/setup/preferences', { method: 'PATCH', json: { kinds: next } }));
  const nextAction = WorkspaceKit.primitives.createAction({ label: 'Next', launch: true, action: () => advance() });
  const notNowAction = WorkspaceKit.primitives.createAction({ label: t('setup.not_now', 'Not now'), action: () => { void answerActive('not_now', true); } });
  const themeToggle = createThemeToggle();
  const setupStepsHeader = document.createElement('span');
  setupStepsHeader.className = 'setup-steps-header';
  const refreshSetupStepsHeader = () => {
    const campaign = selectedCampaign();
    const marks = setupStepMarks(campaign);
    const answered = marks.filter((step) => step.answered).length;
    const next = marks.find((step) => step.next);
    const reading = document.createElement('span');
    reading.className = 'ui-sr';
    reading.textContent = next
      ? `${answered} of ${marks.length} Setup steps complete. Next: ${next.label}.`
      : 'Setup completed.';
    setupStepsHeader.replaceChildren(createSetupStepsBar(campaign), reading);
  };
  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
  const environment = {
    onGithubAuthenticated: () => {},
    onWorkspaceFolderChosen: () => { void answerStep('workspace', 'acted'); },
    onInstallationsState: () => {},
    onInstallationChoice: () => { void answerStep('installations', 'acted'); },
    onPasswordChoice: (required) => { void answerStep('password', required ? 'acted' : 'not_now'); },
    onRegistrationChoice: (answer) => { void answerStep('register', answer); },
    onProviderChoice: (answer) => { void answerStep('provider', answer); },
    setupRuntime: null,
    onSetupRuntime: (next) => { runtime = next; environment.setupRuntime = next; paint(); },
    kinds,
    runtime: () => runtime || {},
    trackedRoots: () => projectData,
    onTrackedRoots: onProjects,
    navigateToSurface: (type, detail = {}) => {
      workspaceFolderOrigin = type === SETUP_SURFACE_TYPES.roots ? detail.origin || null : null;
      return openSurface(type);
    },
    workspaceFolderOrigin: () => workspaceFolderOrigin,
    returnFromWorkspaceFolders: () => {
      const origin = workspaceFolderOrigin;
      if (origin?.kind !== 'preset') return false;
      workspaceFolderOrigin = null;
      bench.place(PRESETS_TYPE, origin.workspace || 'workspace2', { preset: origin.preset });
      bench.select(origin.workspace || 'workspace2');
      return true;
    },
    launch: launchPresetPlan,
    launchUrl: presetLaunchUrl,
    reserveLaunchTab: reserveWorkspaceTab,
    setPathNote: (path_note) => request('/api/setup/preferences', { method: 'PATCH', json: { path_note } }),
    setIdentityChoice: (identity_choice) => request('/api/setup/preferences', { method: 'PATCH', json: { identity_choice } }),
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    showNewSession: (prompt) => {
      const url = workbenchLaunchUrl({ destination: 'launch', mode: 'overlay', state: {
        selected: 'workspace1', seats: { workspace1: { type: 'launch.agent', detail: { prompt: String(prompt || '') } } },
      } });
      if (url) location.assign(url);
    },
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
      openSurface(action);
    },
  };
  const selectedCampaign = () => campaignById(normalizeSelection(ctx?.state?.campaignSelection).primary_campaign_id);
  const answerStep = async (step, answer, move = false) => {
    const campaign = selectedCampaign();
    if (!campaign || savingAnswer || answers[step]) return false;
    savingAnswer = true;
    const result = await saveCampaign(campaign.id, { config: { setup: { answers: { ...answers, [step]: answer } } } });
    savingAnswer = false;
    if (!result.ok) {
      toast(result.message || 'Setup could not save that choice. Try again.', false);
      return false;
    }
    answers = readSetupAnswers(selectedCampaign());
    paint();
    if (move) advance();
    return true;
  };
  const answerActive = (answer, move = false) => answerStep(activeScene()?.id, answer, move);
  const save = () => ctx?.patchViewState('setup', { ...bench.snapshot(), sceneOverride });
  const defaultScene = () => SCENES.find((scene) => !sceneComplete(scene)) || SCENES[SCENES.length - 1];
  const sceneAt = (number) => SCENES[Number(number) - 1] || defaultScene();
  const activeScene = () => sceneAt(sceneOverride);
  const sceneComplete = (scene) => {
    return Boolean(scene?.id && answers[scene.id]);
  };
  const seatNext = (visible) => {
    if (!visible) { nextAction.el.remove(); return; }
    const actions = bench?.host.querySelector('[data-workspace="workspace2"] > .wk-surface > .wk-surface-header .wk-surface-header-actions');
    if (!actions) return;
    actions.prepend(nextAction.el);
  };
  const seatNotNow = (visible) => {
    if (!visible) { notNowAction.el.remove(); return; }
    const actions = bench?.host.querySelector('[data-workspace="workspace2"] > .wk-surface > .wk-surface-header .wk-surface-header-actions');
    if (!actions) return;
    notNowAction.el.textContent = activeScene()?.id === 'workspace'
      ? t('setup.fine_for_now', 'Fine for now') : t('setup.not_now', 'Not now');
    actions.prepend(notNowAction.el);
  };
  const selectGarden = (scene) => {
    if (!garden || !gardenContent || !scene || paintedSceneId === scene.id) return false;
    garden.paint(gardenContent.canvases[scene.canvas] || null);
    paintedSceneId = scene.id;
    return true;
  };
  const paint = () => {
    refreshSetupStepsHeader();
    const active = activeScene();
    const canAdvance = active.number < SCENES.length && sceneComplete(active);
    seatNext(canAdvance);
    seatNotNow(['provider', 'register', 'workspace', 'installations', 'password'].includes(active.id) && !sceneComplete(active));
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
  function openSurface(type) {
    const scene = SCENES.find((candidate) => candidate.type === type);
    if (!scene) return false;
    sceneOverride = scene.number;
    open(scene.number);
    return true;
  }
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
  bench.host.querySelector('.wk-workbench-selector-cards')?.addEventListener('click', () => queueMicrotask(() => bench.select('workspace2')));

  return {
    el: bench.host,
    glyph: '人',
    ...workbenchView('setup', { header: { ram: false, feedback: false, leading: [setupStepsHeader], actions: [themeToggle] } }),
    title: () => 'Ronin Setup',
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      const generation = ++enterGeneration;
      ctx = context;
      const { state: entry } = context.workbenchEntry();
      await loadCampaigns();
      if (generation !== enterGeneration) return;
      answers = readSetupAnswers(selectedCampaign());
      const first = firstUnansweredSetupStep(selectedCampaign());
      sceneOverride = first
        ? (SCENES.find((scene) => scene.id === first)?.number || 1)
        : Number(entry.sceneOverride) || 1;
      bench.enter({ ...entry, count: 2, arrangement: { ...ARRANGEMENT, widths: entry.arrangement?.widths || ARRANGEMENT.widths } });
      bench.place(GARDEN_CANVAS_TYPE, 'workspace1');
      paint();
      open(sceneOverride);
      if (!runtime) {
        void request('/api/setup/runtime', { cache: 'no-store' }).then((result) => {
          runtime = result.ok ? result.data : { providers: [], activated_count: 0 };
          environment.setupRuntime = runtime;
          environment.kinds.hydrate(runtime?.preferences?.kinds || []);
          paint();
        });
      }
      if (!gardenContent) {
        void request(GARDEN_CONTENT_URL).then((result) => {
          gardenContent = normalizeGardenCanvasCatalog(result.ok ? result.data : { schema_version: 2, canvases: {} });
          paintedSceneId = null;
          selectGarden(activeScene());
        });
      }
    },
    leave: () => { enterGeneration += 1; bench.leave(); },
    destroy: () => { enterGeneration += 1; providerSessions.destroyAll(); bench.leave(); ctx = null; },
  };
}
