/* part of the ronin-cowork client — see js/README.md */
/** Workbench; its Campaign, Cowork or Team scope limits what cards are offered. */
import { WorkspaceKit } from './workspace-kit.js';
import { deleteTeamRoster, membersOfTeam, refreshTeams, subscribe, teamByName, teamsFromState, UNASSIGNED } from './team-controller.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { createAddAgentView } from './add-agent.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createTeamWipeboard } from './team-wipeboard.js';
import { createTeamJikan } from './team-jikan.js';
import { buildMessageQueue, watchMessageQueueAttention } from './message-queue.js';
import { buildDocs } from './docs.js';
import { buildArchives } from './archives.js';
import { homeData, refreshHome, statusLabel } from './home.js';
import { request } from './request.js';
import { sessionsHandlers, teamPageHandlers } from './events.js';
import { createArranger, parseDraft, reportView as sendView } from './team-arrange.js';
import { t } from './lexicon.js';
import { refreshDesks } from './desks.js';
import { acceptDrops as acceptSessionDrops } from './team-drag.js';
import { S } from './state.js';
import { createCampaignIdentity } from './campaign.js';
import { renderTeamConfiguration } from './team-configuration.js';
import { agentTitle, buildTeamMembers, configSignature } from './team-members.js';
import { isCoarse } from './tiledrop.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};
// The roster reads the same frontier as the expanded work record: an explicit pointer
// wins, otherwise the first unfinished rung is current. Keep the agent's actual words
// beside that coordinate instead of substituting its launcher role (CutCode, OddJob…).
const currentWorkStep = (letter) => {
  const ladder = letter?.ladder || [];
  if (!ladder.length) return { label: '', text: '' };
  const finished = (rung) => rung.gate !== undefined
    ? rung.status === 'DONE'
    : (rung.legs || []).length > 0 && rung.legs.every((leg) => leg.status === 'DONE');
  let rungIndex = ladder.findIndex((rung) => !finished(rung));
  let legIndex = -1;
  if (letter.at && Number.isInteger(letter.at.rung) && letter.at.rung >= 1 && letter.at.rung <= ladder.length) {
    rungIndex = letter.at.rung - 1;
    if (Number.isInteger(letter.at.leg)) legIndex = letter.at.leg - 1;
  }
  if (rungIndex < 0) rungIndex = ladder.length - 1;
  const rung = ladder[rungIndex];
  if (rung.gate !== undefined) return { label: letter.chip?.text || t('ladder.gate', 'GATE'), text: rung.gate || '' };
  const legs = rung.legs || [];
  if (legIndex < 0) {
    legIndex = legs.findIndex((leg) => leg.status === 'ACTIVE');
    if (legIndex < 0) legIndex = legs.findIndex((leg) => leg.status !== 'DONE');
  }
  return { label: letter.chip?.text || rung.phase || '', text: legs[legIndex]?.title || rung.phase || '' };
};

const COMMONS = '@commons';
const COWORK = '@cowork';
const NEW = '@new';
const WB_TYPES = Object.freeze({ addAgent: 'team.add-agent', commons: 'team.commons', cron: 'cowork.cron-jobs', desk: 'ronin.desk', terminal: 'session.terminal', roster: 'cowork.team-roster', newTeamForm: 'cowork.new-team-form', newAgent: 'session.new-agent', team: 'team.profile', archives: 'cowork.archives' });
const WB_PROFILES = Object.freeze({ cowork: 'cowork', team: 'team' });

