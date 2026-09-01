/* part of the ronin-cowork client — see js/README.md */
/** Campaign is a Workbench tenant: it supplies context, never frame or placement code. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { campaignById, campaignOf, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createNewCampaignSurface, createSessionRolesSurface } from './campaign-surfaces.js';
import { choice, createDeskProfileSurface, skinWord } from './campaign-desk.js';
import { createAgentDefaultsSurface, defaultsSummary } from './campaign-defaults.js';
import { createRoutinesSurface, routinesSummary } from './campaign-routines.js';
import { buildProjectRoots } from './projectroots.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';
import { coworkCommons } from './cowork-commons.js';

const PROFILE = 'campaign';
// No Ronin Desk here (owner, 2026-08-30): its tabs repeat what these surfaces are, and
// the machine's own half — account, health — is the Admin Desk's.
const TYPES = Object.freeze({ identity: 'campaign.identity', profile: 'campaign.desk-profile', roots: 'campaign.project-roots', defaults: 'campaign.agent-defaults', routines: 'campaign.routines', roles: 'campaign.session-roles', machine: 'campaign.machine', create: 'campaign.new' });
/** The machine's tabs of the cowork commons — everything about this install that is not already a surface here. */
const MACHINE_TABS = Object.freeze(['health', 'account', 'archives', 'messages', 'help', 'keypad']);
const LEGACY = Object.freeze({ '@campaign': TYPES.identity, '@profile': TYPES.profile, '@roots': TYPES.roots, '@templates': TYPES.roles, 'campaign.team-templates': TYPES.roles, '@new-campaign': TYPES.create });
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
  defaults: (e) => defaultsSummary(e.selected(), e.settei()),
};

