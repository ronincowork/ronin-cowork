/* Ronin Setup — the lightweight first-use workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { workbenchView } from './workspace-contract.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { SETUP_SCENES } from './setup-journey.js';
import { GARDEN_CANVAS_TYPE, registerGardenCanvas } from './garden-canvas.js';
import { localDocumentLink, productRepositoryHref } from './document-links.js';
import { normalizeGardenCanvasCatalog } from './garden-canvas-model.js';
import { PRESETS_TYPE, createKindsPreference, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { reserveWorkspaceTab, workbenchLaunchUrl } from './workspace.js';
import { onProjects, projectData } from './home.js';
import { createThemeToggle } from './theme-toggle.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';
import { firstUnansweredSetupStep } from './setup-progress.js';
import { createSetupStepsBar, setupStepMarks } from './setup-steps-bar.js';
import { mikaShowHandlers, setupProgressHandlers } from './events.js';
import { subscribe as hear } from './store.js';
import { HOSTED } from './hosted.js';
import { mikaTab, reportMikaView } from './mika.js';
import { IRASSHAI_INTEGRATIONS_TYPE, IRASSHAI_NAME, IRASSHAI_STEP_TYPE, IRASSHAI_OPEN_TYPE, askIrasshai, createIrasshaiChat, createIrasshaiOpener, irasshaiKey, irasshaiReady, irasshaiOrder, irasshaiSteps, registerIrasshaiIntegrations, registerIrasshaiOpen, registerIrasshaiSteps, stepOpens, takeStepLine } from './setup-irasshai.js';

const PROFILE = 'setup';
// Release toggles: unfinished programs stay out of Setup without changing the workbench.
const SETUP_FEATURES = Object.freeze({ bounty: false });
// A hosted office has no registration, password or installations: they are the office_park's
// and the Business Lounge's (hosted.js), as Settings leaves them out.
const NOT_HOSTED = Object.freeze(['register', 'installations', 'password']);
const SCENES = Object.freeze(SETUP_SCENES
  .filter((scene) => SETUP_FEATURES.bounty || scene.type !== 'setup.bounty')
  .filter((scene) => !HOSTED || !NOT_HOSTED.includes(scene.id))
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
  registerIrasshaiOpen();
  registerIrasshaiSteps();
  registerIrasshaiIntegrations();
  return WorkspaceKit.workbench.profiles.define(PROFILE, [IRASSHAI_OPEN_TYPE, GARDEN_CANVAS_TYPE, PRESETS_TYPE, IRASSHAI_STEP_TYPE, IRASSHAI_INTEGRATIONS_TYPE, ...ORDER]);
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
  let progress = { steps: [], tailscale: '', no_password: false };
  let enterGeneration = 0;
  let sceneOverride = 1;
  const progressListeners = new Set();
  const providerSessions = createProviderSetupSessionMount();
  const kinds = createKindsPreference(globalThis.localStorage, (next) => request('/api/setup/preferences', { method: 'PATCH', json: { kinds: next } }));
  const themeToggle = createThemeToggle();
  const opener = createIrasshaiOpener({ refresh: () => bench?.refreshSelector(), showChat: () => { bench?.select('workspace1'); garden?.el.scrollIntoView?.({ block: 'start' }); } }); // a phone stacks the workspaces
  // IRASSHAI (setup-irasshai.js): while her session is live, Assist is her chat and the selector
  // her epic's steps. `irasshai` is her session's birth key at the last look ('' not live): a new
  // birth gets a new chat, never the last one's records (KAN-676).
  let irasshai = '';
  let chat = null;
  let epics = [];
  let epicItems = [];
  const steps = () => irasshaiSteps(epics, epicItems, irasshaiOrder(() => bench?.refreshSelector()));
  const seatChat = () => {
    if (!garden) return;
    if (irasshai) {
      if (chat && chat.key !== irasshai) { garden.chat(null); chat.dispose(); chat = null; }
      chat ||= Object.assign(createIrasshaiChat(), { key: irasshai });
      garden.chat(chat.el, IRASSHAI_NAME, chat.toggle);
      chat.show();
    } else if (chat) {
      garden.chat(null);
      chat.hide();
    }
  };
  let ready = '';
  const followIrasshai = () => {
    const live = irasshaiKey();
    const mark = irasshaiReady();
    if (mark !== ready) { ready = mark; if (chat && live === irasshai) chat.reread(); }
    if (live !== irasshai) {
      if (live && !irasshai) opener.arrived();
      irasshai = live;
      seatChat();
      refreshSetupStepsHeader();
    }
    bench?.refreshSelector();
  };
  const setupStepsHeader = document.createElement('span');
  setupStepsHeader.className = 'setup-steps-header';
  const refreshSetupStepsHeader = () => {
    const marks = setupStepMarks(progress);
    const answered = marks.filter((step) => step.answered).length;
    const next = marks.find((step) => step.next);
    const reading = document.createElement('span');
    reading.className = 'ui-sr';
    reading.textContent = next
      ? `${answered} of ${marks.length} Setup steps complete. Next: ${next.label}.`
      : 'Setup completed.';
    setupStepsHeader.replaceChildren(createSetupStepsBar(progress), reading);
    setupStepsHeader.hidden = Boolean(irasshai); // her steps are the selector's; the five marks are not hers
  };
  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
  const environment = {
    // Every press is a real setting, made by its own route; Setup's ticks are then read again
    // from the facts (KAN-768). Nothing here records a step.
    onGithubAuthenticated: () => { void readProgress(); },
    onWorkspaceFolderChosen: () => { void readProgress(); },
    onInstallationsState: () => {},
    onInstallationChoice: () => { void readProgress(); },
    onPasswordChoice: () => { void readProgress(); },
    onRegistrationChoice: () => { void readProgress(); },
    onProviderChoice: () => { void readProgress(); },
    setupProgress: () => progress,
    onSetupProgress: (listener) => { progressListeners.add(listener); listener(progress); return () => progressListeners.delete(listener); },
    /** The surfaces draw their Setup header zones here, and only here. */
    setupZones: true,
    readSetupProgress: () => readProgress(),
    nextSetupStep: () => advance(),
    setupRuntime: null,
    onSetupRuntime: (next) => { runtime = next; environment.setupRuntime = next; paint(); },
    kinds,
    runtime: () => runtime || {},
    trackedRoots: () => projectData,
    onTrackedRoots: onProjects,
    navigateToSurface: (type) => openSurface(type),
    launch: launchPresetPlan,
    launchUrl: presetLaunchUrl,
    reserveLaunchTab: reserveWorkspaceTab,
    setPathNote: (path_note) => request('/api/setup/preferences', { method: 'PATCH', json: { path_note } }),
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    showNewSession: (prompt) => {
      const url = workbenchLaunchUrl({ destination: 'launch', mode: 'overlay', state: {
        selected: 'workspace1', seats: { workspace1: { type: 'launch.agent', detail: { prompt: String(prompt || '') } } },
      } });
      if (url) location.assign(url);
    },
    irasshaiSteps: () => steps(),
    irasshaiOpen: () => opener.offer(),
    irasshaiPress: () => opener.press(),
    // Not done: one line to her, and she opens its surface (KAN-692). Done: nothing to her; its surface opens (KAN-699).
    takeIrasshaiStep: (step) => {
      if (!step.done) return void chat?.say(takeStepLine(step));
      const opens = stepOpens(step);
      if (opens && WorkspaceKit.workbench.library.has(opens)) bench?.place(opens, 'workspace2');
    },
    onGardenCanvas: (next) => {
      garden = next;
      seatChat();
      garden.controls.replaceChildren();
      garden.controls.hidden = true;
      paintedSceneId = null;
      selectGarden(activeScene());
    },
    onProviderSurface: (next) => { providerSurface = next; },
    openGardenMedia: async (item) => {
      if (!garden) return;
      if (item.kind !== 'doc') { garden.showMedia({ label: item.label, kind: item.kind, src: item.src }); return; }
      const openDocument = async (path, label, fragment = '') => {
        const query = new URLSearchParams({ path });
        if (item.root) query.set('root', item.root);
        else query.set('product', '1');
        const result = await request('/api/file?' + query.toString());
        garden.showMedia({ label, kind: 'doc', text: result.ok ? result.data.text || '' : result.message,
          fragment, resolveHref: item.root ? undefined : (href) => productRepositoryHref(path, href), onLink: (href) => {
            const linked = localDocumentLink(path, href, !item.root);
            if (!linked) return false;
            if (linked.path === path && linked.fragment) {
              garden.scrollMediaTo?.(linked.fragment);
            } else {
              void openDocument(linked.path, linked.path.split('/').pop(), linked.fragment);
            }
            return true;
          } });
      };
      await openDocument(item.path, item.label);
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
  const acceptProgress = (next) => {
    if (!next || !Array.isArray(next.steps)) return false;
    progress = next; paint(); for (const listener of progressListeners) listener(progress); return true;
  };
  const readProgress = async () => {
    const result = await request('/api/setup/progress', { cache: 'no-store' });
    return result.ok && acceptProgress(result.data);
  };
  /* SHOW (KAN-692): Setup reports this tab's view, as the door workbenches do, and places what
     `show <tab> <surface>` names. Workspace 1 is reported selected: it holds Assist, her chat, which
     a `show` must never replace, so what she opens lands in Workspace 2. */
  let entered = false;
  const report = () => {
    if (!entered || !bench) return;
    const shown = (workspace) => bench.typeAt(workspace) || 'empty';
    void reportMikaView({ workbench: 'setup', team: '', selected: 'workspace1', reading: '', workspaces: Object.fromEntries(bench.visibleIds().map((workspace) => [workspace, shown(workspace)])) });
  };
  const onShow = (m) => {
    if (!entered || m.tab !== mikaTab() || !WorkspaceKit.workbench.library.has(m.surface)) return;
    if (bench.visibleIds().some((workspace) => bench.typeAt(workspace) === m.surface)) return; // on screen already: left where it is (KAN-712)
    bench.place(m.surface, m.workspace); // not selected: the person stays in her chat
  };
  mikaShowHandlers.add(onShow);
  const save = () => { ctx?.patchViewState('setup', { ...bench.snapshot(), sceneOverride }); report(); };
  const defaultScene = () => SCENES.find((scene) => !sceneComplete(scene)) || SCENES[SCENES.length - 1];
  const sceneAt = (number) => SCENES[Number(number) - 1] || defaultScene();
  const activeScene = () => sceneAt(sceneOverride);
  const sceneComplete = (scene) => {
    return Boolean(scene?.id && setupStepMarks(progress).find((step) => step.id === scene.id)?.answered);
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
    for (const card of bench?.host.querySelectorAll('[data-workbench-offer-type]') || []) {
      delete card.dataset.sceneRelevant;
      const position = ORDER.indexOf(card.dataset.workbenchOfferType);
      if (position < 0) continue; // her steps carry their own marks
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
  const onProgress = (next) => { acceptProgress(next); };
  setupProgressHandlers.add(onProgress);
  const unhear = [
    hear('sessions', followIrasshai),
    hear('epics', (next) => { epics = Array.isArray(next) ? next : []; if (irasshai) bench?.refreshSelector(); }),
    hear('epicItems', (next) => { epicItems = Array.isArray(next) ? next : []; if (irasshai) bench?.refreshSelector(); }),
    hear('home', () => { if (irasshai) { chat?.stance(); report(); } }), // each of her turns keeps the view fresh for `show`
  ];

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
    selectorFilter: (type) => type === IRASSHAI_OPEN_TYPE || (irasshai ? type === IRASSHAI_STEP_TYPE : ORDER.includes(type)),
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
  bench.host.querySelector('.wk-workbench-selector-cards')?.addEventListener('click', (event) => { if (!event.target.closest?.('.setup-irasshai-card')) queueMicrotask(() => bench.select('workspace2')); });
  followIrasshai();

  return {
    el: bench.host,
    glyph: '人',
    ...workbenchView('setup', { header: { ram: false, feedback: false, leading: [setupStepsHeader], actions: [themeToggle] } }),
    title: () => 'Ronin Setup',
    place: () => t('setup.short_title', 'Setup'), // the crumb: Home • Setup (owner, 2026-10-24)
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      const generation = ++enterGeneration;
      ctx = context;
      const { state: entry } = context.workbenchEntry({
        count: 2, selected: 'workspace1', arrangement: ARRANGEMENT,
        seats: { workspace1: GARDEN_CANVAS_TYPE, workspace2: SCENES[0].type },
      });
      sceneOverride = Number(entry.sceneOverride) || 1;
      bench.enter({ ...entry, count: 2, arrangement: { ...ARRANGEMENT, widths: entry.arrangement?.widths || ARRANGEMENT.widths } });
      bench.place(GARDEN_CANVAS_TYPE, 'workspace1');
      paint();
      open(sceneOverride);
      seatChat();
      entered = true; report();
      // A hosted office's Setup is Irasshai's: opening it asks for her (shown live, else a fresh launch).
      // Elsewhere she comes on her selector entry (KAN-694).
      if (HOSTED) void askIrasshai();
      void request('/api/setup/progress', { cache: 'no-store' }).then((result) => {
        if (generation !== enterGeneration || !result.ok || !acceptProgress(result.data)) return;
        const first = firstUnansweredSetupStep(progress);
        if (first) open(SCENES.find((scene) => scene.id === first)?.number || 1);
      });
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
    leave: () => { entered = false; enterGeneration += 1; chat?.hide(); bench.leave(); },
    destroy: () => { entered = false; mikaShowHandlers.delete(onShow); enterGeneration += 1; setupProgressHandlers.delete(onProgress); for (const stop of unhear) stop(); chat?.dispose(); providerSessions.destroyAll(); bench.leave(); ctx = null; },
  };
}
