/* part of the ronin-cowork client — see js/README.md */
/** Workbench; its Campaign, Cowork or Team scope limits what cards are offered. */
import { WorkspaceKit } from './workspace-kit.js';
import { deleteTeamRoster, membersOfTeam, refreshTeams, sessionsAvailableToTeam, setTeamLead, setTeamMembership, subscribe, teamByName, teamsFromState, UNASSIGNED } from './team-controller.js';
import { createNewTeamView } from './new-team.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createTeamWipeboard } from './team-wipeboard.js';
import { buildDocs } from './docs.js';
import { buildLauncher } from './launcher.js';
import { homeData, loadPresets, loadSavedLaunches, refreshHome, roleData, statusLabel } from './home.js';
import { request } from './request.js';
import { humanAge } from './shingo.js';
import { sessionsHandlers, teamPageHandlers } from './events.js';
import { createArranger, parseDraft, reportView as sendView } from './team-arrange.js';
import { t } from './lexicon.js';
import { deskReadout, desksOf, refreshDesks } from './desks.js';
import { acceptDrops as acceptSessionDrops } from './team-drag.js';
import { S } from './state.js';
import { createCampaignIdentity } from './campaign.js';
import { renderTeamConfiguration } from './team-configuration.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

const COMMONS = '@commons';
const COWORK = '@cowork';
const NEW = '@new';
const WB_TYPES = Object.freeze({ commons: 'team.commons', desk: 'ronin.desk', newSession: 'session.new', terminal: 'session.terminal', roster: 'cowork.team-roster', newTeam: 'cowork.new-team', team: 'team.profile' });
const WB_PROFILES = Object.freeze({ cowork: 'cowork', team: 'team' });

