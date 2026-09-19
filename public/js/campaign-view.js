/* part of the ronin-cowork client — see js/README.md */
/** Campaign is a Workbench tenant: it supplies context, never frame or placement code. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { MULTIPLE_CAMPAIGNS_ENABLED, campaignById, campaignOf, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createNewCampaignSurface } from './campaign-surfaces.js';
import { createDeskProfileSurface, skinWord } from './campaign-desk.js';
import { createAgentDefaultsSurface, defaultsSummary } from './campaign-defaults.js';
import { createInstallationsSurface, installationsSummary } from './campaign-installations.js';
import { PROVIDER_SURFACE_TYPE, providerSurfaceDefinition } from './provider-surface.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { createWorkspaceFoldersSurface } from './workspace-folders-surface.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';
import { coworkCommons } from './cowork-commons.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { SETUP_SURFACE_TYPES, createGbrainSurface, createServicesSurface, registerSetupSurfaces } from './setup-surfaces.js';
import { readyMika } from './mika-ready.js';
import { createMikaHelpPanel, createMikaTilePool } from './mika.js';
import { toast } from './ui.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { WORKBENCH_HEADER } from './workspace-contract.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';

const PROFILE = 'campaign';
const MIKA_SESSION = 'mika_agent';
const TERMINAL_TYPE = 'session.terminal';
const TYPES = Object.freeze({ machine: 'campaign.machine', defaults: 'campaign.defaults', roots: 'campaign.project-roots', identity: 'campaign.identity', installations: 'campaign.installations', providers: PROVIDER_SURFACE_TYPE, profile: 'campaign.desk-profile', create: 'campaign.new', document: 'document' });
/** The machine's tabs of the cowork commons — everything about this install that is not already a surface here. */
const MACHINE_TABS = Object.freeze(['themes', 'account', 'archives', 'messages', 'help', 'keypad', 'health']);
const elem = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

/**
 * A CARD SAYS WHAT IS SET NOW. The selector's summaries are the Campaign's current values
 * — the description, the face, how many roots — not fixed sentences, so an empty or stock
 * value is what draws the eye and a person can tell from the column what to change.
 * Tenant content only: the workbench draws the cards.
 */
const currently = {
  identity: (e) => e.selected()?.description || t('campaign_view.no_description', 'No description yet.'),
  profile: (e) => {
    const row = e.selected();
    const p = deskProfiles().find((x) => x.name === row?.desk_profile);
    const skin = skinWord(row?.desk?.skin || p?.skin || '');
    if (!p && !skin) return t('campaign_view.no_profile', 'As stock — none chosen.');
    return [p?.label || p?.name, skin].filter(Boolean).join(' · ');
  },
  roots: (e) => {
    const n = e.roots();
    if (n === null) return t('campaign_view.roots_summary', 'The folders this Campaign is allowed to work in.');
    return n ? t('campaign_view.roots_n', '{n} roots', { n }) : t('campaign_view.roots_none', 'None — an Agent here has nowhere to work.');
  },
  defaults: (e) => defaultsSummary(e.selected()),
};

