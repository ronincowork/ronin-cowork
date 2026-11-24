/* Ronin Setup — the lightweight first-use workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { workbenchView } from './workspace-contract.js';
import { registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { SETUP_SCENES as SCENES } from './setup-journey.js';
import { GARDEN_CANVAS_TYPE, registerGardenCanvas } from './garden-canvas.js';
import { localDocumentLink, productRepositoryHref } from './document-links.js';
import { normalizeGardenCanvasCatalog } from './garden-canvas-model.js';
import { workbenchLaunchUrl } from './workspace.js';
import { onProjects, projectData } from './home.js';
import { createThemeToggle } from './theme-toggle.js';
import { firstUnansweredSetupStep } from './setup-progress.js';
import { createSetupStepsBar, setupStepMarks } from './setup-steps-bar.js';
import { mikaShowHandlers, setupProgressHandlers } from './events.js';
import { subscribe as hear } from './store.js';
import { mikaTab, reportMikaView } from './mika.js';
import { IRASSHAI_INTEGRATIONS_TYPE, IRASSHAI_OPEN_TYPE, createIrasshaiChat, createIrasshaiOpener, irasshaiKey, irasshaiReady, registerIrasshaiIntegrations, registerIrasshaiOpen } from './setup-irasshai.js';

const PROFILE = 'setup';
// The three steps and three pages (setup-journey.js SETUP_SCENES; SETUP_SWEEP.md §7), laid out as the
// owner's prototype: the steps, the step's surface, and the Ask Ronin panel on the right. One Setup on every office.
const ORDER = Object.freeze(SCENES.map((scene) => scene.type));
const ARRANGEMENT = Object.freeze({
  order: Object.freeze(['selector', 'workspace2', 'workspace1']),
  hidden: Object.freeze([]),
  widths: Object.freeze({ selector: 16, workspace2: 52, workspace1: 32 }),
});
/** The Ask Ronin panel's name: the Helpful Assistant, on every step (§7). */
const ASK = 'Ask Ronin';
const GARDEN_CONTENT_URL = '/content/setup-garden.v2.json';

function registerSetupWorkbench() {
  registerSetupSurfaces();
  registerGardenCanvas();
  registerIrasshaiOpen();
  registerIrasshaiIntegrations();
  return WorkspaceKit.workbench.profiles.define(PROFILE, [IRASSHAI_OPEN_TYPE, GARDEN_CANVAS_TYPE, IRASSHAI_INTEGRATIONS_TYPE, ...ORDER]);
}

