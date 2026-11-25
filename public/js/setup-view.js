/* Ronin Setup — the lightweight first-use workbench. */
import { WorkspaceKit } from './workspace-kit.js';
import { workbenchView } from './workspace-contract.js';
import { registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { SETUP_SCENES as SCENES } from './setup-journey.js';
import { GARDEN_CANVAS_TYPE, paintCopy, paintMedia, registerGardenCanvas } from './garden-canvas.js';
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
import { IRASSHAI, irasshaiLive, IRASSHAI_INTEGRATIONS_TYPE, createIrasshaiChat, createIrasshaiOpener, irasshaiKey, irasshaiReady, registerIrasshaiIntegrations } from './setup-irasshai.js';

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
  registerIrasshaiIntegrations();
  return WorkspaceKit.workbench.profiles.define(PROFILE, [GARDEN_CANVAS_TYPE, IRASSHAI_INTEGRATIONS_TYPE, ...ORDER]);
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
  const offerLine = document.createElement('p');
  offerLine.className = 'setup-ask-line';
  offerLine.textContent = t('setup.ask_line', 'The Helpful Assistant answers your questions about Ronin, and can do each step with you.');
  const offerAction = WorkspaceKit.primitives.createAction({ label: ASK, kind: 'primary', action: () => opener.press() });
  const offerButton = offerAction.el ?? offerAction;
  offer.append(offerLine, offerButton);
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
    closeTour: () => open(stepBeforeTour),
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
  // Thin (owner, 24 Nov): the step's title, the questions people ask about it, each one line that
  // opens to its answer, and its one guide. The answers are the Tour's own (docs/getting-started/tour.md,
  // its Questions), read once; a question the Tour no longer has is left out.
  let answers = null;
  const readAnswers = async () => {
    if (answers) return answers;
    const result = await request(`/api/file?${new URLSearchParams({ path: 'docs/getting-started/tour.md', product: '1' })}`);
    const section = result.ok ? String(result.data.text || '').split(/^## Questions\s*$/m)[1] || '' : '';
    answers = new Map(section.split(/\n\s*\n/).flatMap((para) => {
      const found = /^\*\*(.+?)\*\*\s+([\s\S]+)$/.exec(para.trim());
      if (!found) return [];
      const plain = found[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
      return [[found[1].trim(), plain]];
    }));
    return answers;
  };
  const paintGuide = (canvas) => {
    guide.replaceChildren();
    if (canvas?.copy?.length) { const copy = document.createElement('div'); copy.className = 'garden-region garden-region-copy'; paintCopy(copy, canvas.copy); guide.append(copy); }
    if (canvas?.asks?.length) {
      const asks = document.createElement('div');
      asks.className = 'setup-step-asks';
      guide.append(asks);
      void readAnswers().then((known) => {
        for (const ask of canvas.asks) {
          if (!known.has(ask)) continue;
          const row = document.createElement('details');
          row.className = 'setup-step-ask';
          const summary = document.createElement('summary');
          summary.textContent = ask;
          const answer = document.createElement('p');
          answer.textContent = known.get(ask);
          row.append(summary, answer);
          asks.append(row);
        }
      });
    }
    if (canvas?.media?.length) { const media = document.createElement('div'); media.className = 'garden-region garden-region-media'; paintMedia(media, canvas.media, (item) => { void environment.openGardenMedia(item); }); guide.append(media); }
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
      // THE WALKTHROUGH (owner, 24 Nov): the steps run down the column as the prototype's run across
      // it: a numbered disc (✓ once ticked) joined to the next by a line, the step's name, its one line.
      card.classList.add('setup-step-card');
      const heading = card.querySelector('.wk-card-heading');
      let disc = heading?.querySelector('.setup-step-disc');
      if (heading && !disc) { disc = document.createElement('span'); disc.className = 'setup-step-disc'; disc.setAttribute('aria-hidden', 'true'); heading.prepend(disc); }
      if (disc) disc.textContent = complete ? '✓' : String(scene.number);
      let line = card.querySelector('.setup-step-line');
      if (!line) { line = document.createElement('p'); line.className = 'setup-step-line'; heading?.after(line); }
      line.textContent = t(`setup.step_line_${scene.id}`, scene.line);
    }
    paintNext();
  };
  // THE WAY ON (owner, 25 Nov): one small Next in the step surface's header, at its right, where a close
  // dash would be (Setup's workbench has none: `dismissible: false`): "Next: <the next step>". Drawn here
  // and by no surface. Steps are not gates, so it always moves; on Workspace with none it makes Ronin Lab
  // (a real setting, from its one seed) and then moves on. Never on the Tour, which has its own Back and Next.
  const nextFoot = document.createElement('div');
  nextFoot.className = 'setup-next';
  const nextNote = document.createElement('span');
  nextNote.className = 'setup-next-note';
  const nextButton = WorkspaceKit.primitives.createAction({ size: 'compact', className: 'setup-next-go', action: async () => {
    if (!labFirst()) { advance(); return; }
    nextButton.setDisabled(true);
    nextNote.textContent = t('setup.next_making_lab', 'Making Ronin Lab…');
    const seed = await request('/content/starter-workspaces.json');
    const made = await request('/api/workspaces/ronin_lab', { method: 'PUT', json: { title: 'Ronin Lab', objective: String(seed.data?.ronin_lab?.objective || ''), kind: 'open', repos: [], folders: [], integrations: [] } });
    nextButton.setDisabled(false);
    if (!made.ok) { nextNote.textContent = made.message; return; }
    await readProgress();
    advance();
  } });
  nextFoot.append(nextNote, nextButton.el);
  const labFirst = () => activeScene().id === 'workspace' && !sceneComplete(activeScene());
  const paintNext = () => {
    const next = SCENES[activeScene().number];
    const slot = bench?.host.querySelector('.wk-workbench-cell[data-workspace="workspace2"] > * > .wk-surface-header .wk-surface-header-actions');
    if (!next || activeScene().type === TOUR || !slot) { nextFoot.remove(); return; }
    if (nextFoot.parentNode !== slot) slot.append(nextFoot); // a placement draws a new surface, and with it a new header
    if (nextButton.el.disabled) return;
    nextButton.el.textContent = t('setup.next', 'Next: {step}', { step: next.label });
    nextNote.textContent = labFirst() ? t('setup.next_lab', 'You\'ll work in Ronin Lab') : '';
  };
  // LEAVING A STEP (owner, 25 Nov; w984): the server holds a changed switch beside each tick, pushed in
  // setup-progress. Leaving a step (selector, Next, Tour) whose switch is on asks the server to tell her
  // what changed, once; off, a move tells her nothing.
  let shownStep = null;
  const leaving = (scene) => {
    const left = shownStep; shownStep = scene.id;
    if (!left || left === scene.id || !irasshaiLive()) return;
    if (!progress?.steps?.find((step) => step.id === left)?.changed) return;
    void request('/api/setup/left', { method: 'POST', json: { step: left, to: scene.label, target: IRASSHAI } });
  };
  const TOUR = 'setup.tour';
  const TOUR_NUMBER = SCENES.find((scene) => scene.type === TOUR)?.number;
  let stepBeforeTour = 1;
  const spread = (on) => {
    if (!bench || bench.arrangement.state().hidden.includes('workspace1') === on) return;
    bench.arrangement.toggle('workspace1');
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
    density: false,
    selectorFilter: (type) => ORDER.includes(type),
    dismissible: false,
    onSelectorRefresh: paint,
    onStateChange: save,
    onPlacement: (snapshot, change) => {
      const type = typeof snapshot?.seats?.workspace2 === 'string' ? snapshot.seats.workspace2 : snapshot?.seats?.workspace2?.type;
      const scene = SCENES.find((candidate) => candidate.type === type);
      // THE TOUR TAKES BOTH WORK SURFACES (owner, 24 Nov): while it is in Workspace 2, Workspace 1 (the
      // Ask Ronin panel) is hidden; closing it (its − or its last Close) brings back the step before it.
      spread(type === TOUR);
      if (!scene && change?.dismissed === 'workspace2' && sceneOverride === TOUR_NUMBER) { open(stepBeforeTour); return; }
      if (scene && scene.type !== TOUR) stepBeforeTour = scene.number;
      if (scene) leaving(scene);
      if (scene) {
        sceneOverride = scene.number;
        selectGarden(scene);
        paint();
      }
      save();
    },
  });
  bench.host.querySelector('.wk-workbench-selector')?.append(guide);
  // The step marks head the selector (owner, 24 Nov): its header was empty. Setup has no density toggle.
  bench.selectorHeader?.title.replaceChildren(setupStepsHeader);
  bench.host.querySelector('.wk-workbench-selector-cards')?.addEventListener('click', () => { queueMicrotask(() => bench.select('workspace2')); });
  followIrasshai();

  return {
    el: bench.host,
    glyph: '人',
    ...workbenchView('setup', { header: { ram: false, feedback: false, actions: [themeToggle] } }),
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
      // She comes when asked (the Ask Ronin panel's button), or with the office's start (§7).
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
