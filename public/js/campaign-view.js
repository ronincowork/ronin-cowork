/* part of the ronin-cowork client — see js/README.md */
/**
 * CAMPAIGN MANAGE — a Cowork Space, whose surfaces are Campaign-level (owner, 2026-08-29).
 *
 * NOT A SECOND PAGE SYSTEM. This is the same bedrock the Cowork space runs on: the Kit's
 * managed workbench, a selector column beside two workspaces, one surface registry, the
 * same arrangement/seat persistence, the same recall on re-entry, the same drag-a-card-
 * into-a-workspace. What differs is only WHAT the selector offers — a Campaign's own
 * configuration instead of its Coworks and Agents. A workspace holds one surface at a
 * time here exactly as it does there.
 *
 * WHY THE SELECTOR AND NOT A TAB STRIP. These four used to be a channel strip inside
 * /cowork (the Campaign commons), which meant Campaign configuration was reachable only
 * one pane at a time and lived at the wrong level. As surfaces they can sit side by side —
 * Project Roots open beside Templates — and they leave /cowork to be Cowork-level.
 *
 * WHAT STAYS BEHIND, deliberately: the Team roster, Cowork View and New Team remain in the
 * Cowork space. A Cowork is not Campaign configuration, and @new_team's creation flow is
 * theirs — it will RECEIVE the selected `campaign_id` when their leg lands, and is never
 * reimplemented here.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { S } from './state.js';
import { campaignById, campaigns, campaignsFailed, campaignsMessage, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createDeskProfileSurface, createNewCampaignSurface, createTemplatePreferencesSurface } from './campaign-surfaces.js';
import { buildProjectRoots } from './projectroots.js';
import { DRAG_TYPE, acceptDrops } from './team-drag.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

const CAMPAIGN = '@campaign';
const PROFILE = '@profile';
const ROOTS = '@roots';
const TEMPLATES = '@templates';
const NEW = '@new-campaign';

export function createCampaignView() {
  const { createSurface, createSurfaceHeader, createCard, setSurfaceState } = WorkspaceKit.primitives;
  const { createWorkbenchLayout } = WorkspaceKit.layouts;
  const { teamWorkspaceState } = WorkspaceKit.contract;

  const root = el('main', 'cv-view');
  let ctx = null;
  let entered = false;
  let lastSeat = 'workspace1';

  /* ---------- which Campaign this tab is managing ---------- */
  const selected = () => {
    const healed = normalizeSelection(ctx?.state?.campaignSelection);
    return campaignById(healed.primary_campaign_id);
  };

  /* ---------- the surfaces ---------- */
  const identity = createCampaignIdentitySurface(selected);
  const profile = createDeskProfileSurface(selected);
  const rootsHost = el('div', 'desk-pane desk-proj show');
  const rootsSurface = createSurface({ label: t('cowork.tab_roots', 'Project roots'), className: 'cv-surface' });
  rootsSurface.el.prepend(createSurfaceHeader({ label: t('cowork.tab_roots', 'Project roots') }).el);
  rootsSurface.content.append(rootsHost);
  const rootsRoom = buildProjectRoots(rootsHost, () => entered && rootsHost.isConnected, null);
  const templates = createTemplatePreferencesSurface(selected);
  const newCampaign = createNewCampaignSurface(async (fields) => {
    const r = await createCampaign(fields);
    if (r.ok) {
      // Created, selected, and STOPPED. No Cowork, no Agent, no project root.
      ctx?.patchState({ campaignSelection: { mode: 'selected', campaign_ids: [r.data.id], primary_campaign_id: r.data.id } });
      ctx?.patchViewState('home', { cowork: '', agent: '' });
      putSurface(CAMPAIGN, lastSeat);
      paintCards();
    }
    return r;
  });

  const SURFACES = {
    [CAMPAIGN]: { name: 'campaign', el: identity.el, show: () => identity.enter() },
    [PROFILE]: { name: 'profile', el: profile.el, show: () => profile.enter() },
    [ROOTS]: { name: 'roots', el: rootsSurface.el, show: () => rootsRoom.enter() },
    [TEMPLATES]: { name: 'templates', el: templates.el, show: () => templates.enter() },
    [NEW]: { name: 'new-campaign', el: newCampaign.el, show: () => newCampaign.enter() },
  };

  /* ---------- two workspaces, exactly as the Cowork space seats them ---------- */
  const makeSeat = (id, label) => {
    const blank = createSurface({ label, className: 'cv-blank' });
    blank.el.prepend(createSurfaceHeader({ label }).el);
    blank.content.append(el('p', 'cv-blank-word', label));
    return { id, blank: blank.el };
  };
  const seats = {
    workspace1: makeSeat('workspace1', t('team.workspace_1', 'Workspace 1')),
    workspace2: makeSeat('workspace2', t('team.workspace_2', 'Workspace 2')),
  };
  const cells = {};
  for (const id of Object.keys(seats)) {
    const cell = el('div', 'cv-cell');
    cell.dataset.workspace = id;
    cell.append(seats[id].blank);
    cells[id] = cell;
    cell.addEventListener('pointerdown', () => touch(id), true);
    acceptDrops(cell, () => id, (token, at) => { if (SURFACES[token]) putSurface(token, at); });
  }
  const holding = (id) => cells[id]?.firstElementChild ?? null;
  const tokenOf = (node) => Object.keys(SURFACES).find((key) => SURFACES[key].el === node) || '';
  const heldSurface = (id) => tokenOf(holding(id));
  const whereIs = (token) => Object.keys(seats).find((id) => holding(id) === SURFACES[token]?.el) || '';
  const touch = (id) => {
    lastSeat = id;
    for (const seat of Object.keys(seats)) cells[seat].classList.toggle('cv-selected', seat === id);
  };
  /** One trade, for every surface: wherever it was, that seat goes blank again. */
  const putSurface = (token, id) => {
    const surface = SURFACES[token];
    if (!surface || !cells[id]) return false;
    const from = whereIs(token);
    if (from && from !== id) cells[from].replaceChildren(seats[from].blank);
    if (cells[id].firstElementChild !== surface.el) cells[id].replaceChildren(surface.el);
    surface.show?.();
    touch(id);
    remember();
    paintCards();
    return true;
  };
  const emptySeat = (id) => {
    cells[id].replaceChildren(seats[id].blank);
    remember();
    paintCards();
  };
  const remember = () => ctx?.patchViewState('campaign', {
    seats: Object.fromEntries(Object.keys(seats).map((id) => [id, heldSurface(id)])),
  });

  /* ---------- the selector column ---------- */
  const column = createSurface({ label: t('campaign', 'Campaign'), className: 'cv-selector' });
  const columnHead = el('div', 'cv-selector-head');
  const columnTitle = el('span', 'cv-selector-title', t('campaign', 'Campaign'));
  columnHead.append(columnTitle);
  column.el.prepend(columnHead);
  const cards = el('div', 'cv-selector-cards');
  column.content.append(cards);

  /** The Campaign-level surfaces, read at paint so the lexicon is up (KOKUGO § 5). */
  function OFFERED() {
    return [
      { token: CAMPAIGN, heading: t('campaign', 'Campaign'), summary: t('campaign_view.campaign_summary', 'What this body of work is called, and what it is for.') },
      { token: PROFILE, heading: t('cowork.tab_profile', 'Desk profile'), summary: t('campaign_view.profile_summary', 'The words, the skin and the templates this Campaign opens on.') },
      { token: ROOTS, heading: t('cowork.tab_roots', 'Project roots'), summary: t('campaign_view.roots_summary', 'The folders this Campaign is allowed to work in.') },
      { token: TEMPLATES, heading: t('campaign_view.template_prefs', 'Template preferences'), summary: t('campaign_view.templates_summary', 'Which Cowork templates this Campaign offers.') },
    ];
  }

  function paintCards() {
    const row = selected();
    columnTitle.textContent = row?.title || t('campaign', 'Campaign');
    cards.replaceChildren();
    if (campaignsFailed()) {
      setSurfaceState(column.el, 'failed', t('campaign.read_failed', 'Could not read Campaigns — {message}', { message: campaignsMessage() }));
      return;
    }
    setSurfaceState(column.el, null, '');
    const add = (token, heading, summary, variant = null) => {
      const card = createCard({
        heading, summary, variant,
        selected: !!whereIs(token),
        action: () => { if (whereIs(token)) emptySeat(whereIs(token)); else putSurface(token, lastSeat); },
      });
      card.el.draggable = true;
      card.el.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData(DRAG_TYPE, token);
        event.dataTransfer.setData('text/plain', heading);
        event.dataTransfer.effectAllowed = 'move';
      });
      cards.append(card.el);
      return card;
    };
    for (const offer of OFFERED()) add(offer.token, offer.heading, offer.summary);
    add(NEW, t('campaign.new', 'New Campaign'), t('campaign_view.new_summary', 'Set the stage. It creates no Cowork and launches no Agent.'), 'dotted');
    if (!campaigns().length) column.content.append(el('p', 'cv-empty', t('campaign.none', 'No Campaigns yet.')));
  }

  const DECLARATION = {
    slots: [
      { name: 'workspace1', label: t('team.workspace_1', 'Workspace 1'), width: 40 },
      { name: 'selector', label: t('campaign', 'Campaign'), width: 20, min: 6, compact: 176 },
      { name: 'workspace2', label: t('team.workspace_2', 'Workspace 2'), width: 40 },
    ],
  };
  const workbench = createWorkbenchLayout({
    declaration: DECLARATION,
    surfaces: { workspace1: cells.workspace1, selector: column.el, workspace2: cells.workspace2 },
    onStateChange: (arrangement) => ctx?.patchViewState('campaign', { arrangement }),
  });
  root.append(workbench.host);

  /** What each workspace remembered holding; with nothing remembered, Campaign on the left. */
  const seatTheCampaign = (remembered) => {
    let any = false;
    for (const id of Object.keys(seats)) {
      const wanted = remembered[id];
      if (SURFACES[wanted]) { putSurface(wanted, id); any = true; }
    }
    if (!any) putSurface(CAMPAIGN, 'workspace1');
  };

  return {
    el: root,
    glyph: '⛩',
    arrangement: workbench.arrangement,
    title: () => selected()?.title || t('campaign', 'Campaign'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      entered = true;
      const typed = teamWorkspaceState(context.state, context.viewState('campaign'), DECLARATION);
      workbench.restore(typed.arrangement);
      paintCards();
      await loadCampaigns();
      if (!entered) return;
      seatTheCampaign({ ...typed.seats });
      touch(lastSeat);
      paintCards();
    },
    leave: () => { entered = false; },
    destroy: () => { entered = false; ctx = null; },
  };
}