function registerCampaignSurfaces() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: TYPES.identity, header: 'surface', label: () => t('campaign', 'Campaign'), summary: (_tenant, e) => currently.identity(e), create: ({ environment: e }) => { const surface = createCampaignIdentitySurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.profile, header: 'surface', label: () => t('cowork.tab_profile', 'Desk profile'), summary: (_tenant, e) => currently.profile(e), create: ({ environment: e }) => { const surface = createDeskProfileSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.roots, header: 'surface', label: () => t('cowork.tab_roots', 'Project roots'), summary: (_tenant, e) => currently.roots(e), create: ({ environment: e }) => {
    const surface = WorkspaceKit.primitives.createSurface({ label: t('cowork.tab_roots', 'Project roots'), className: 'cv-surface' });
    // NEW PROJECTS USE DESKS? — the default a new root's RONIN_REPO is written with. It
    // sits beside the roots (SETTEI audit, 2026-08-30) because that is where a root is
    // added; each root's own row shows and changes what its file actually says.
    const newDesks = elem('div', 'cv-body');
    const paintNewDesks = (current) => newDesks.replaceChildren(choice(
      t('campaign_view.new_project_desks', 'New projects use desks?'),
      [{ value: 'managed', label: t('campaign_view.new_project_desks_yes', 'Desks') }, { value: 'none', label: t('campaign_view.new_project_desks_no', 'None') }],
      current,
      t('campaign_view.new_project_desks_help', 'Desks: each coding session works at its own branch and worktree and hands in to the team. None: sessions work in the checkout. Written into a project’s RONIN_REPO when its root is added; the desks box on a root changes that one project.'),
      async (v) => { const r = await request('/api/settei/desks', { method: 'PUT', json: { new_project: v } }); paintNewDesks(r.ok ? v : current); },
    ));
    const host = elem('div', 'desk-pane desk-proj show');
    surface.content.append(newDesks, host);
    const room = buildProjectRoots(host, () => e.entered() && host.isConnected, null);
    return { el: surface.el, show: () => { room.enter(); void request('/api/settei').then((r) => paintNewDesks(r.ok && r.data?.set?.desks?.new_project === 'none' ? 'none' : 'managed')); } };
  } });
  add({ type: TYPES.defaults, header: 'surface', label: () => t('campaign_view.agent_defaults', 'Agent defaults'), summary: (_tenant, e) => currently.defaults(e), create: ({ environment: e }) => { const surface = createAgentDefaultsSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  // ROUTINES (owner, 2026-08-30): the switchboard for control systems — see the lab's
  // CONTROL_BUNDLES build-out for the bundle model behind it.
  add({ type: TYPES.routines, header: 'surface', label: () => t('campaign_view.routines', 'Routines'), summary: (_tenant, e) => routinesSummary(e.selected()), create: ({ environment: e }) => { const surface = createRoutinesSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  // THE MACHINE (owner, 2026-08-30): the Admin Desk is gone as a page; this Ronin's own
  // settings — health, account (configuration, updates, hotwords, Koshi, gbrain, log out),
  // archived sessions, help desk, keypad — are a surface here, the cowork commons with the
  // two tabs this page already has as surfaces left out.
  add({ type: TYPES.machine, header: 'channels', label: () => t('cowork.commons', 'Ronin Desk'), summary: () => t('campaign_view.machine_summary', 'The rest of the desk: Desk · Account · Archived · Messages · Help desk · Keypad.'), create: () => { const surface = coworkCommons({ tabs: MACHINE_TABS, label: t('cowork.commons', 'Ronin Desk') }); return { el: surface.el, show: () => surface.select(surface.current() || 'health') }; } });
  // The card says Templates (owner, 2026-08-30); what opens is the session roles, which are
  // the templates that exist.
  add({ type: TYPES.roles, header: 'surface', label: () => t('league.templates', 'Templates'), summary: () => t('campaign_view.roles_summary', 'What a launch here offers an Agent to be.'), create: () => { const surface = createSessionRolesSurface(); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.create, header: 'surface', label: () => t('campaign.new', 'New Campaign'), summary: () => t('campaign_view.new_summary', 'Set the stage. It creates no Cowork and launches no Agent.'), variant: 'dotted', create: ({ workspace, environment: e }) => { const surface = createNewCampaignSurface(async (fields) => { const result = await createCampaign(fields); if (result.ok) { e.ctx()?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [result.data.id], primary_campaign_id: result.data.id } }); e.ctx()?.patchViewState('home', { cowork: '', agent: '' }); e.workbench()?.place(TYPES.identity, workspace); } return result; }); return { el: surface.el, show: () => surface.enter() }; } });
  // ONE CAMPAIGN SHIPS (owner, 2026-08-30): there is no way yet to look at several, so
  // New Campaign is not offered — the surface stays in the library, off the profile.
  profiles.define(PROFILE, Object.values(TYPES).filter((type) => type !== TYPES.create));
}

export function createCampaignView() {
  registerCampaignSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  const { teamWorkspaceState } = WorkspaceKit.contract;
  let ctx = null, entered = false, bench = null;
  let rootsHere = null; // null until /api/project-roots/detail has answered once this entry
  let setteiRead = null; // the SETTEI record, for the subset rule on Agent defaults
  const selected = () => campaignById(normalizeSelection(ctx?.state?.campaignSelection).primary_campaign_id);
  const readRoots = async () => {
    const r = await request('/api/project-roots/detail', { cache: 'no-store' });
    rootsHere = r.ok && Array.isArray(r.data?.roots) ? r.data.roots : [];
  };
  const readSettei = async () => {
    const r = await request('/api/settei');
    setteiRead = r.ok ? r.data : null;
  };
  const environment = {
    selected,
    entered: () => entered,
    ctx: () => ctx,
    workbench: () => bench,
    /** How many live roots belong to the selected Campaign; null before the first read. */
    roots: () => (rootsHere === null ? null : rootsHere.filter((root) => !root.archived && campaignOf(root) === selected()?.id).length),
    settei: () => setteiRead,
  };
  /**
   * FIRST OPEN (owner, 2026-08-30): the page opens as the whole record — four settings
   * up, one per workspace, at count 4. Applied ONCE per browser (`opened` in the view
   * state), so a tab that remembered the two-seat days still gets four; after that the
   * arrangement is the person's, and an emptied workspace stays empty.
   */
  const FIRST_OPEN = Object.freeze({ workspace1: TYPES.identity, workspace2: TYPES.profile, workspace3: TYPES.roots, workspace4: TYPES.defaults });
  const blank = (id) => { const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'cv-blank' }); surface.content.append(elem('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace'))); return surface.el; };
  const save = () => ctx?.patchViewState('campaign', bench.snapshot());
  bench = WorkspaceKit.workbench.create({ profile: PROFILE, tenant: { kind: 'campaign', selected }, environment, defaultNode: blank, label: t('campaign', 'Campaign'), title: () => selected()?.title || t('campaign', 'Campaign'), shapeControl: document.getElementById('shapecycle'), onStateChange: save, onPlacement: save });
  return {
    el: bench.host, glyph: '⛩', arrangement: bench.arrangement,
    title: () => selected()?.title || t('campaign', 'Campaign'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context; entered = true;
      const typed = teamWorkspaceState(context.state, context.viewState('campaign'), bench.declaration);
      bench.enter({ ...typed, ...context.viewState('campaign') });
      await Promise.all([loadCampaigns(), readRoots(), readSettei()]);
      if (!entered) return;
      for (const id of bench.ids) { const type = LEGACY[typed.seats[id]] || typed.seats[id]; if (WorkspaceKit.workbench.library.has(type)) bench.place(type, id); }
      if (!context.viewState('campaign')?.opened) {
        bench.setCount(4);
        for (const [id, type] of Object.entries(FIRST_OPEN)) if (bench.isDefault(id) && !bench.locations(type).length) bench.place(type, id);
        bench.select('workspace1');
        ctx?.patchViewState('campaign', { opened: true });
      }
      bench.refreshSelector(); save();
    },
    leave: () => { entered = false; bench.leave(); },
    destroy: () => { entered = false; bench.leave(); ctx = null; },
  };
}
