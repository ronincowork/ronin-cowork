/* Ronin Setup — the fourth workbench, composed entirely from registered surfaces. */
import { WorkspaceKit } from './workspace-kit.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { PRESETS_TYPE, createKindsPreference, createPresetsSurface, registerPresetsSurface } from './presets.js';
import { launchPresetPlan, presetLaunchUrl } from './preset-launch.js';
import { openLaunchForm, openTemplateLaunchForm, openWorkspaceStateTab, reserveWorkspaceTab } from './workspace.js';
import { request } from './request.js';
import { loadProjects, onProjects, projectData } from './home.js';
import { t } from './lexicon.js';
import { applyTheme, setCampaignTheme } from './theme.js';
import { campaignById, campaigns, initialCampaignId, loadCampaigns, saveCampaign } from './campaigns.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { readyMika } from './mika-ready.js';
import { toast } from './ui.js';

const PROFILE = 'setup';
const MIKA_SESSION = 'mika_agent';
const TERMINAL_TYPE = 'session.terminal';
// The selector's fixed order. Model providers comes first because it is the first job.
const ORDER = Object.freeze([
  SETUP_SURFACE_TYPES.providers, SETUP_SURFACE_TYPES.register, SETUP_SURFACE_TYPES.roots,
  SETUP_SURFACE_TYPES.services, SETUP_SURFACE_TYPES.gbrain, SETUP_SURFACE_TYPES.launchOwn,
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

export function registerSetupWorkbench() {
  registerSetupSurfaces();
  registerPresetsSurface();
  const { library } = WorkspaceKit.workbench;
  if (!library.has(TERMINAL_TYPE)) library.register({
    type: TERMINAL_TYPE, header: 'terminal', className: 'wk-selector-entity',
    discover: (_tenant, environment) => environment.sessions(),
    create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail),
  });
  return WorkspaceKit.workbench.profiles.define(PROFILE, [PRESETS_TYPE, ...ORDER, TERMINAL_TYPE]);
}

export function createSetupView() {
  registerSetupWorkbench();
  const { createSurface, createAction } = WorkspaceKit.primitives;
  const { createTerminalTileHost } = WorkspaceKit.adapters;
  let ctx = null;
  let bench = null;
  // The native sign-in tile the Model providers surface mounts: the one shared implementation.
  const providerSessions = createProviderSetupSessionMount();
  const mikaSurface = createSurface({ label: 'Mika', className: 'tw-terminal', flush: true, header: false });
  const mikaPool = createWarmTerminalPool({
    createHost: (options) => createTerminalTileHost(options), container: mikaSurface.content, streamCap: 1,
  });
  // APPEARANCE lives at the right of the TOP workbench header (#bar), seated there by
  // the ViewHost while Setup is active, the way the layout map is. A subtle phone /
  // desktop switcher picks WHICH surface is being set; light / dark then writes the
  // Campaign's theme for that surface (desk.theme / desk.theme_mobile — the same fields
  // the Appearance control in the cowork commons saves) and repaints. Neither control
  // touches the workbench: not the workspace count, what is hidden, the layout mode, or
  // a width. The selector header carries no controls, and the phone stack comes from
  // the window's width alone.
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  let surface = COARSE ? 'mobile' : 'desktop';
  const desk = () => campaignById(initialCampaignId())?.desk || {};
  const themeOf = () => (surface === 'mobile' ? desk().theme_mobile : desk().theme) === 'dark' ? 'dark' : 'light';
  const barButton = (className) => {
    const button = document.createElement('button');
    button.className = `bar-toggle ${className}`;
    button.type = 'button';
    return button;
  };
  const surfaceToggle = barButton('setup-surface-toggle');
  const themeToggle = barButton('setup-theme-toggle');
  const paintAppearance = () => {
    const mobile = surface === 'mobile';
    surfaceToggle.textContent = mobile ? '📱' : '🖥';
    surfaceToggle.title = mobile ? t('setup.surface_mobile', 'Setting the phone appearance — click for desktop') : t('setup.surface_desktop', 'Setting the desktop appearance — click for phone');
    surfaceToggle.setAttribute('aria-label', surfaceToggle.title);
    const dark = themeOf() === 'dark';
    themeToggle.textContent = dark ? '☀' : '◐';
    themeToggle.title = dark ? t('setup.use_light', 'Use light appearance') : t('setup.use_dark', 'Use dark appearance');
    themeToggle.setAttribute('aria-label', themeToggle.title);
    themeToggle.setAttribute('aria-pressed', String(dark));
  };
  surfaceToggle.addEventListener('click', () => { surface = surface === 'mobile' ? 'desktop' : 'mobile'; paintAppearance(); });
  themeToggle.addEventListener('click', async () => {
    if (!initialCampaignId()) await loadCampaigns();
    const id = initialCampaignId();
    if (!id) return;
    const field = surface === 'mobile' ? 'theme_mobile' : 'theme';
    const r = await saveCampaign(id, { desk: { [field]: themeOf() === 'dark' ? 'light' : 'dark' } });
    if (r.ok) { setCampaignTheme(desk()); applyTheme(); }
    paintAppearance();
  });
  paintAppearance();
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
    // One runtime truth: the Setup view reads it once at entry and the Model providers
    // surface keeps it current, so a stone's gate never needs a read of its own.
    runtime: () => environment.setupRuntime,
    // THE ONE LIST OF WORKSPACE FOLDERS: the client's project catalog (home.js), every
    // tracked folder, which the Workspace folders surface reloads after each keep or
    // exclude — so a folder kept in workspace 2 is a Where choice in workspace 1 at once.
    trackedRoots: () => (Array.isArray(projectData) ? projectData : []),
    onTrackedRoots: onProjects,
    navigateToSurface: (type, detail = {}) => {
      bench?.place(type, 'workspace2', detail);
      bench?.select('workspace2');
    },
  });
  const mikaHelp = createAction({ label: t('mika.help', 'ミ Help'), size: 'compact' });
  const environment = {
    presets: (workspace) => createPresetsSurface({ environment: presetEnvironment(), workspace }),
    showNewSession: (prompt) => { ctx?.patchViewState('launch', { prompt: String(prompt || '') }); ctx?.navigate('launch'); },
    openLaunchForm: ({ kind, seed = {} } = {}) => openLaunchForm(ctx, { kind, seed }),
    openTemplateLaunchForm: () => openTemplateLaunchForm(ctx),
    setupRuntime: null,
    // What the person uses Ronin for: one persisted preference shared by Register and Presets.
    kinds: createKindsPreference(globalThis.localStorage, (kinds) => request('/api/setup/preferences', { method: 'PATCH', json: { kinds } })),
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    sessions: () => {
      const enabled = Number(environment.setupRuntime?.activated_count || 0) > 0;
      mikaHelp.el.disabled = !enabled;
      return enabled ? [{
        key: MIKA_SESSION, label: 'Mika', summary: t('mika.setup_card', 'Your Ronin welcome guide and general helper.'),
        action: () => { void ensureAndPlaceMika(); },
        onPointerEnter: () => { void ensureMika(); },
      }] : [];
    },
    terminal: (_workspace, detail) => ({ el: mikaSurface.el, show: () => {
      mikaPool.sync([MIKA_SESSION]);
      mikaPool.show(detail.key || MIKA_SESSION, false);
    } }),
  };
  const operational = () => Number(environment.setupRuntime?.activated_count || 0) > 0;
  const ensureMika = async () => operational() ? readyMika('help') : null;
  const ensureAndPlaceMika = async () => {
    if (!operational()) return false;
    const held = bench?.typeAt('workspace2');
    if (held === TERMINAL_TYPE && bench.resourceAt('workspace2') !== MIKA_SESSION) {
      toast(t('mika.workspace_two_busy', 'Workspace 2 is in use. Move or close that work before opening Mika.'), false);
      return false;
    }
    const ready = await ensureMika();
    if (!ready || (!ready.ok && ready.data?.state !== 'action_required')) {
      toast(t('mika.start_refused', 'Mika couldn’t start. Try again.'), false);
      return false;
    }
    mikaPool.sync([MIKA_SESSION]);
    return bench?.place(TERMINAL_TYPE, 'workspace2', { key: MIKA_SESSION }) || false;
  };
  // viewportMode was the retired presentation toggle's memory; writing undefined drops
  // it from a stored visit so nobody stays in the stack it forced.
  const save = () => ctx?.patchViewState('setup', { ...bench.snapshot(), viewportMode: undefined });
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
    actions: [mikaHelp],
    onStateChange: save,
    onPlacement: save,
  });
  const selector = bench.host.querySelector('.wk-workbench-selector');
  const selectorCards = selector?.querySelector('.wk-workbench-selector-cards');
  const mikaPanel = document.createElement('section');
  mikaPanel.className = 'setup-mika-panel';
  mikaPanel.hidden = true;
  const mikaBar = document.createElement('header');
  mikaBar.className = 'setup-mika-bar';
  const mikaTitle = document.createElement('b'); mikaTitle.textContent = 'Mika';
  const closeMika = createAction({ label: t('mika.close', 'Close'), size: 'compact' });
  mikaBar.append(mikaTitle, closeMika.el);
  const greeting = document.createElement('p'); greeting.textContent = t('mika.hello', 'Hi, I’m Mika. How can I help you?');
  const mikaStage = document.createElement('div'); mikaStage.className = 'setup-mika-stage';
  const loading = document.createElement('p'); loading.className = 'setup-mika-loading'; loading.textContent = t('mika.starting', '人 Starting Mika…');
  mikaPanel.append(mikaBar, greeting, mikaStage);
  selector?.append(mikaPanel);
  const closeHelp = () => {
    mikaPool.releaseBorrow(MIKA_SESSION);
    mikaPanel.hidden = true;
    if (selectorCards) selectorCards.hidden = false;
    mikaHelp.el.focus();
  };
  closeMika.el.addEventListener('click', closeHelp);
  mikaHelp.el.addEventListener('click', async () => {
    if (!operational()) return;
    if (selectorCards) selectorCards.hidden = true;
    mikaPanel.hidden = false;
    mikaStage.replaceChildren(loading);
    const ready = await ensureMika();
    if (!ready || (!ready.ok && ready.data?.state !== 'action_required')) {
      loading.textContent = t('mika.start_refused', 'Mika couldn’t start. Try again.');
      return;
    }
    mikaPool.sync([MIKA_SESSION]);
    const host = mikaPool.borrow(MIKA_SESSION);
    if (host) mikaStage.replaceChildren(host);
  });
  return {
    el: bench.host,
    glyph: '人',
    hideFeedback: true,
    hideShapeControl: true,
    barActions: [surfaceToggle, themeToggle],
    title: () => t('setup.title', 'Ronin Setup'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      if (!environment.setupRuntime) {
        const runtime = await request('/api/setup/runtime', { cache: 'no-store' });
        environment.setupRuntime = runtime.ok ? runtime.data : { providers: [] };
        if (runtime.ok) environment.kinds.hydrate(runtime.data?.preferences?.kinds || []);
      }
      // The catalog Presets' Where reads; the runtime read above has just seeded the pair.
      if (!Array.isArray(projectData)) await loadProjects();
      // Provider cards are catalog discovery, not a client fallback list. Publish the
      // shared runtime truth before restoring a remembered surface into workspace 2.
      bench.refreshSelector();
      mikaHelp.el.disabled = !operational();
      const stored = context.viewState('setup') || {};
      // The Campaign's record is not read at boot on this page; fetch it once so the
      // light/dark icon shows the configured theme, not a guess.
      if (!campaigns().length) void loadCampaigns().then(paintAppearance);
      paintAppearance();
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
    leave: () => bench.leave(),
    destroy: () => { providerSessions.destroyAll(); mikaPool.destroyAll(); bench.leave(); ctx = null; },
  };
}
