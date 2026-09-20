/* part of the ronin-cowork client — see js/README.md */
/** Campaign is a Workbench tenant: it supplies context, never frame or placement code. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { MULTIPLE_CAMPAIGNS_ENABLED, campaignById, campaignOf, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createNewCampaignSurface } from './campaign-surfaces.js';
import { createDeskProfileSurface, skinWord } from './campaign-desk.js';
import { createAgentDefaultsSurface, defaultsSummary } from './campaign-defaults.js';
import { createInstallationsSurface, installationsSummary } from './campaign-installations.js';
import { createProviderSetupSessionMount } from './provider-setup-session.js';
import { createWorkspaceFoldersSurface } from './workspace-folders-surface.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';
import { coworkCommons } from './cowork-commons.js';
import { createFeedbackSurface, FEEDBACK_TYPE } from './feedback.js';
import { createGbrainSurface, createServicesSurface } from './setup-surfaces.js';
import { readyMika } from './mika-ready.js';
import { createMikaHelpPanel, createMikaTilePool } from './mika.js';
import { toast } from './ui.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { workbenchView } from './workspace-contract.js';
import { returnFromWorkspaceFolders } from './workspace.js';
import { registerWorkbenchCatalog, WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';

const PROFILE = WORKBENCH_PROFILES.campaign;
const MIKA_SESSION = 'mika_agent';
const TERMINAL_TYPE = WORKBENCH_TYPES.terminal;
const TYPES = Object.freeze({ machine: WORKBENCH_TYPES.campaignMachine, defaults: WORKBENCH_TYPES.campaignDefaults, roots: WORKBENCH_TYPES.campaignRoots, identity: WORKBENCH_TYPES.campaignIdentity, document: WORKBENCH_TYPES.document });
/** The machine's tabs of the cowork commons — everything about this install that is not already a surface here. */
const MACHINE_TABS = Object.freeze(['themes', 'account', 'archives', 'messages', 'help', 'keypad', 'health']);
const elem = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };
const enterable = (surface) => ({ el: surface.el, show: () => surface.enter() });

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

export function createCampaignView() {
  registerWorkbenchCatalog();
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
    workspaceFolderOrigin: () => ctx?.state?.returnTo?.origin || null,
    returnFromWorkspaceFolders: () => returnFromWorkspaceFolders(ctx),
    workbench: () => bench,
    /** How many live roots belong to the selected Campaign; null before the first read. */
    roots: () => (rootsHere === null ? null : rootsHere.filter((root) => !root.archived && campaignOf(root) === selected()?.id).length),
    identitySummary: () => currently.identity(environment),
    profileSummary: () => currently.profile(environment),
    rootsSummary: () => currently.roots(environment),
    defaultsSummary: () => currently.defaults(environment),
    installationsSummary: () => installationsSummary(selected()),
    campaignIdentity: () => enterable(createCampaignIdentitySurface(selected)),
    campaignProfile: () => enterable(createDeskProfileSurface(selected)),
    campaignRoots: ({ workspace }) => createWorkspaceFoldersSurface({
      campaignId: () => selected()?.id || '',
      connected: (host) => entered && host.isConnected,
      presentation: 'stones',
      environment,
      workspace,
    }),
    campaignDefaults: () => enterable(createAgentDefaultsSurface(selected)),
    campaignInstallations: (context) => {
      const surface = createInstallationsSurface(selected, {
        ...context,
        createInstallationSurface: (id, shared) => id === 'ronin_services' ? createServicesSurface(shared) : id === 'gbrain' ? createGbrainSurface(shared) : null,
      });
      return { el: surface.el, show: () => surface.enter(), destroy: () => surface.destroy() };
    },
    campaignMachine: () => {
      const surface = coworkCommons({ tabs: MACHINE_TABS, label: t('campaign_view.machine', 'Machine'), campaign: selected });
      return { el: surface.el, show: () => surface.select(surface.current() || 'themes') };
    },
    campaignCreate: ({ workspace }) => {
      const surface = createNewCampaignSurface(async (fields) => {
        const result = await createCampaign(fields);
        if (result.ok) {
          ctx?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [result.data.id], primary_campaign_id: result.data.id } });
          ctx?.patchViewState('home', { cowork: '', agent: '' });
          bench?.place(TYPES.identity, workspace);
        }
        return result;
      });
      return enterable(surface);
    },
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
  const save = () => ctx?.patchViewState('campaign', bench.snapshot());
  const mikaHelp = WorkspaceKit.primitives.createAction({ label: t('mika.help', 'ミ Help'), size: 'compact' });
  let helpPanel = null;
  bench = WorkspaceKit.workbench.create({ profile: PROFILE, tenant: { kind: 'campaign', selected }, environment, defaultNode: blank, label: t('campaign.settings_short_title', 'Settings'), title: () => helpPanel?.isOpen() ? t('mika.header', 'Mika, your helpful assistant') : t('campaign.settings_short_title', 'Settings'), actions: [mikaHelp], selectorCurrent: 'placed', onSelectorRefresh: (cards) => {
    for (const [type, label] of [
      [TYPES.machine, t('campaign_view.machine_settings', 'Machine Settings')],
      [TYPES.identity, t('campaign_view.desk_settings', 'Desk Settings')],
    ]) {
      const first = cards.querySelector(`[data-workbench-offer-type="${type}"]`);
      if (first) first.before(elem('h3', 'wk-selector-group', label));
    }
  }, onStateChange: save, onPlacement: save });
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
    el: bench.host, glyph: '⛩', ...workbenchView('campaign'), arrangement: bench.arrangement,
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