function registerWorkbenchCatalog() {
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({ type: WB_TYPES.commons, header: 'channels', label: () => t('team.commons_card', 'Team commons'), create: ({ workspace, environment }) => environment.teamCommons(workspace) });
  add({ type: WB_TYPES.desk, header: 'channels', label: () => t('cowork.commons', 'Ronin Desk'), create: ({ workspace, environment }) => environment.desk(workspace) });
  add({ type: WB_TYPES.newSession, header: 'surface', label: () => t('league.new_agent', 'New Agent'), variant: 'dotted', create: ({ workspace, environment }) => environment.newSession(workspace) });
  add({ type: WB_TYPES.terminal, header: 'terminal', discover: (_tenant, environment) => environment.sessions(), create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail) });
  add({ type: WB_TYPES.roster, header: 'surface', label: () => t('league.team_roster', 'Team roster'), create: ({ workspace, environment }) => environment.roster(workspace) });
  add({ type: WB_TYPES.newTeam, header: 'surface', label: () => t('new_team.title', 'New Team'), variant: 'dotted', create: ({ workspace, environment }) => environment.newTeam(workspace) });
  add({ type: WB_TYPES.team, header: 'surface', discover: (_tenant, environment) => environment.teams(), create: ({ workspace, detail, environment }) => environment.team(workspace, detail) });
  profiles.define(WB_PROFILES.cowork, [WB_TYPES.roster, WB_TYPES.team, WB_TYPES.newTeam, WB_TYPES.newSession]);
  profiles.define(WB_PROFILES.team, [WB_TYPES.commons, WB_TYPES.terminal, WB_TYPES.newSession]);
}
export function createCoworkView(options = {}) {
  registerWorkbenchCatalog();
  const campaign = options.kind === 'cowork';
  const viewKey = campaign ? 'cowork' : 'team';
  const { createSurface, createChannelSurface, createMetadata, createAction, createActionBar } = WorkspaceKit.primitives;
  const { createTerminalTileHost } = WorkspaceKit.adapters;
  const { teamWorkspaceState } = WorkspaceKit.contract;
  const root = el('main', 'tw-view');
  root.dataset.coworkKind = campaign ? 'campaign' : 'team';
  let ctx = null;
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
        blank.content.append(el('p', 'tw-blank-word', t('team.workspace_blank', 'Workspace')));
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
    const docsPane = el('div', 'home-docs tw-docs');
    const docs = buildDocs(null, docsPane, () => entered && docsPane.isConnected,
      (name) => membersOfTeam(team).some((m) => m.name === name), () => teamByName(team)?.repos || []);
    const docsService = {
      el: docsPane, mount: () => {},
      enter: () => { void refreshHome(); docs.enter(); },
      leave: () => {}, destroy: () => {},
    };
    const config = el('div', 'tw-config');
    const channels = createChannelSurface({
      label: t('team.commons', 'Team commons'),
      channels: [
        { id: 'docs', label: t('workspace.channel_docs', 'Docs') },
        { id: 'wipeboard', label: t('workspace.channel_wipeboard', 'Wipeboard') },
        { id: 'team-configuration', label: t('workspace.channel_team_configuration', 'Team Configuration') },
      ],
      selected: 'docs',
      services: { wipeboard, docs: docsService, 'team-configuration': service(config) },
    });
    channels.el.dataset.workbenchSurface = COMMONS;
    return { el: channels.el, channels, wipeboard, docs, config };
  };
  const teamCommons = Object.fromEntries(Object.keys(seats).map((id) => [id, createTeamCommons()]));
  // ＋ NEW SESSION IS A SURFACE (owner, 2026-08-27): the commons' launcher, in a workspace.
  // Roster add and bar New both put the new session in the selected workspace (`connect`).
  const newLabel = t('league.new_agent', 'New Agent');
  const extras = new Set();
  const newBySeat = Object.fromEntries(Object.keys(seats).map((id) => {
    const surface = createSurface({ label: newLabel, className: 'tw-new' });
    const body = el('div', 'tw-new-body');
    const host = el('div', 'home-null');
    body.append(host);
    surface.content.append(body);
    surface.el.dataset.workbenchSurface = NEW;
    // Empty Teams exist only in the durable roster projection; a Team page defaults to
    // staffing the Team it shows. A birth returns to the workspace whose launcher made it.
    const launcher = buildLauncher({ index: `ws-${id}`, connect: (name) => connectSession(name, id),
      teams: () => teamsFromState().filter((candidate) => !candidate.holding), team: () => campaign || team === UNASSIGNED ? '' : team,
    }, host);
    return [id, { el: surface.el, launcher }];
  }));
  const campaignIdentity = createCampaignIdentity((name) => {
    if (entered && campaign) renderCards([]);
  });
  // CREATE THE TEAM AND LAND IN IT (owner, 2026-08-29). The Team is the record the
  // moment its roster exists, so the surface that made it hands the workspace over to
  // it — the same arrangement clicking its Cowork card would make — and goes back to an
  // empty form. Staffing happens from inside the Team, through New Agent.
  const newTeamBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => {
    const view = createNewTeamView(WorkspaceKit, { created: async (name) => { await refreshTeams(); bench.place(WB_TYPES.team, id, { key: name, label: readableTeam(name) }); } });
    const surface = createSurface({ label: t('new_team.title', 'New Team'), className: 'tw-new-team' });
    surface.content.append(view.el);
    return [id, { el: surface.el, enter: (context) => view.enter(context) }];
  })) : {};
  // CAMPAIGN CONFIGURATION HAS LEFT THIS PAGE (owner, 2026-08-29). The Campaign commons
  // carried Campaign identity, Project roots and Templates behind a tab strip here; those
  // are Campaign-level and are now surfaces of Campaign Manage (js/campaign-view.js).
  // The Team roster stayed — a Cowork is not Campaign configuration — and is its own
  // surface rather than the one tab left in a strip.
  const teamRosterBySeat = campaign ? Object.fromEntries(Object.keys(seats).map((id) => [id, createTeamRosterSurface()])) : {};
  const environment = {
    teamCommons: (id) => ({ el: teamCommons[id].el, show: (detail = {}) => { const item = teamCommons[id]; item.channels.enter(ctx); if (detail.doc) { item.channels.select('docs'); void item.docs.open(detail.doc); } else if (detail.tab) item.channels.select(detail.tab); } }),
    newSession: (id) => ({ el: newBySeat[id].el, show: () => { const launcher = newBySeat[id].launcher; launcher.render(); if (!roleData) void loadPresets().then(() => launcher.render()); void loadSavedLaunches().then(() => launcher.render()); } }),
    terminal: (id, detail) => ({ el: seats[id].surface.el, show: () => putSession(detail.key, id) }),
    roster: (id) => ({ el: teamRosterBySeat[id].el, show: () => teamRosterBySeat[id].render() }),
    newTeam: (id) => ({ el: newTeamBySeat[id].el, show: () => newTeamBySeat[id].enter(ctx) }),
    team: (id, detail) => createLeagueTeamSurface(detail.key, id),
    sessions: () => campaign ? [] : membersOfTeam(team).map((member) => ({ key: member.name, label: member.name, summary: member.summary || '', metadata: readingsOf(member), mark: member.team_lead ? '人' : null, onPointerEnter: () => armPrewarm(member.name), onPointerLeave: disarmPrewarm })),
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
  const legacyTypes = { [COMMONS]: WB_TYPES.commons, [COWORK]: WB_TYPES.desk, [NEW]: WB_TYPES.newSession, '@new-team': WB_TYPES.newTeam, '@team-roster': WB_TYPES.roster };
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
  const putNew = (id) => putSurface(NEW, id);
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
    if (!seats[id].pool.show(name, focus)) return false;
    touch(id);
    paintSeats();
    remember();
    return true;
  };

  /* ---------- one controller, two callers ---------- */
  // Everything that changes this page goes through arrange(): the C/T buttons and the
  // roster cards call it, and so does a draft an agent hands in with tejun-teampage
  // (owner, 2026-08-26). What a draft omits stays as it is.
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
      // Otherwise the workspace stays BLANK — no commons by default (owner, 2026-08-27).
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

  // THE CARD IS A READING, NOT A LABEL (owner, 2026-08-25: "shingo, model, ready, session
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
    const render = () => {
      const holding = name === UNASSIGNED;
      const current = teamByName(name), members = membersOfTeam(name);
      const metadata = createMetadata({ className: 'league-team-metadata', rows: [
        [t('team.team_role', 'Team role'), current.team_role], [t('team.objective', 'Objective'), current.objective],
        [t('team.project_root', 'Project root'), current.project_root],
      ] }).el;
      const roster = el('section', 'league-team-roster');
      roster.append(el('h3', 'league-team-roster-title', holding ? t('league.agents', 'Agents') : t('league.members', 'Team members')));
      const list = el('div', 'league-team-member-list');
      if (!members.length) list.append(el('p', 'league-team-empty', holding ? t('league.no_ronin', 'No Rōnin Agents') : t('league.no_members', 'No Agents assigned yet.')));
      for (const member of members) {
        const row = el('article', 'league-team-member');
        const identity = el('div', 'league-team-member-identity');
        const mark = el('span', 'league-team-member-mark', member.team_lead ? '人' : ''); mark.setAttribute('aria-hidden', 'true');
        const words = el('div', 'league-team-member-words');
        words.append(el('strong', null, member.name), el('span', null, member.session_role || t('league.role_unset', 'Role not set')));
        identity.append(mark, words);
        if (holding) { row.append(identity); list.append(row); continue; }
        const lead = createAction({ label: member.team_lead ? t('league.team_lead', 'Team lead') : t('league.make_team_lead', 'Make team lead'), size: 'compact', selected: member.team_lead, action: async () => { const result = await setTeamLead(member.name, name, !member.team_lead); if (!result.ok) return surface.setState('failed', result.message); surface.setState(); render(); } });
        const eject = createAction({ label: t('league.remove_member', 'Remove'), title: t('league.remove_named_member', 'Remove {name} from this team', { name: member.name }), size: 'compact', action: async () => { const result = await setTeamMembership(member.name, name, false); if (!result.ok) return surface.setState('failed', result.message); surface.setState(); render(); } });
        const actions = createActionBar({ className: 'league-team-member-actions', actions: [lead, eject] });
        row.append(identity, actions.el); list.append(row);
      }
      roster.append(list);
      if (holding) { surface.content.replaceChildren(roster); return; }
      const available = sessionsAvailableToTeam(name), add = el('div', 'league-team-add');
      const select = el('select', null); select.setAttribute('aria-label', t('league.choose_member', 'Choose an Agent to add'));
      select.append(new Option(available.length ? t('league.choose_member', 'Choose an Agent to add') : t('league.no_available_members', 'No other Agents available'), ''));
      for (const session of available) select.append(new Option(session.name + (session.session_role ? ` — ${session.session_role}` : ''), session.name));
      const assign = createAction({ label: t('league.assign_member', 'Assign'), size: 'compact', disabled: true, action: async () => { if (!select.value) return; const result = await setTeamMembership(select.value, name, true); if (!result.ok) return surface.setState('failed', result.message); surface.setState(); render(); } });
      select.addEventListener('change', () => assign.setDisabled(!select.value));
      add.append(select, assign.el); roster.append(add);
      surface.content.replaceChildren(metadata, roster);
    };
    render();
    const out = { el: surface.el, render }; leagueTeamSurfaces.set(cacheKey, out); return out;
  };
  const refreshLeagueTeamSurfaces = () => {
    for (const view of leagueTeamSurfaces.values()) view.render?.();
  };
  let homeTimer = 0;
  const readRows = async () => {
    const [r] = await Promise.all([request('/api/home', { cache: 'no-store' }), refreshDesks().catch(() => false), refreshTeams()]);
    if (!r.ok || !Array.isArray(r.data) || !entered) return;
    rows = new Map(r.data.map((row) => [row.name, row]));
    onSessions();
    renderCards(membersOfTeam(team));
    // The configuration's live roster carries the same readings; it keeps the same clock.
    const roster = teamByName(team);
    renderConfig(roster.durable ? roster : null, membersOfTeam(team));
  };
  // MEMBERSHIP IS LIVE, AND SO ARE THE SEATS. The team controller only publishes on
  // `refreshTeams()`, which this page runs once on entry; the cards, though, are drawn
  // off `S.sessions`, which the events feed keeps current. A session that joined the team
  // after entry therefore had a card and no seat in either pool — its card clicked and
  // dragged into nothing (owner, 2026-08-26: "that one Kanban is broken"). The fix is the
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
    const chip = row.tegami?.chip?.text && row.tegami?.ladder?.length ? row.tegami.chip.text + (row.tegami.quietMs >= 60000 ? ' · ' + humanAge(row.tegami.quietMs) : '') : null;
    return [
      m.session_role || null,
      chip,
      statusLabel(row.status) || null,
      (row.model || '').toLowerCase() || null,
      row.ctx != null ? `⛽ ${row.ctx}%` : null,
      deskReadout(desksOf(m.name)), // derived desk state, the control surface's visible half
      row.attached ? t('team.attached', 'attached') : null,
    ].filter(Boolean);
  };
  function renderCards(members) {
    if (rosterTitle) rosterTitle.textContent = campaign ? campaignIdentity.name() || t('campaign', 'Campaign') : team ? t('team.roster_of', 'Roster: {team}', { team: readableTeam(team) }) : t('team.roster_title', 'Team Roster');
    bench.refreshSelector();
  }

  function renderConfig(roster, live) {
    for (const commons of Object.values(teamCommons)) {
      renderTeamConfiguration(commons.config, roster && { ...roster, durable: true }, { onSaved: async (saved, renamed) => {
        await refreshTeams();
        if (renamed) S.workspace?.navigate('team', saved.name);
        else { setBarLabel(); renderConfig(saved, live); paint(); }
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
    // The owner's per-tab name distinguishes several Workbench tabs. Coworks defaults to
    // its page name; a Team defaults to the Team name. createWorkspace adds Ronin.
    title: ({ param, viewState }) => {
      const fallback = campaign ? t('campaign.coworks', 'Coworks') : (param || t('team.team', 'Team'));
      const name = viewState?.(viewKey)?.tabName;
      return name ? { bare: `${name} · ${fallback}` } : fallback;
    },
    tabName: {
      get: () => ctx?.viewState(viewKey)?.tabName || '',
      placeholder: () => campaign ? t('campaign.coworks', 'Coworks') : team || t('team.team', 'Team'),
      set: (value) => { ctx?.patchViewState(viewKey, { tabName: String(value || '').trim() }); },
    },
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
      S.showNewSession = (prompt = '') => {
        const id = lastSeat || 'workspace1';
        putNew(id);
        if (prompt) void newBySeat[id].launcher.open('PersonalAssistant', prompt);
      };
      S.connectSession = (name) => connectSession(name);
      S.onSessionRenamed = (before, next) => {
        const showing = liveSeats().filter((id) => holds(id) === before);
        if (extras.delete(before)) extras.add(next);
        for (const [id, held] of Object.entries(remembered)) if (held === before) remembered[id] = next;
        syncPools(membersOfTeam(team));
        showing.forEach((id) => putSession(next, id));
        renderCards(membersOfTeam(team));
      };
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
      disarmPrewarm();
      window.clearInterval(homeTimer);
      window.clearInterval(reportTimer);
      // No transport survives outside the entered Team destination.
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); seat.empty = null; }
      for (const commons of Object.values(teamCommons)) commons.channels.leave();
      S.showNewSession = null;
      S.onSessionRenamed = null;
      S.connectSession = null;
      bench.leave();
      S.refreshWorkspaceHeader?.();
    },
    destroy: () => {
      entered = false;
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
