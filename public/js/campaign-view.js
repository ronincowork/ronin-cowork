/* part of the ronin-cowork client — see js/README.md */
/** Campaign is a Workbench tenant: it supplies context, never frame or placement code. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { campaignById, campaignOf, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createDeskProfileSurface, createNewCampaignSurface, skinWord } from './campaign-surfaces.js';
import { buildProjectRoots } from './projectroots.js';
import { deskProfiles } from './desk-profile.js';
import { request } from './request.js';
import { createTeamTemplatesSurface } from './team-templates-surface.js';
import { coworkCommons } from './cowork-commons.js';

const PROFILE = 'campaign';
const TYPES = Object.freeze({ identity: 'campaign.identity', profile: 'campaign.desk-profile', roots: 'campaign.project-roots', templates: 'campaign.team-templates', desk: 'ronin.desk', create: 'campaign.new' });
const LEGACY = Object.freeze({ '@campaign': TYPES.identity, '@profile': TYPES.profile, '@roots': TYPES.roots, '@templates': TYPES.templates, '@desk': TYPES.desk, '@new-campaign': TYPES.create });
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
    const p = deskProfiles().find((x) => x.name === e.selected()?.desk_profile);
    return p ? [p.label || p.name, skinWord(p.skin)].filter(Boolean).join(' · ') : t('campaign_view.no_profile', 'As stock — none chosen.');
  },
  roots: (e) => {
    const n = e.roots();
    if (n === null) return t('campaign_view.roots_summary', 'The folders this Campaign is allowed to work in.');
    return n ? t('campaign_view.roots_n', '{n} roots', { n }) : t('campaign_view.roots_none', 'None — an Agent here has nowhere to work.');
  },
};

function registerCampaignSurfaces() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: TYPES.identity, header: 'surface', label: () => t('campaign', 'Campaign'), summary: (_tenant, e) => currently.identity(e), create: ({ environment: e }) => { const surface = createCampaignIdentitySurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.profile, header: 'surface', label: () => t('cowork.tab_profile', 'Desk profile'), summary: (_tenant, e) => currently.profile(e), create: ({ environment: e }) => { const surface = createDeskProfileSurface(e.selected); return { el: surface.el, show: () => surface.enter() }; } });
  add({ type: TYPES.roots, header: 'surface', label: () => t('cowork.tab_roots', 'Project roots'), summary: (_tenant, e) => currently.roots(e), create: ({ environment: e }) => { const surface = WorkspaceKit.primitives.createSurface({ label: t('cowork.tab_roots', 'Project roots'), className: 'cv-surface' }); const host = elem('div', 'desk-pane desk-proj show'); surface.content.append(host); const room = buildProjectRoots(host, () => e.entered() && host.isConnected, null); return { el: surface.el, show: () => room.enter() }; } });
  add({ type: TYPES.templates, header: 'surface', label: () => t('league.templates', 'Templates'), summary: () => t('campaign_view.templates_summary', 'The Cowork templates this Campaign offers.'), create: ({ environment: e }) => { const content = createTeamTemplatesSurface({ draft: () => e.ctx()?.viewState('new-team')?.draft || null, use: (draft) => { e.ctx()?.patchViewState('new-team', { draft }); e.ctx()?.patchViewState('cowork', { seats: { workspace1: '@new-team' } }); e.ctx()?.navigate('cowork'); } }); const surface = WorkspaceKit.primitives.createSurface({ label: t('league.templates', 'Templates'), className: 'cv-surface' }); surface.content.append(content.el); return { el: surface.el, show: () => content.enter?.() }; } });
  add({ type: TYPES.desk, header: 'channels', label: () => t('cowork.commons', 'Ronin Desk'), summary: () => t('campaign_view.desk_summary', 'This Ronin install, its owner and its workspace configuration.'), create: ({ workspace, environment: e }) => e.desk(workspace) });
  add({ type: TYPES.create, header: 'surface', label: () => t('campaign.new', 'New Campaign'), summary: () => t('campaign_view.new_summary', 'Set the stage. It creates no Cowork and launches no Agent.'), variant: 'dotted', create: ({ workspace, environment: e }) => { const surface = createNewCampaignSurface(async (fields) => { const result = await createCampaign(fields); if (result.ok) { e.ctx()?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [result.data.id], primary_campaign_id: result.data.id } }); e.ctx()?.patchViewState('home', { cowork: '', agent: '' }); e.workbench()?.place(TYPES.identity, workspace); } return result; }); return { el: surface.el, show: () => surface.enter() }; } });
  profiles.define(PROFILE, Object.values(TYPES));
}

export function createCampaignView() {
  registerCampaignSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  const { teamWorkspaceState } = WorkspaceKit.contract;
  let ctx = null, entered = false, bench = null;
  let rootsHere = null; // null until /api/project-roots/detail has answered once this entry
  const selected = () => campaignById(normalizeSelection(ctx?.state?.campaignSelection).primary_campaign_id);
  const readRoots = async () => {
    const r = await request('/api/project-roots/detail', { cache: 'no-store' });
    rootsHere = r.ok && Array.isArray(r.data?.roots) ? r.data.roots : [];
  };
  const environment = {
    selected,
    entered: () => entered,
    ctx: () => ctx,
    workbench: () => bench,
    /** How many live roots belong to the selected Campaign; null before the first read. */
    roots: () => (rootsHere === null ? null : rootsHere.filter((root) => !root.archived && campaignOf(root) === selected()?.id).length),
    desk: () => { const surface = coworkCommons(); return { el: surface.el, show: () => surface.select('health') }; },
  };
  /**
   * FIRST OPEN (owner, 2026-08-30): the page opens as the whole record — the four settings
   * up, one per workspace, in the column's order. Only when nothing is remembered; after
   * that the arrangement is the person's, and an emptied workspace stays empty.
   */
  const FIRST_OPEN = Object.freeze({ workspace1: TYPES.identity, workspace2: TYPES.profile, workspace3: TYPES.roots, workspace4: TYPES.templates });
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
      await Promise.all([loadCampaigns(), readRoots()]);
      if (!entered) return;
      let any = false;
      for (const id of bench.ids) { const type = LEGACY[typed.seats[id]] || typed.seats[id]; if (WorkspaceKit.workbench.library.has(type)) { bench.place(type, id); any = true; } }
      if (!any) {
        bench.setCount(4);
        for (const [id, type] of Object.entries(FIRST_OPEN)) bench.place(type, id);
        bench.select('workspace1');
      }
      bench.refreshSelector(); save();
    },
    leave: () => { entered = false; bench.leave(); },
    destroy: () => { entered = false; bench.leave(); ctx = null; },
  };
}