function registerCampaignSurfaces() {
  registerSetupSurfaces();
  registerPasswordSurface();
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({
    type: TERMINAL_TYPE, header: 'terminal', className: 'wk-selector-entity',
    discover: (_tenant, environment) => environment.sessions(),
    create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail),
  });
  add({ type: TYPES.identity, header: 'surface', label: () => t('campaign', 'Desk'), summary: (_tenant, e) => currently.identity(e), create: ({ environment: e }) => { const surface = createCampaignIdentitySurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.profile, header: 'surface', label: () => t('cowork.tab_profile', 'Desk profile'), summary: (_tenant, e) => currently.profile(e), create: ({ environment: e }) => { const surface = createDeskProfileSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.roots, header: 'surface', label: () => t('campaign_view.workspaces', 'Workspaces'), summary: (_tenant, e) => currently.roots(e), create: ({ workspace, environment: e }) => createWorkspaceFoldersSurface({
    campaignId: () => e.selected()?.id || '',
    connected: (host) => e.entered() && host.isConnected,
    presentation: 'stones',
    environment: e,
    workspace,
  }) });
  add({ type: TYPES.defaults, header: 'surface', label: () => t('campaign_view.agent_defaults', 'Team and Agent defaults'), summary: (_tenant, e) => currently.defaults(e), create: ({ environment: e }) => { const surface = createAgentDefaultsSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.document, header: 'surface', label: () => t('docs.frame_title', 'Document'), discover: () => [], create: ({ detail, environment: e }) => e.document(detail) });
  // CONTROL_BUNDLES build-out for the bundle model behind it.
  add({ type: TYPES.installations, header: 'surface', label: () => t('campaign_view.installations', 'Installations'), summary: (_tenant, e) => installationsSummary(e.selected()), create: (context) => { const surface = createInstallationsSurface(context.environment.selected, {
    ...context,
    createInstallationSurface: (id, shared) => id === 'ronin_services' ? createServicesSurface(shared) : id === 'gbrain' ? createGbrainSurface(shared) : null,
  }); return { el: surface.el, show: () => surface.enter(), destroy: () => surface.destroy() }; } });
  add(providerSurfaceDefinition()); // Model providers — the one surface Ronin Setup also seats; provider-surface.js
  // settings — health, account (configuration, updates, hotwords, Koshi, gbrain, log out),
  // archived sessions, help desk, keypad — are a surface here, the cowork commons with the
  // two tabs this page already has as surfaces left out.
  add({ type: TYPES.machine, header: 'tabs', label: () => t('campaign_view.machine', 'Machine'), summary: () => t('campaign_view.machine_summary', 'Themes · Desk · Account · Archived · Messages · Help desk · Keypad.'), create: ({ environment: e }) => { const surface = coworkCommons({ tabs: MACHINE_TABS, label: t('campaign_view.machine', 'Machine'), campaign: e.selected }); return { el: surface.el, show: () => surface.select(surface.current() || 'themes') }; } });
  // — teams and agents — in the forms' own boxes, by kind. The session-roles card that once
  if (MULTIPLE_CAMPAIGNS_ENABLED) add({ type: TYPES.create, header: 'surface', label: () => t('campaign.new', 'New Desk'), summary: () => t('campaign_view.new_summary', 'Set the stage. It creates no Team and launches no Agent.'), variant: 'dotted', create: ({ workspace, environment: e }) => { const surface = createNewCampaignSurface(async (fields) => { const result = await createCampaign(fields); if (result.ok) { e.ctx()?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [result.data.id], primary_campaign_id: result.data.id } }); e.ctx()?.patchViewState('home', { cowork: '', agent: '' }); e.workbench()?.place(TYPES.identity, workspace); } return result; }); return { el: surface.el, show: () => surface.enter() }; } });
  // New Desk is not registered while multiple Campaigns are off.
  profiles.define(PROFILE, [
    TERMINAL_TYPE,
    TYPES.machine, PASSWORD_SURFACE_TYPE, TYPES.installations, TYPES.providers,
    SETUP_SURFACE_TYPES.register, FEEDBACK_TYPE,
    TYPES.identity, TYPES.defaults, TYPES.roots, SETUP_SURFACE_TYPES.launchOwn, TYPES.document,
    ...(MULTIPLE_CAMPAIGNS_ENABLED ? [TYPES.create] : []),
  ]);
}