export function createSetupView() {
  registerSetupWorkbench();
  let ctx = null;
  let bench = null;
  let runtime = null;
  let garden = null;
  let gardenContent = null;
  let paintedSceneId = null;
  let progress = { steps: [], tailscale: '', no_password: false };
  let enterGeneration = 0;
  let sceneOverride = 1;
  const progressListeners = new Set();
  const providerSessions = createProviderSetupSessionMount();
  const themeToggle = createThemeToggle();
  const opener = createIrasshaiOpener({ refresh: () => { bench?.refreshSelector(); if (!irasshai && garden) paintOffer(); }, showChat: () => { bench?.select('workspace1'); garden?.el.scrollIntoView?.({ block: 'start' }); } }); // a phone stacks the workspaces
  // IRASSHAI (setup-irasshai.js): Workspace 1, the Ask Ronin panel, is only her: her chat while her
  // session is live, else the offer of her. The step's how-to is the selector's guide (below). `irasshai` is her session's birth key at the last look ('' not live):
  // a new birth gets a new chat, never the last one's records (KAN-676).
  let irasshai = '';
  let chat = null;
  const offer = document.createElement('div');
  offer.className = 'setup-ask-offer';
  const offerButton = document.createElement('button');
  offerButton.type = 'button';
  offerButton.className = 'wk-btn setup-ask-button';
  offerButton.addEventListener('click', () => opener.press());
  offer.append(offerButton);
  const paintOffer = () => { const card = opener.offer(); offerButton.textContent = card.label === ASK ? t('setup.ask_open', 'Ask Ronin') : card.label; offerButton.title = card.summary; };
  const seatChat = () => {
    if (!garden) return;
    if (irasshai) {
      if (chat && chat.key !== irasshai) { garden.chat(null); chat.dispose(); chat = null; }
      chat ||= Object.assign(createIrasshaiChat(), { key: irasshai });
      garden.chat(chat.el, ASK, chat.toggle);
      chat.show();
    } else {
      if (chat) chat.hide();
      paintOffer();
      garden.chat(offer, ASK, null);
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
  };
  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
  const environment = {
    // Every press is a real setting, made by its own route; Setup's ticks are then read again
    // from the facts (KAN-768). Nothing here records a step.
    onGithubAuthenticated: () => { void readProgress(); },
    onWorkspaceFolderChosen: () => { void readProgress(); },
    onProviderChoice: () => { void readProgress(); },
    setupProgress: () => progress,
    onSetupProgress: (listener) => { progressListeners.add(listener); listener(progress); return () => progressListeners.delete(listener); },
    /** The surfaces draw their Setup header zones here, and only here. */
    setupZones: true,
    readSetupProgress: () => readProgress(),
    nextSetupStep: () => advance(),
    setupRuntime: null,
    onSetupRuntime: (next) => { runtime = next; environment.setupRuntime = next; paint(); },
    runtime: () => runtime || {},
    trackedRoots: () => projectData,
    onTrackedRoots: onProjects,
    navigateToSurface: (type) => openSurface(type),
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    showNewSession: (prompt) => {
      const url = workbenchLaunchUrl({ destination: 'launch', mode: 'overlay', state: {
        selected: 'workspace1', seats: { workspace1: { type: 'launch.agent', detail: { prompt: String(prompt || '') } } },
      } });
      if (url) location.assign(url);
    },
    irasshaiOpen: () => opener.offer(),
    irasshaiPress: () => opener.press(),
    onGardenCanvas: (next) => {
      garden = next;
      seatChat();
      garden.controls.replaceChildren();
      garden.controls.hidden = true;
      paintedSceneId = null;
      selectGarden(activeScene());
    },
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
    if (!entered || m.tab !== mikaTab() || !WorkspaceKit.workbench.surfaces.has(m.surface)) return;
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
  // THE STEP'S GUIDE (owner, 24 Nov; w926): the how-to for the step on screen, at the foot of the
  // selector where the hints were, from the step's canvas (setup-garden.v2.json); its doc links open
  // over the Ask Ronin panel. Setup has no hints: no Agent vocabulary, no session controls.
  const guide = document.createElement('section');
  guide.className = 'setup-step-guide';
  guide.setAttribute('aria-live', 'polite');
  const paintGuide = (canvas) => {
    guide.replaceChildren();
    for (const copy of canvas?.copy || []) {
      if (copy.heading) guide.append(Object.assign(document.createElement('h3'), { className: 'setup-step-guide-heading', textContent: copy.heading }));
      if (copy.body) guide.append(Object.assign(document.createElement('p'), { className: 'setup-step-guide-body', textContent: copy.body }));
    }
    for (const item of canvas?.media || []) {
      const link = Object.assign(document.createElement('button'), { type: 'button', className: 'setup-step-guide-link', textContent: item.label });
      if (item.description) link.title = item.description;
      link.addEventListener('click', () => { void environment.openGardenMedia(item); });
      guide.append(link);
    }
    guide.hidden = !guide.childElementCount;
  };
  const selectGarden = (scene) => {
    if (!gardenContent || !scene || paintedSceneId === scene.id) return false;
    paintGuide(gardenContent.canvases[scene.canvas] || null);
    paintedSceneId = scene.id;
    return true;
  };
  const paint = () => {
    refreshSetupStepsHeader();
    const active = activeScene();
    for (const card of bench?.host.querySelectorAll('[data-workbench-offer-type]') || []) {
      delete card.dataset.sceneRelevant;
      const position = ORDER.indexOf(card.dataset.workbenchOfferType);
      if (position < 0) continue;
      const scene = SCENES[position];
      if (scene?.id === active.id) card.setAttribute('aria-current', 'page');
      else card.removeAttribute('aria-current');
      const complete = Boolean(scene && sceneComplete(scene));
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
  const onProgress = (next) => { acceptProgress(next); };
  setupProgressHandlers.add(onProgress);
  const unhear = [
    hear('sessions', followIrasshai),
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
    hints: false,
    selectorFilter: (type) => type === IRASSHAI_OPEN_TYPE || ORDER.includes(type),
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
  bench.host.querySelector('.wk-workbench-selector')?.append(guide);
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
      // She comes when asked (her Ask Ronin pill, or the panel's offer), or with the office's start (§7).
      void request('/api/setup/progress', { cache: 'no-store' }).then((result) => {
        if (generation !== enterGeneration || !result.ok || !acceptProgress(result.data)) return;
        const first = firstUnansweredSetupStep(progress);
        if (first) open(SCENES.find((scene) => scene.id === first)?.number || 1);
      });
      if (!runtime) {
        void request('/api/setup/runtime', { cache: 'no-store' }).then((result) => {
          runtime = result.ok ? result.data : { providers: [], activated_count: 0 };
          environment.setupRuntime = runtime;
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
