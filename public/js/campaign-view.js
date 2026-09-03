/* part of the ronin-cowork client — see js/README.md */
/** Campaign is a Workbench tenant: it supplies context, never frame or placement code. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { campaignById, campaignOf, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createNewCampaignSurface } from './campaign-surfaces.js';
import { choice, createDeskProfileSurface, skinWord } from './campaign-desk.js';
import { createAgentDefaultsSurface, defaultsSummary } from './campaign-defaults.js';
import { createRoutinesSurface, routinesSummary } from './campaign-routines.js';
import { createTemplatesSurface } from './campaign-templates.js';
import { buildProjectRoots } from './projectroots.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';
import { coworkCommons } from './cowork-commons.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';

const PROFILE = 'campaign';
// No Ronin Desk here (owner, 2026-08-30): its tabs repeat what these surfaces are, and
// the machine's own half — account, health — is the Admin Desk's.
// KEY ORDER IS THE SELECTOR'S ORDER (owner, 2026-09-03): Ronin Desk · Templates · Agent
// defaults · Project roots lead, and they are the four the page opens on.
const TYPES = Object.freeze({ machine: 'campaign.machine', templates: 'campaign.templates', defaults: 'campaign.agent-defaults', roots: 'campaign.project-roots', identity: 'campaign.identity', routines: 'campaign.routines', profile: 'campaign.desk-profile', create: 'campaign.new' });
/** The machine's tabs of the cowork commons — everything about this install that is not already a surface here. */
const MACHINE_TABS = Object.freeze(['themes', 'account', 'archives', 'messages', 'help', 'keypad', 'health']);
const LEGACY = Object.freeze({ '@campaign': TYPES.identity, '@profile': TYPES.profile, '@roots': TYPES.roots, '@templates': TYPES.templates, 'campaign.team-templates': TYPES.templates, 'campaign.session-roles': TYPES.templates, '@new-campaign': TYPES.create });
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
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: TYPES.identity, header: 'surface', label: () => t('campaign', 'Campaign'), summary: (_tenant, e) => currently.identity(e), create: ({ environment: e }) => { const surface = createCampaignIdentitySurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.profile, header: 'surface', label: () => t('cowork.tab_profile', 'Desk profile'), summary: (_tenant, e) => currently.profile(e), create: ({ environment: e }) => { const surface = createDeskProfileSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.roots, header: 'surface', label: () => t('cowork.tab_roots', 'Project roots'), summary: (_tenant, e) => currently.roots(e), create: ({ environment: e }) => {
    const surface = WorkspaceKit.primitives.createSurface({ label: t('cowork.tab_roots', 'Project roots'), className: 'cv-surface' });
    // This is only the repository-side seed for roots added later. Agent capability is
    // selected independently by the Campaign/Team Routines surface; existing roots keep
    // the answer in their own repository profile below.
    const newDesks = elem('div', 'cv-body');
    const paintNewDesks = (current) => newDesks.replaceChildren(choice(
      t('campaign_view.new_project_worktrees', 'Worktrees for new project roots'),
      [{ value: 'managed', label: t('campaign_view.new_project_worktrees_yes', 'Allow Ronin Worktrees') }, { value: 'none', label: t('campaign_view.new_project_worktrees_no', 'Use the checkout') }],
      current,
      t('campaign_view.new_project_worktrees_help', 'Worktrees keep each Agent’s changes in a separate working folder and branch, so multiple Agents can work on one repository without clobbering each other. Each Agent hands its work in for the Team lead to merge deliberately. This sets the default for roots added later; change an existing repository on its Project Root card below.'),
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
  add({ type: TYPES.machine, header: 'channels', label: () => t('cowork.commons', 'Ronin Desk'), summary: () => t('campaign_view.machine_summary', 'Themes · Account · Archived · Messages · Help desk · Keypad · Desk.'), create: ({ environment: e }) => { const surface = coworkCommons({ tabs: MACHINE_TABS, label: t('cowork.commons', 'Ronin Desk'), campaign: e.selected }); return { el: surface.el, show: () => surface.select(surface.current() || 'themes') }; } });
  // TEMPLATES (2026-09-03): the library first, then the two shelves the launch forms draw
  // — teams and agents — in the forms' own boxes, by kind. The session-roles card that once
  // stood behind this word is gone (owner, 2026-09-03: outdated); a remembered seat maps here.
  add({ type: TYPES.templates, header: 'surface', label: () => t('league.templates', 'Templates'), summary: () => t('campaign_view.templates_summary', 'Team casts, agent loadouts, and the library to download more from.'), create: () => { const surface = createTemplatesSurface(); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.create, header: 'surface', label: () => t('campaign.new', 'New Campaign'), summary: () => t('campaign_view.new_summary', 'Set the stage. It creates no Cowork and launches no Agent.'), variant: 'dotted', create: ({ workspace, environment: e }) => { const surface = createNewCampaignSurface(async (fields) => { const result = await createCampaign(fields); if (result.ok) { e.ctx()?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [result.data.id], primary_campaign_id: result.data.id } }); e.ctx()?.patchViewState('home', { cowork: '', agent: '' }); e.workbench()?.place(TYPES.identity, workspace); } return result; }); return { el: surface.el, show: () => surface.enter() }; } });
  // ONE CAMPAIGN SHIPS (owner, 2026-08-30): there is no way yet to look at several, so
  // New Campaign is not offered — the surface stays in the library, off the profile.
  // Desk profile remains registered so a remembered workspace can still restore it, but
  // its beta card is hidden from discovery. Themes now have their stable home in Ronin Desk.
  profiles.define(PROFILE, [...Object.values(TYPES).filter((type) => type !== TYPES.create && type !== TYPES.profile), FEEDBACK_TYPE]);
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
    feedback: (workspace) => createFeedbackSurface(() => bench.place(TYPES.identity, workspace)),
    selected,
    entered: () => entered,
    ctx: () => ctx,
    workbench: () => bench,
    /** How many live roots belong to the selected Campaign; null before the first read. */
    roots: () => (rootsHere === null ? null : rootsHere.filter((root) => !root.archived && campaignOf(root) === selected()?.id).length),
    settei: () => setteiRead,
  };
  /**
   * THE DEFAULT VIEW (owner, 2026-09-03): the page always loads four up — Ronin Desk,
   * Templates, Agent defaults, Project roots — and every blank workspace takes its default
   * on every entry. A surface the person placed elsewhere is left where they put it; only
   * an empty seat is filled, and a surface already on the page is never placed twice.
   */
  const DEFAULT_VIEW = Object.freeze({ workspace1: TYPES.machine, workspace2: TYPES.templates, workspace3: TYPES.defaults, workspace4: TYPES.roots });
  const blank = (id) => { const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'cv-blank' }); surface.content.append(elem('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace'))); return surface.el; };
  const save = () => ctx?.patchViewState('campaign', bench.snapshot());
  bench = WorkspaceKit.workbench.create({ profile: PROFILE, tenant: { kind: 'campaign', selected }, environment, defaultNode: blank, label: t('campaign', 'Campaign'), title: () => selected()?.title || t('campaign', 'Campaign'), shapeControl: document.getElementById('shapecycle'), onStateChange: save, onPlacement: save });
  return {
    el: bench.host, glyph: '⛩', arrangement: bench.arrangement,
    title: () => selected()?.title || t('campaign', 'Campaign'),
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context; entered = true;
      const typed = teamWorkspaceState(context.state, context.viewState('campaign'), bench.declaration);
      bench.enter({ ...typed, ...context.viewState('campaign') });
      await Promise.all([loadCampaigns(), readRoots(), readSettei()]);
      if (!entered) return;
      for (const id of bench.ids) { const type = LEGACY[typed.seats[id]] || typed.seats[id]; if (WorkspaceKit.workbench.library.has(type)) bench.place(type, id); }
      bench.setCount(4);
      for (const [id, type] of Object.entries(DEFAULT_VIEW)) if (bench.isDefault(id) && !bench.locations(type).length) bench.place(type, id);
      if (!context.viewState('campaign')?.opened) {
        bench.select('workspace1');
        ctx?.patchViewState('campaign', { opened: true });
      }
      bench.refreshSelector(); save();
    },
    leave: () => { entered = false; bench.leave(); },
    destroy: () => { entered = false; bench.leave(); ctx = null; },
  };
}