function registerWorkbenchCatalog() {
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: WB_TYPES.commons, header: 'channels', className: 'wk-selector-utility', label: () => t('team.commons_card', 'Team commons'), summary: () => t('team.commons_summary', 'See Docs / Wipeboard / Configuration'), create: ({ workspace, environment }) => environment.teamCommons(workspace) });
  add({ type: WB_TYPES.desk, header: 'channels', label: () => t('cowork.commons', 'Ronin Desk'), create: ({ workspace, environment }) => environment.desk(workspace) });
  // one there"). Drawn contract: ronin-lab `concepts/add-agent-to-team.html`.
  add({ type: WB_TYPES.addAgent, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('add_agent.card', 'Add Agent to Team'), summary: () => t('add_agent.card_summary', 'The Team answers the rest.'), variant: 'dotted', create: ({ workspace, environment }) => environment.addAgent(workspace) });
  add({ type: WB_TYPES.terminal, header: 'terminal', className: 'wk-selector-entity', discover: (_tenant, environment) => environment.sessions(), create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail) });
  add({ type: WB_TYPES.roster, header: 'surface', className: 'wk-selector-utility', label: () => t('league.team_roster', 'Team roster'), create: ({ workspace, environment }) => environment.roster(workspace) });
  add({ type: WB_TYPES.cron, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.channel_cron_jobs', 'Cron jobs'), summary: () => t('team_jikan.all_teams_summary', 'Scheduled messages across every team'), create: ({ workspace, environment }) => environment.cron(workspace) });
  // old new agent workspaces have been made obsolete by yours". The seven-field card and
  // the ＋ New board are gone from this bench and from the repository; a workspace that
  // remembers one resolves to its replacement through `legacyTypes`.
  // Drawn contracts: ronin-lab `concepts/new-team.html` and `concepts/new-agent-condensed.html`.
  add({ type: WB_TYPES.newTeamForm, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('new_team.title', 'New Team'), summary: () => t('new_team.card_summary', 'Template · kit · lead — the drawn form.'), variant: 'dotted', create: ({ workspace, environment }) => environment.newTeamForm(workspace) });
  add({ type: WB_TYPES.newAgent, header: 'surface', className: 'wk-selector-utility', label: () => t('new_agent.title', 'New Agent'), summary: () => t('new_agent.card_summary', 'Session type first — the drawn launch form.'), variant: 'dotted', create: ({ workspace, environment }) => environment.newAgent(workspace) });
  add({ type: WB_TYPES.archives, header: 'surface', className: 'wk-selector-utility', label: () => t('archives.card', 'Rehydrate Archived'), variant: 'dotted', create: ({ workspace, environment }) => environment.archives(workspace) });
  add({ type: WB_TYPES.team, header: 'surface', className: 'wk-selector-entity', discover: (_tenant, environment) => environment.teams(), create: ({ workspace, detail, environment }) => environment.team(workspace, detail) });
  profiles.define(WB_PROFILES.cowork, [WB_TYPES.roster, WB_TYPES.cron, WB_TYPES.team, WB_TYPES.newTeamForm, WB_TYPES.newAgent, WB_TYPES.archives, FEEDBACK_TYPE]);
  // THE TEAM BENCH HAS ONE SHORTCUT: Add Agent to Team. It always births a Cowork Agent;
  // terminal and bare-metal choices stay on the full launch page.
  profiles.define(WB_PROFILES.team, [WB_TYPES.commons, WB_TYPES.terminal, WB_TYPES.addAgent, FEEDBACK_TYPE]);
}
export function createCoworkView(options = {}) {
  registerWorkbenchCatalog();
  const campaign = options.kind === 'cowork';
  const viewKey = campaign ? 'cowork' : 'team';
  const { createSurface, createChannelSurface, createAction } = WorkspaceKit.primitives;
  const { createTerminalTileHost } = WorkspaceKit.adapters;
  const { teamWorkspaceState } = WorkspaceKit.contract;
  const root = el('main', 'tw-view');
  root.dataset.coworkKind = campaign ? 'campaign' : 'team';
  let ctx = null;
  let stopMessageAttention = null;
  let team = '';
  let loaded = ''; // the team whose roster reading is currently drawn
  let unsubscribe = null;
  let entered = false;
  let lastSeat = 'workspace1'; // the workspace last touched — where the next card lands
  const readableTeam = (name) => teamByName(name)?.title || name.split(/[_-]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
  const setBarLabel = () => S.refreshWorkspaceHeader?.();

  /* ---------- the workspaces: two seats, the roster between them, one commons ---------- */
  const makeSeat = (id, label) => {
    const surface = createSurface({ label, className: 'tw-terminal', flush: true, header: false });
    const pool = createWarmTerminalPool({
      createHost: (options) => createTerminalTileHost(options),
      container: surface.content,
      streamCap: 2,
    });
    return { id, surface, pool, empty: null };
  };
  const paintSeats = () => {
    for (const seat of Object.values(seats)) {
      if (seat.pool.active) seat.empty?.el.remove();
      else if (!seat.empty) {
        const blank = createSurface({ label: t('team.workspace_blank', 'Workspace'), className: 'tw-blank' });
        // The header already says Workspace; the body saying it again read as a stutter
        blank.content.append(el('p', 'tw-blank-word', t('team.workspace_empty', 'empty')));
        seat.empty = { el: blank.el, mount: () => {}, destroy: () => blank.el.remove() };
        seat.surface.content.append(seat.empty.el);
      } else if (!seat.empty.el.isConnected) seat.surface.content.append(seat.empty.el);
    }
  };
  const markSelected = (id) => {
    lastSeat = id;
    for (const seat of Object.values(seats)) {
      for (const tile of seat.surface.content.querySelectorAll('.tile')) tile.classList.toggle('active', seat.id === id);
    }
  };
  const touch = (id) => { bench?.select(id); };
  const seats = {
    workspace1: makeSeat('workspace1', t('team.workspace_1', 'Workspace 1')),
    workspace2: makeSeat('workspace2', t('team.workspace_2', 'Workspace 2')),
    workspace3: makeSeat('workspace3', t('team.workspace_3', 'Workspace 3')),
    workspace4: makeSeat('workspace4', t('team.workspace_4', 'Workspace 4')),
  };
  let bench = null;
  const cellPlace = (id, value) => bench?.placeNode(id, value);
  const cellHolding = (id) => bench?.holding(id) ?? null;
  const liveSeats = () => bench?.visibleIds() || [];

  const rosterNote = el('span', 'tw-roster-note');
  const shapeBtn = document.getElementById('shapecycle');
  let rosterTitle = null;

  const service = (node) => ({ el: node, mount: () => {}, enter: () => {}, leave: () => {}, destroy: () => {} });
  // Each workspace owns its rendered Commons instance and local presentation state.
  const createTeamCommons = () => {
    const wipeboard = createTeamWipeboard();
    const jikan = createTeamJikan();
    const docsPane = el('div', 'home-docs tw-docs');
    const docs = buildDocs(null, docsPane, () => entered && docsPane.isConnected,
      (name) => membersOfTeam(team).some((m) => m.name === name), () => teamByName(team)?.repos || []);
    const docsService = {
      el: docsPane, mount: () => {},
      enter: () => { void refreshHome(); docs.enter(); },
      leave: () => {}, destroy: () => {},
    };
    const config = el('div', 'tw-config');
    const messages = el('div', 'tw-messages');
    const messageLabel = t('workspace.channel_agent_message_queue', 'Agent Message Queue');
    let messageTab = null;
    let retainedCount = 0;
    let chooseQueueOnOpen = false;
    const paintMessageAttention = () => {
      if (!messageTab) return;
      messageTab.dataset.attention = String(retainedCount > 0);
      messageTab.textContent = messageLabel;
      if (chooseQueueOnOpen) {
        if (retainedCount > 0) channels.select('agent-message-queue');
        chooseQueueOnOpen = false;
      }
    };
    const messageQueue = buildMessageQueue(messages, (count) => { retainedCount = count; paintMessageAttention(); });
    const channels = createChannelSurface({
      label: t('team.commons', 'Team commons'),
      channels: [
        { id: 'docs', label: t('workspace.channel_docs', 'Docs') },
        { id: 'wipeboard', label: t('workspace.channel_wipeboard', 'Wipeboard') },
        { id: 'agent-message-queue', label: messageLabel },
        { id: 'cron-jobs', label: t('workspace.channel_cron_jobs', 'Cron jobs') },
        { id: 'team-configuration', label: t('workspace.channel_team_configuration', 'Team Configuration') },
      ],
      selected: 'docs',
      services: { wipeboard, docs: docsService, 'agent-message-queue': { el: messages, mount: () => {}, enter: messageQueue.enter, leave: messageQueue.leave, destroy: messageQueue.destroy }, 'cron-jobs': jikan, 'team-configuration': service(config) },
    });
    messageTab = channels.tabs.querySelector('[data-service="agent-message-queue"]');
    channels.tabs.addEventListener('click', () => { chooseQueueOnOpen = false; });
    paintMessageAttention();
    channels.el.dataset.workbenchSurface = COMMONS;
    return {
      el: channels.el, channels, wipeboard, jikan, docs, config, messageQueue,
      attendQueueOnOpen: () => {
        chooseQueueOnOpen = true;
        if (retainedCount > 0) paintMessageAttention();
      },
    };
  };
  const teamCommons = Object.fromEntries(Object.keys(seats).map((id) => [id, createTeamCommons()]));
  const extras = new Set();
  // One instance per seat, like every other surface: a birth returns to the workspace
  // whose form made it, which is the property this door exists for.
  const addAgentBySeat = Object.fromEntries(Object.keys(seats).map((id) => {
    const view = createAddAgentView(WorkspaceKit, {
      team: () => (campaign || team === UNASSIGNED ? '' : team),
      roster: () => teamByName(team) || null,
      members: () => membersOfTeam(team),
      connect: (name) => connectSession(name, id),
      fullLaunch: () => ctx?.navigate('launch'),
    });
    return [id, { el: view.el, enter: () => view.enter() }];
  }));
  const campaignIdentity = createCampaignIdentity((name) => {
    if (entered && campaign) renderCards([]);
  });
  // its roster exists, so the form that made it hands the workspace over to it and goes
  // back to empty. Staffing happens from inside the Team, through Add Agent.
  const newTeamFormBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => {
    const view = createNewTeamFormView(WorkspaceKit, { created: async (name) => { await refreshTeams(); bench.place(WB_TYPES.team, id, { key: name, label: readableTeam(name) }); } });
    return [id, { el: view.el, enter: () => view.enter() }];
  })) : {};
  // The drawn New Agent, per seat: a birth returns to the workspace whose form made it.
  const newAgentBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => {
    const view = createNewAgentView(WorkspaceKit, { connect: (name) => connectSession(name, id) });
    // The detail rides through: `S.showNewSession(prompt)` seeds the form's Instructions.
    return [id, { el: view.el, enter: (detail) => view.enter(detail) }];
  })) : {};
  // carried Campaign identity, Project roots and Templates behind a tab strip here; those
  // are Campaign-level and are now surfaces of Campaign Manage (js/campaign-view.js).
  // The Team roster stayed — a Cowork is not Campaign configuration — and is its own
  // surface rather than the one tab left in a strip.
  const teamRosterBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => [id, createTeamRosterSurface()])) : {};
  const cronBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => { const surface = createSurface({ label: t('workspace.channel_cron_jobs', 'Cron jobs'), className: 'tw-cron' }); const room = createTeamJikan({ universal: true, teams: () => teamsFromState().filter((item) => !item.holding).map((item) => item.name) }); surface.content.append(room.el); return [id, { el: surface.el, room }]; })) : {};
  // seated in a workspace, grouped by Team of record, each row's act a labelled button.
  // A rehydrated session lands in the workspace whose surface woke it, like a birth.
  const archivesBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => {
    const surface = createSurface({ label: t('archives.card', 'Rehydrate Archived'), className: 'tw-archives' });
    const host = el('div');
    surface.content.append(host);
    const room = buildArchives({ connect: (name) => connectSession(name, id) }, host);
    return [id, { el: surface.el, room }];
  })) : {};
  const environment = {
    feedback: (workspace) => createFeedbackSurface(() => bench.place(campaign ? WB_TYPES.roster : WB_TYPES.commons, workspace)),
    teamCommons: (id) => ({ el: teamCommons[id].el, show: (detail = {}) => { const item = teamCommons[id]; if (!detail.doc && !detail.tab) item.attendQueueOnOpen(); item.channels.enter(ctx); if (detail.doc) { item.channels.select('docs'); void item.docs.open(detail.doc); } else if (detail.tab) item.channels.select(detail.tab); } }),
    terminal: (id, detail) => ({ el: seats[id].surface.el, show: () => putSession(detail.key, id) }),
    roster: (id) => ({ el: teamRosterBySeat[id].el, show: () => teamRosterBySeat[id].render() }),
    cron: (id) => ({ el: cronBySeat[id].el, show: () => cronBySeat[id].room.enter() }),
    newTeamForm: (id) => ({ el: newTeamFormBySeat[id].el, show: () => void newTeamFormBySeat[id].enter() }),
    newAgent: (id) => ({ el: newAgentBySeat[id].el, show: (detail) => void newAgentBySeat[id].enter(detail) }),
    addAgent: (id) => ({ el: addAgentBySeat[id].el, show: () => addAgentBySeat[id].enter() }),
    archives: (id) => ({ el: archivesBySeat[id].el, show: () => void archivesBySeat[id].room.enter() }),
    team: (id, detail) => createLeagueTeamSurface(detail.key, id),
    sessions: () => campaign ? [] : membersOfTeam(team).map((member) => {
      const reading = readingsOf(member);
      return { key: member.name, label: agentTitle(member), className: 'team-agent-card', summary: reading.step, metadata: reading.lines, mark: member.team_lead ? '人' : null, onPointerEnter: () => armPrewarm(member.name), onPointerLeave: disarmPrewarm };
    }),
    teams: () => campaign ? [...teamsFromState().filter((candidate) => !candidate.holding), { name: UNASSIGNED, title: t('league.ronin', 'Ronin: no team'), objective: '' }].map((item) => ({ key: item.name, label: item.title || readableTeam(item.name), summary: item.objective || '' })) : [],
  };
  bench = WorkspaceKit.workbench.create({
    profile: campaign ? WB_PROFILES.cowork : WB_PROFILES.team,
    tenant: { kind: campaign ? 'cowork' : 'team', team: () => team }, environment,
    defaultNode: (id) => seats[id].surface.el,
    label: campaign ? t('campaign', 'Campaign') : t('team.roster_title', 'Team Roster'),
    title: () => campaign ? campaignIdentity.name() || t('campaign', 'Campaign') : team ? t('team.roster_of', 'Roster: {team}', { team: readableTeam(team) }) : t('team.roster_title', 'Team Roster'),
    actions: [rosterNote], shapeControl: shapeBtn, deferSelector: true,
    installDrop: (cell, id) => acceptSessionDrops(cell, () => id, (name, at) => arrange({ [at]: { session: name } })),
    onSelect: markSelected,
    onStateChange: () => remember(), onPlacement: () => remember(),
  });
  rosterTitle = bench.selectorHeader?.title ?? null;
  root.append(bench.host);
  // A REMEMBERED PLACEMENT OUTLIVES THE SURFACE IT NAMED. `@new` and `@new-team` were
  // the retired board and the seven-field card; a workspace that still remembers one
  // opens its replacement rather than nothing.
  const legacyTypes = { [COMMONS]: WB_TYPES.commons, [COWORK]: WB_TYPES.desk, [NEW]: WB_TYPES.newAgent, 'session.new': WB_TYPES.newAgent, '@new-team': WB_TYPES.newTeamForm, 'cowork.new-team': WB_TYPES.newTeamForm, '@team-roster': WB_TYPES.roster };
  const tokenOf = (node) => node?.dataset?.workbenchSurface || '';
  /** Which surface token this cell holds, or '' for its own seat. */
  const heldSurface = (id) => tokenOf(cellHolding(id));
  const surfaceRequest = (token) => token && typeof token === 'object' ? { type: token.type, detail: { key: token.key || '' } } : token?.startsWith('@team:') ? { type: WB_TYPES.team, detail: { key: token.slice(6) } } : { type: legacyTypes[token] || token, detail: {} };
  const whereIs = (token) => { const request = surfaceRequest(token); return bench?.locations(request.type, request.detail.key)[0] || ''; };
  /** A surface other than the seat's own is in this workspace. */
  const surfaceIn = (id) => !bench?.isDefault(id);
  const holds = (id) => surfaceIn(id) ? heldSurface(id) : seats[id].pool.active;
  /** ANY surface in: wherever it was, that seat's surface comes back; the cell it lands on
   *  keeps its tiles while it is out. One trade for every surface, present and future. */
  const putSurface = (token, id, tab = '', doc = '') => { const request = surfaceRequest(token); return bench?.place(request.type, id, { ...request.detail, tab, doc }) || false; };
  const isShown = (name) => Object.values(seats).some((seat) => seat.pool.active === name && !surfaceIn(seat.id));
  const remember = () => { ctx?.patchViewState(viewKey, { ...bench?.snapshot(), seats: Object.fromEntries(Object.keys(seats).map((id) => [id, surfaceIn(id) ? (bench.resourceAt(id) ? { type: heldSurface(id), key: bench.resourceAt(id) } : heldSurface(id)) : seats[id].pool.active])) }); reportView(); };
  const lead = () => membersOfTeam(team).find((m) => m.team_lead)?.name || '';

  const putCommons = (id, tab = '', doc = '') => putSurface(COMMONS, id, tab, doc);
  const putCowork = (id, tab = '') => putSurface(COWORK, id, tab);
  // `tejun-teampage … workspace1=new` still says "the door work starts at"; that door is
  // the drawn New Agent now (TOOLS.md's `new` word is unchanged for the owner).
  const putNew = (id) => putSurface(WB_TYPES.newAgent, id);
  const setCount = (n) => bench.setCount(n);
  /** Show ANY live session in the selected workspace — a member, or one the owner picked
   *  from the Roster tab or a newborn from the launcher. Non-members ride the pool as
   *  extras until they leave. */
  const connectSession = (name, id = lastSeat) => {
    if (!name) return false;
    if (!membersOfTeam(team).some((m) => m.name === name)) extras.add(name);
    syncPools(membersOfTeam(team));
    return putSession(name, id);
  };
  /** The seat back, with nothing in it: its tiles go; the lead comes back warm on the next paint. */
  const emptySeat = (id) => {
    bench.restoreDefault(id);
    delete seats[id].surface.el.dataset.workbenchSurface;
    delete seats[id].surface.el.dataset.workbenchResource;
    seats[id].pool.destroyAll();
    ensureLeadHot(membersOfTeam(team));
    touch(id);
    paintSeats();
    remember();
  };
  /** Terminal in: the seat's surface comes back as it was; a seat that never showed
   *  anyone gets the lead. */
  const putTerminal = (id) => {
    bench.restoreDefault(id);
    delete seats[id].surface.el.dataset.workbenchSurface;
    delete seats[id].surface.el.dataset.workbenchResource;
    if (!seats[id].pool.active && lead() && seats[id].pool.has(lead())) seats[id].pool.show(lead(), false);
    touch(id);
    paintSeats();
    remember();
  };
  /** A session in: the terminal comes in if the commons was there, then the tile shows it. */
  const putSession = (name, id, focus = true) => {
    if (!seats[id].pool.has(name)) return false;
    if (surfaceIn(id)) cellPlace(id, seats[id].surface.el);
    // Never steal keyboard focus on a coarse pointer: focusing the terminal summons
    // Typing there is a deliberate tap into the composer, exactly as on the phone.
    if (!seats[id].pool.show(name, focus && !isCoarse())) return false;
    touch(id);
    paintSeats();
    remember();
    return true;
  };

  /* ---------- one controller, two callers ---------- */
  // Everything that changes this page goes through arrange(): the C/T buttons and the
  // roster cards call it, and so does a draft an agent hands in with tejun-teampage
  const arranger = createArranger({
    showColumn: (name) => { name = name === 'roster' ? 'selector' : name; if (bench.arrangement.state().hidden.includes(name)) bench.arrangement.toggle(name); },
    hideColumn: (name) => { name = name === 'roster' ? 'selector' : name; if (!bench.arrangement.state().hidden.includes(name)) bench.arrangement.toggle(name); },
    moveColumn: (name, index) => bench.arrangement.move(name === 'roster' ? 'selector' : name, index),
    putSession: (name, ws) => putSession(name, ws, false),
    putCommons,
    putCowork,
    putNew,
    putSurface,
    putTerminal,
    emptySeat,
    setCount,
  });
  const arrange = (draft) => {
    const did = arranger.apply(draft);
    renderCards(membersOfTeam(team));
    reportView();
    return did;
  };
  /** What this tab shows — reported to Ronin so an agent can read it (tejun-teampage). */
  const TAB = (() => {
    try {
      let id = sessionStorage.getItem('ronin.team.tab');
      if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('ronin.team.tab', id); }
      return id;
    } catch (_) { return 'tab'; }
  })();
  const view = () => {
    const a = bench.arrangement.state();
    const workspaces = {};
    for (const id of liveSeats()) {
      const token = heldSurface(id);
      workspaces[id] = token ? { holds: token, resource: bench.resourceAt(id) } : seats[id].pool.active ? { holds: 'session', session: seats[id].pool.active } : { holds: 'empty' };
    }
    return { team, selected: lastSeat, count: bench.count(), order: [...a.order], hidden: [...a.hidden], workspaces };
  };
  let reportTimer = 0;
  const reportView = () => { if (entered && team && team !== UNASSIGNED) void sendView(team, TAB, view()); };
  // A draft from an agent: for this tab if it names it (the tab that shows the agent),
  // else for every tab on the team. A line in the roster header says who arranged it.
  let noteTimer = 0;
  const onDraft = (m) => {
    if (!entered || m.team !== team || (m.tab && m.tab !== TAB)) return;
    const { draft, errors } = parseDraft(m.tokens || [], m.from);
    if (errors.length) return;
    arrange(draft);
    rosterNote.textContent = t('team.arranged_by', 'arranged by {from}', { from: m.from });
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => { rosterNote.textContent = ''; }, 6000);
  };

  /** Fill each empty workspace: what it remembers first, else the defaults — the lead
   *  left, the commons right. Runs on enter AND when the roster arrives, since on a cold
   *  reload the roster is not known yet at enter. */
  let remembered = {};
  const seatTheTeam = () => {
    for (const id of liveSeats()) {
      if (holds(id)) continue;
      const wanted = remembered[id];
      const request = surfaceRequest(wanted);
      if (WorkspaceKit.workbench.library.has(request.type) && bench.place(request.type, id, request.detail)) continue;
      else if (wanted && seats[id].pool.has(wanted)) putSession(wanted, id, false);
      // A remembered session the roster does not have: wait while the roster is still
      // arriving, then let it go — a workspace waiting forever is the blank the owner met.
      else if (wanted && loaded !== team) continue;
      else if (lead() && !isShown(lead())) putSession(lead(), id, false);
    }
  };

  const syncPools = (members) => {
    const live = new Set((homeData || []).map((s) => s.name));
    for (const x of [...extras]) if (!live.has(x) && live.size) extras.delete(x); // a gone extra leaves the pool
    const names = [...new Set([...members.map((m) => m.name), ...extras])];
    for (const seat of Object.values(seats)) seat.pool.sync(names);
    paintSeats();
  };
  // THE LEAD IS ALWAYS HOT (owner: "the team manager is always hot, regardless") — pinned
  // and kept streaming in workspace 1, its default home.
  const ensureLeadHot = (members) => {
    const leads = members.filter((m) => m.team_lead).map((m) => m.name);
    seats.workspace1.pool.setPinned(leads);
    for (const name of leads) seats.workspace1.pool.keepHot(name);
  };
  let dwellTimer = 0;
  const armPrewarm = (name) => {
    window.clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(() => seats[lastSeat].pool.prewarm(name), 150);
  };
  const disarmPrewarm = () => window.clearTimeout(dwellTimer);

  // taken"). The readings ride /api/home's row — the same row the Commons roster reads:
  // MICHI's SHINGO chip, the status, the model, the context gauge. Read on entry and every
  // five seconds while entered (the Commons' own cadence); nothing is guessed when a
  // reading is absent. RIREKI's cherry-pick or summary joins the row when the service
  // contributes it; there is no field for it today.
  let rows = new Map(); // name -> the /api/home row
  const leagueTeamSurfaces = new Map(), openTeam = (name) => { const url = new URL(location.href); url.hash = `#/team/${encodeURIComponent(name)}`; window.open(url.href, '_blank', 'noopener'); };
  const createLeagueTeamSurface = (name, id) => {
    const cacheKey = `${id}\0${name}`;
    if (leagueTeamSurfaces.has(cacheKey)) {
      const cached = leagueTeamSurfaces.get(cacheKey); cached.render?.(); return cached;
    }
    const label = name === UNASSIGNED ? t('league.ronin', 'Ronin: no team') : readableTeam(name), team = teamByName(name);
    const launch = createAction({ label: t('league.launch_team', 'Launch'), size: 'compact', action: () => openTeam(name) });
    const remove = createAction({ label: t('league.delete_team', 'Delete team'), kind: 'danger', size: 'compact', action: async () => { const count = membersOfTeam(name).length; if (!window.confirm(t('league.delete_team_confirm', 'Delete {team}? {count} Agents will lose this Team membership.', { team: name, count }))) return; const result = await deleteTeamRoster(name); if (!result.ok) { surface.setState('failed', result.message); return; } for (const seat of bench.locations(WB_TYPES.team, name)) emptySeat(seat); for (const key of [...leagueTeamSurfaces.keys()]) if (key.endsWith(`\0${name}`)) leagueTeamSurfaces.delete(key); } });
    const surface = createSurface({ label, className: 'league-team-edit', actions: name === UNASSIGNED ? [launch] : [launch, remove] });
    surface.content.classList.add('league-team-edit-content');
    // Same contract as renderConfig below: every publish lands here, so the surface only
    // rebuilds — and refetches the configuration's catalogs — when what it shows moved.
    let seen = '';
    const render = () => {
      const signature = configSignature(name);
      if (signature === seen) return;
      seen = signature;
      const holding = name === UNASSIGNED;
      const current = teamByName(name);
      const roster = buildTeamMembers(name, { holding, onChanged: () => { surface.setState(); render(); }, onFailed: (message) => surface.setState('failed', message) });
      if (holding) { surface.content.replaceChildren(roster); return; }
      const config = el('section', 'league-team-config');
      config.append(el('h3', 'league-team-roster-title', t('workspace.channel_team_configuration', 'Team Configuration')));
      const fields = el('div', null); config.append(fields);
      renderTeamConfiguration(fields, { ...current, durable: true }, { createAction, onSaved: async () => {
        await refreshTeams();
        render();
      } });
      surface.content.replaceChildren(roster, config);
    };
    render();
    const out = { el: surface.el, render }; leagueTeamSurfaces.set(cacheKey, out); return out;
  };
  const refreshLeagueTeamSurfaces = () => {
    for (const view of leagueTeamSurfaces.values()) view.render?.();
  };
  let homeTimer = 0;
  const readRows = async () => {
    void refreshDesks().catch(() => false);
    void refreshTeams().then(() => { if (entered) paint(); });
    const r = await request('/api/home', { cache: 'no-store' });
    if (!r.ok || !Array.isArray(r.data) || !entered) return;
    rows = new Map(r.data.map((row) => [row.name, row]));
    onSessions();
    renderCards(membersOfTeam(team));
    // The configuration reads the same refreshed roster, but renderConfig only redraws
    // when something it shows moved — this tick is a freshness check, not a repaint.
    const roster = teamByName(team);
    renderConfig(roster.durable ? roster : null, membersOfTeam(team));
  };
  // MEMBERSHIP IS LIVE, AND SO ARE THE SEATS. The team controller only publishes on
  // `refreshTeams()`, which this page runs once on entry; the cards, though, are drawn
  // off `S.sessions`, which the events feed keeps current. A session that joined the team
  // after entry therefore had a card and no seat in either pool — its card clicked and
  // whole paint again whenever the member set or the 人 changes: on the feed's event, and
  // on the five-second row read as the fallback.
  const membership = (members) => members.map((m) => m.name + (m.team_lead ? ' 人' : '')).join('\n');
  let seenMembers = '';
  const onSessions = () => {
    if (!entered || !team || loaded !== team) return;
    if (membership(membersOfTeam(team)) === seenMembers) return;
    paint();
  };
  const readingsOf = (m) => {
    const row = rows.get(m.name) || {};
    const current = currentWorkStep(row.tegami);
    const state = [statusLabel(row.status), row.ctx != null ? `⛽ ${row.ctx}%` : ''].filter(Boolean).join(' · ');
    return {
      step: current.label,
      lines: [current.text, (row.model || '').toLowerCase(), state].filter(Boolean),
    };
  };
  function renderCards(members) {
    if (rosterTitle) rosterTitle.textContent = campaign ? campaignIdentity.name() || t('campaign', 'Campaign') : team ? t('team.roster_of', 'Roster: {team}', { team: readableTeam(team) }) : t('team.roster_title', 'Team Roster');
    bench.refreshSelector();
  }

  // team configuration on and off"). Every tick and publish lands here; the panel is
  // torn down only when configSignature says something it draws actually moved.
  let seenConfig = '';
  function renderConfig(roster, live) {
    const signature = configSignature(team);
    if (signature === seenConfig) return;
    seenConfig = signature;
    for (const commons of Object.values(teamCommons)) {
      if (!roster) { renderTeamConfiguration(commons.config, null, { createAction }); continue; }
      const fields = el('div');
      const config = el('section', 'league-team-config');
      config.append(el('h3', 'league-team-roster-title', t('workspace.channel_team_configuration', 'Team Configuration')), fields);
      const members = buildTeamMembers(team, { onChanged: () => { commons.channels.setState(); paint(); }, onFailed: (message) => commons.channels.setState('failed', message) });
      commons.config.replaceChildren(members, config);
      renderTeamConfiguration(fields, { ...roster, durable: true }, { createAction, onSaved: async (saved) => {
        await refreshTeams();
        setBarLabel(); renderConfig(saved, live); paint();
      } });
    }
  }
  /* ---------- reading ---------- */
  const paint = () => {
    const members = membersOfTeam(team);
    const roster = teamByName(team);
    seenMembers = membership(members);
    syncPools(members);
    ensureLeadHot(members);
    seatTheTeam();
    touch(lastSeat);
    renderCards(members);
    renderConfig(roster.durable ? roster : null, members);
    // THE BOARD IS ASSUMED: the roster's wipeboard id, or the team's own name for a
    // tag-only team. The server creates it on open, so the slice never meets a void.
    for (const commons of Object.values(teamCommons)) {
      commons.wipeboard.setBoard(team === UNASSIGNED ? '' : (roster.durable && roster.wipeboard) || team);
      // JIKAN is by active team: the tag-only or durable team, and its live members for the To list.
      commons.jikan.setTeam(team === UNASSIGNED ? '' : team, members.map((m) => m.name));
    }
  };

  async function load(name) {
    if (!name) {
      syncPools([]);
      renderCards([]);
      renderConfig(null, []);
      loaded = '';
      return;
    }
    const result = await refreshTeams();
    if (!entered || team !== name) return; // the destination moved while this was in flight
    loaded = name;
    setBarLabel();
    rosterTitle.textContent = t('team.roster_of', 'Roster: {team}', { team: readableTeam(name) });
    if (!result.live.ok) {
      renderCards([]);
      renderConfig(null, []);
      return;
    }
    const members = membersOfTeam(name);
    paint();
  }

  return {
    el: root, glyph: campaign ? '⛩' : '人',
    // The ViewHost draws the Kit's layout map in the bar for this while the view is active.
    arrangement: bench.arrangement,
    // The owner's per-tab name distinguishes several Workbench tabs. Teams defaults to
    // its page name; a Team defaults to the Team name. createWorkspace adds Ronin.
    title: ({ param, viewState }) => {
      const fallback = campaign ? t('campaign.coworks', 'Teams') : (param || t('team.team', 'Team'));
      const name = viewState?.(viewKey)?.tabName;
      return name ? { bare: `${name} · ${fallback}` } : fallback;
    },
    tabName: {
      get: () => ctx?.viewState(viewKey)?.tabName || '',
      placeholder: () => campaign ? t('campaign.coworks', 'Teams') : team || t('team.team', 'Team'),
      set: (value) => { ctx?.patchViewState(viewKey, { tabName: String(value || '').trim() }); },
    },
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    mount: (_host, context) => {
      ctx = context;
      for (const commons of Object.values(teamCommons)) commons.channels.mount(context);
      unsubscribe = subscribe(() => {
        if (!entered) return;
        refreshLeagueTeamSurfaces();
        if (team) paint();
      });
      teamPageHandlers.add(onDraft);
      sessionsHandlers.add(onSessions);
    },
    enter: (context) => {
      ctx = context;
      entered = true;
      seenConfig = ''; // a fresh entry always paints the configuration once
      stopMessageAttention?.();
      stopMessageAttention = watchMessageQueueAttention();
      if (campaign) void campaignIdentity.load();
      for (const seat of Object.values(seats)) seat.pool.destroyAll();
      team = campaign ? '' : context.param || context.state?.team || '';
      setBarLabel();
      const typed = teamWorkspaceState(context.state, context.viewState(viewKey), bench.declaration);
      // What each workspace remembers holding; the old one-seat focusedSession lands in
      // the first workspace, once. With nothing remembered: the lead left, the commons right.
      bench.enter({ arrangement: typed.arrangement, count: context.viewState(viewKey)?.count, selected: context.viewState(viewKey)?.selected });
      remembered = { ...typed.seats };
      if (!Object.keys(remembered).length) remembered = typed.focusedSession ? { workspace1: typed.focusedSession } : {};
      const members = membersOfTeam(team);
      syncPools(members);
      ensureLeadHot(members);
      seatTheTeam();
      paintSeats();
      touch(liveSeats().find((id) => !heldSurface(id)) || 'workspace1');
      // The ＋ New door — the bar, ⌃⇧N, and the gbrain tab's "ask the assistant" — opens
      // the drawn New Agent now. A prompt rides as its Instructions (js/new-agent.js).
      S.showNewSession = (prompt = '') => {
        bench.place(WB_TYPES.newAgent, lastSeat || 'workspace1', prompt ? { prompt } : {});
      };
      S.connectSession = (name) => connectSession(name);
      if (campaign) void refreshTeams().then(() => renderCards([]));
      else if (team !== loaded) void load(team);
      void readRows();
      window.clearInterval(homeTimer);
      homeTimer = window.setInterval(() => void readRows(), 5000);
      reportView();
      window.clearInterval(reportTimer);
      reportTimer = window.setInterval(reportView, 10000);
    },
    leave: () => {
      // Leaving the destination closes every Team transport; the seats remember what
      // they held and get it back on re-entry.
      entered = false;
      stopMessageAttention?.();
      stopMessageAttention = null;
      disarmPrewarm();
      window.clearInterval(homeTimer);
      window.clearInterval(reportTimer);
      // No transport survives outside the entered Team destination.
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); seat.empty = null; }
      for (const commons of Object.values(teamCommons)) commons.channels.leave();
      S.showNewSession = null;
      S.connectSession = null;
      bench.leave();
      S.refreshWorkspaceHeader?.();
    },
    destroy: () => {
      entered = false;
      stopMessageAttention?.();
      stopMessageAttention = null;
      campaignIdentity.destroy();
      unsubscribe?.();
      unsubscribe = null;
      teamPageHandlers.delete(onDraft);
      sessionsHandlers.delete(onSessions);
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); }
      for (const commons of Object.values(teamCommons)) commons.channels.destroy();
    },
  };
}