export function createCampaignView() {
  registerCampaignSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  const { normalizeWorkbenchState } = WorkspaceKit.contract;
  let ctx = null, entered = false, bench = null;
  let loadGeneration = 0;
  let rootsHere = null; // null until the light Workspace Folder index has answered once this entry
  // The native sign-in tile the Model providers surface mounts here as on Ronin Setup.
  const providerSessions = createProviderSetupSessionMount();
  const { surface: mikaSurface, pool: mikaPool } = createMikaTilePool();
  const selected = () => campaignById(normalizeSelection(ctx?.state?.campaignSelection).primary_campaign_id);
  const readRoots = async () => {
    const campaignId = selected()?.id || '';
    const query = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : '';
    const r = await request(`/api/project-roots${query}`, { cache: 'no-store' });
    rootsHere = r.ok && Array.isArray(r.data) ? r.data : [];
  };
  const environment = {
    feedback: (workspace) => createFeedbackSurface(() => bench.place(TYPES.identity, workspace)),
    selected,
    entered: () => entered,
    ctx: () => ctx,
    workbench: () => bench,
    /** How many live roots belong to the selected Campaign; null before the first read. */
    roots: () => (rootsHere === null ? null : rootsHere.filter((root) => !root.archived && campaignOf(root) === selected()?.id).length),
    setupRuntime: null,
    mountProviderSetupSession: providerSessions.mountProviderSetupSession,
    document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
    sessions: () => [{
      key: MIKA_SESSION,
      label: 'Mika',
      summary: t('mika.setup_card', 'Your Ronin welcome guide and general helper.'),
      action: () => { void ensureAndPlaceMika(bench.selected()); },
      onPointerEnter: () => { void readyMika('help'); },
    }],
    terminal: (_workspace, detail) => ({ el: mikaSurface.el, show: () => {
      mikaPool.sync([MIKA_SESSION]);
      mikaPool.show(detail.key || MIKA_SESSION, false);
    } }),
  };
  const ensureAndPlaceMika = async (workspace = 'workspace1') => {
    const ready = await readyMika('help');
    if (!ready || (!ready.ok && ready.data?.state !== 'action_required')) {
      toast(t('mika.start_refused', 'Mika couldn’t start. Try again.'), false);
      return false;
    }
    mikaPool.sync([MIKA_SESSION]);
    return bench?.place(TERMINAL_TYPE, workspace, { key: MIKA_SESSION }) || false;
  };
  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
  let thinSelectorCards = true;
  const save = () => ctx?.patchViewState('campaign', { ...bench.snapshot(), selectorDensity: thinSelectorCards ? 'thin' : 'thick' });
  const densityToggle = WorkspaceKit.primitives.createAction({ label: '', size: 'compact', className: 'tw-agent-density' });
  const densityLines = elem('span', 'tw-agent-density-lines');
  densityLines.append(elem('i'), elem('i'));
  densityToggle.el.replaceChildren(densityLines);
  const paintDensityToggle = () => {
    if (bench?.host) bench.host.dataset.selectorDensity = thinSelectorCards ? 'thin' : 'thick';
    densityToggle.el.dataset.lines = thinSelectorCards ? 'two' : 'one';
    densityToggle.el.title = thinSelectorCards ? 'Show full Settings cards' : 'Show Settings names only';
    densityToggle.el.setAttribute('aria-label', densityToggle.el.title);
    densityToggle.el.setAttribute('aria-pressed', String(thinSelectorCards));
  };
  densityToggle.el.addEventListener('click', () => { thinSelectorCards = !thinSelectorCards; paintDensityToggle(); save(); });
  const mikaHelp = WorkspaceKit.primitives.createAction({ label: t('mika.help', 'ミ Help'), size: 'compact' });
  let helpPanel = null;
  bench = WorkspaceKit.workbench.create({ profile: PROFILE, tenant: { kind: 'campaign', selected }, environment, defaultNode: blank, label: t('campaign.settings_short_title', 'Settings'), title: () => helpPanel?.isOpen() ? t('mika.header', 'Mika, your helpful assistant') : t('campaign.settings_short_title', 'Settings'), actions: [densityToggle, mikaHelp], shapeControl: document.getElementById('shapecycle'), selectorCurrent: 'placed', onSelectorRefresh: (cards) => {
    for (const [type, label] of [
      [TYPES.machine, t('campaign_view.machine_settings', 'Machine Settings')],
      [TYPES.identity, t('campaign_view.desk_settings', 'Desk Settings')],
    ]) {
      const first = cards.querySelector(`[data-workbench-offer-type="${type}"]`);
      if (first) first.before(elem('h3', 'wk-selector-group', label));
    }
  }, onStateChange: save, onPlacement: save });
  paintDensityToggle();
  installBehaviourReader(bench, TYPES.document);
  helpPanel = createMikaHelpPanel({
    selector: bench.host.querySelector('.wk-workbench-selector'), header: bench.selectorHeader,
    refreshHeader: () => bench.refreshSelector(), createAction: WorkspaceKit.primitives.createAction,
    t, helpButton: mikaHelp.el,
    ready: async () => { const ready = await readyMika('help'); if (!ready || (!ready.ok && ready.data?.state !== 'action_required')) return false; mikaPool.sync([MIKA_SESSION]); return true; },
    borrow: () => mikaPool.borrow(MIKA_SESSION), release: () => mikaPool.releaseBorrow(MIKA_SESSION),
    place: (workspace, surface) => { bench?.place(surface, workspace || 'workspace2'); bench?.select(workspace || 'workspace2'); },
    view: () => ({ workbench: 'campaign', team: '', selected: bench.selected(), workspaces: { workspace1: [bench.typeAt('workspace1'), bench.resourceAt('workspace1')].filter(Boolean).join(':') || 'empty', workspace2: [bench.typeAt('workspace2'), bench.resourceAt('workspace2')].filter(Boolean).join(':') || 'empty' } }),
  });
  mikaHelp.el.addEventListener('click', () => { void helpPanel.open(); });
  return {
    el: bench.host, glyph: '⛩', arrangement: bench.arrangement, header: WORKBENCH_HEADER,
    title: () => t('campaign.settings_short_title', 'Settings'),
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    mount: (_host, context) => { ctx = context; },
    enter: (context) => {
      ctx = context; entered = true;
      const generation = ++loadGeneration;
      const { state: entry } = context.workbenchEntry({
        count: 2, selected: 'workspace1',
        seats: { workspace1: TYPES.defaults, workspace2: TYPES.roots },
      });
      thinSelectorCards = entry.selectorDensity !== 'thick';
      paintDensityToggle();
      const typed = normalizeWorkbenchState(entry, bench.declaration);
      bench.enter({ ...typed, ...entry });
      for (const id of bench.ids) {
        const held = typed.seats[id];
        const type = typeof held === 'object' ? held.type : held;
        if (WorkspaceKit.workbench.library.has(type)) bench.place(type, id, typeof held === 'object' ? held : {});
      }
      bench.refreshSelector(); save();
      const refresh = () => { if (entered) bench.refreshSelector(); };
      void loadCampaigns().then(async () => {
        if (!entered || generation !== loadGeneration) return;
        for (const [workspace, held] of Object.entries(bench.snapshot().seats)) {
          const type = typeof held === 'object' ? held.type : held;
          if (type) bench.place(type, workspace, typeof held === 'object' ? held : {});
        }
        await readRoots();
        if (entered && generation === loadGeneration) refresh();
      });
    },
    leave: () => { entered = false; loadGeneration++; bench.leave(); },
    destroy: () => { entered = false; loadGeneration++; helpPanel.destroy(); providerSessions.destroyAll(); mikaPool.destroyAll(); bench.leave(); ctx = null; },
  };
}
