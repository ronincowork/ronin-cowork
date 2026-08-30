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
import { campaignById, campaignOf, campaigns, campaignsFailed, campaignsMessage, createCampaign, loadCampaigns, normalizeSelection } from './campaigns.js';
import { createCampaignIdentitySurface, createDeskProfileSurface, createNewCampaignSurface, createTemplatePreferencesSurface } from './campaign-surfaces.js';
import { buildProjectRoots } from './projectroots.js';
import { DRAG_TYPE, acceptDrops } from './team-drag.js';
import { deskProfiles } from './desk-profile.js';
import { refreshTeams, teamsFromState } from './team-controller.js';
import { request } from './request.js';

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

/**
 * ONE CAMPAIGN SHIPS (owner, 2026-08-30). Until a second can exist, New Campaign is not
 * offered: the column reads as "my settings" and nobody has to learn the word. The
 * surface stays registered so a seat that remembered it does not break; only the card
 * is withheld. Flip this when adding a Campaign becomes real — nothing else changes shape.
 */
const CAMPAIGNS_MAY_MULTIPLY = false;

export function createCampaignView() {
  const { createSurface, createSurfaceHeader, createCard, createMetadata, setSurfaceState } = WorkspaceKit.primitives;
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

  /* ---------- the selector column: the record, then the map ----------
   *
   * THE COLUMN IS THE MAP. A settings page orients with a sequence; a workbench has
   * seats. What carries the orientation here is the column itself: the record at its
   * head (what this Campaign has), the cards in the order a person touches them, and
   * each card's summary being its CURRENT VALUE, not a fixed sentence — an empty or stock
   * value is what draws the eye. Same Kit cards, same selector groups the Cowork
   * workbench uses; nothing here is a second column implementation.
   */
  const column = createSurface({ label: t('campaign', 'Campaign'), className: 'cv-selector' });
  const columnHead = el('div', 'cv-selector-head');
  const columnTitle = el('span', 'cv-selector-title', t('campaign', 'Campaign'));
  const columnFace = el('span', 'cv-selector-face');
  columnHead.append(columnTitle, columnFace);
  column.el.prepend(columnHead);
  // THE RECORD: what this Campaign has, counted live. Reading only — the doors to the
  // work are the app bar's, not this column's.
  const record = el('div', 'cv-record');
  const counts = createMetadata();
  record.append(counts.el);
  column.content.append(record);
  const cards = el('div', 'cv-selector-cards');
  column.content.append(cards);

  /* ---------- what the record says: counted per paint, never stored ---------- */
  let rootsHere = null; // null until /api/project-roots/detail has answered once
  const idOf = () => selected()?.id || '';
  const coworksHere = () => teamsFromState().filter((row) => row.durable && campaignOf(row) === idOf());
  const agentsHere = () => (Array.isArray(S.sessions) ? S.sessions : []).filter((row) => campaignOf(row) === idOf());
  const rootsOf = () => (rootsHere || []).filter((root) => !root.archived && campaignOf(root) === idOf());
  const profileOf = (row) => deskProfiles().find((p) => p.name === row?.desk_profile) || null;
  const readRoots = async () => {
    const r = await request('/api/project-roots/detail', { cache: 'no-store' });
    rootsHere = r.ok && Array.isArray(r.data?.roots) ? r.data.roots : [];
  };

  /**
   * THE MAP, in the order a person touches it, each card saying what is set now. Read at
   * paint so the lexicon is up (KOKUGO § 5). Agent defaults and Templates are the two
   * levels still to land (CAMPAIGN_WORKBENCH legs 4 and 5); Templates is offered as it
   * stands, saying so.
   */
  function OFFERED(row) {
    const profile = profileOf(row);
    const roots = rootsOf().length;
    return [
      { group: t('campaign_view.group_what', 'What it is'), token: CAMPAIGN, heading: t('campaign', 'Campaign'),
        summary: row?.description || t('campaign_view.no_description', 'No description yet.') },
      { group: t('campaign_view.group_reads', 'How it reads'), token: PROFILE, heading: t('cowork.tab_profile', 'Desk profile'),
        summary: profile ? [profile.label || profile.name, profile.skin].filter(Boolean).join(' · ') : t('campaign_view.no_profile', 'As stock — none chosen.') },
      { group: t('campaign_view.group_where', 'Where it works'), token: ROOTS, heading: t('cowork.tab_roots', 'Project roots'),
        summary: rootsHere === null ? '' : roots ? t('campaign_view.roots_n', '{n} roots', { n: roots }) : t('campaign_view.roots_none', 'None — an Agent here has nowhere to work.') },
      { group: t('campaign_view.group_offers', 'What launch offers'), token: TEMPLATES, heading: t('campaign_view.template_prefs', 'Template preferences'),
        summary: t('campaign_view.templates_none', 'Nothing to set yet.') },
    ];
  }

  function paintCards() {
    const row = selected();
    columnTitle.textContent = row?.title || t('campaign', 'Campaign');
    columnFace.textContent = profileOf(row)?.label || '';
    cards.replaceChildren();
    if (campaignsFailed()) {
      record.hidden = true;
      setSurfaceState(column.el, 'failed', t('campaign.read_failed', 'Could not read Campaigns — {message}', { message: campaignsMessage() }));
      return;
    }
    setSurfaceState(column.el, null, '');
    record.hidden = !row;
    counts.set([
      [t('campaign.coworks', 'Coworks'), String(coworksHere().length)],
      [t('campaign_view.agents', 'Agents'), String(agentsHere().length)],
      [t('cowork.tab_roots', 'Project roots'), rootsHere === null ? '…' : String(rootsOf().length)],
    ]);
    const add = (where, token, heading, summary, variant = null) => {
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
      where.append(card.el);
      return card;
    };
    // The same group element the Cowork workbench's selector draws (league-view-surface.js).
    const group = (label) => {
      const section = el('details', 'tw-selector-group');
      section.open = true;
      section.append(el('summary', null, label), el('div', 'tw-selector-group-cards'));
      cards.append(section);
      return section.lastElementChild;
    };
    for (const offer of OFFERED(row)) add(group(offer.group), offer.token, offer.heading, offer.summary);
    if (CAMPAIGNS_MAY_MULTIPLY) add(group(t('campaign_view.group_new', 'Another')), NEW, t('campaign.new', 'New Campaign'), t('campaign_view.new_summary', 'Set the stage. It creates no Cowork and launches no Agent.'), 'dotted');
    // Inside `cards`, so a repaint replaces it — appended to the column it stacked one
    // copy per paint, and said "none" beside a selected Campaign.
    if (!row && !campaigns().length) cards.append(el('p', 'cv-empty', t('campaign.none', 'No Campaigns yet.')));
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
      await Promise.all([loadCampaigns(), refreshTeams(), readRoots()]);
      if (!entered) return;
      seatTheCampaign({ ...typed.seats });
      touch(lastSeat);
      paintCards();
    },
    leave: () => { entered = false; },
    destroy: () => { entered = false; ctx = null; },
  };
}
