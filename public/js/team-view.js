/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM DESTINATION — Eye 2's first deployable preview.
 *
 * What this is: the Team workbench over the hardened Workspace Kit. Its boundaries are
 * deliberate:
 *
 *   Full existing Tiles only — one warm Kit host per live member per workspace.
 *   NO Chat protocol — Chat is a reserved Channel service and stays inert (owner's ruling).
 *   NO mutations — Team Configuration READS the roster and offers no write.
 *
 * TAXONOMY (owner, 2026-08-23): a *pane* is only tmux's own object. Ronin renders session
 * output into a TILE. A SURFACE is a coworkspace region hosting a terminal Tile, the Kanban
 * or Channel services. Chat, Wipeboard, Docs and Team Configuration are CHANNEL SERVICES.
 *
 * Workbench layout, collapse, resize and persistence are owned by the managed Workspace
 * Kit composition. This feature supplies only Team content and behavior.
 *
 * THE SHAPE (owner, 2026-08-25): two workspaces around the roster. A workspace holds one
 * thing — its terminal seat, or the team commons — and trades between them with one
 * button: C on the seat's tile head, T on the commons' tab strip. The workspaces are not
 * connected: each seat has its own pool of tiles (team-terminal-pool.js — the warm and
 * hold rules; cap two per seat, four in all; the lead pinned hot in workspace 1). A
 * roster card goes into the workspace last touched, or the one it is dropped on.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, refreshTeams, subscribe, teamByName } from './team-controller.js';
import { activeProfile } from './desk-profile.js';
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
import { coworkCommons } from './cowork-commons.js';
import { DRAG_TYPE, acceptDrops as acceptSessionDrops } from './team-drag.js';
import { S } from './state.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

const COMMONS = '@commons'; // what a workspace remembers when it holds the team commons
const COWORK = '@cowork'; // …and when it holds the cowork commons (docs/cowork-space.md)
const NEW = '@new'; // …and when it holds the new-session surface

export function createTeamView() {
  // Resolved INSIDE the factory, never at module top level: a top-level read of an imported
  // binding is the load-order fragility public/js/README.md rule 4 forbids, and the module
  // gate enforces it.
  const { createSurface, createCard, createChannelSurface, createMetadata, setSurfaceState } = WorkspaceKit.primitives;
  const { createWorkbenchLayout } = WorkspaceKit.layouts;
  const { createTerminalTileHost } = WorkspaceKit.adapters;
  const { teamWorkspaceState } = WorkspaceKit.contract;

  const root = el('main', 'tw-view');
  let ctx = null;
  let team = '';
  let loaded = ''; // the team whose roster reading is currently drawn
  let unsubscribe = null;
  let entered = false;
  let lastSeat = 'workspace1'; // the workspace last touched — where the next card lands

  // NO FLIP (owner, 2026-08-28): the team commons is a roster CARD, placed like a session.
  /* ---------- the workspaces: two seats, the roster between them, one commons ---------- */
  // A seat is a surface with its tiles in it: the pool's (one per member shown here,
  // the active one visible) and, when no member is shown, the seat's own empty tile —
  // head row and C, no session. The Kit slot holds EITHER the seat's surface OR the
  // commons; trading is place(), and the seat keeps its tiles while it is out.
  const makeSeat = (id, label) => {
    const surface = createSurface({ label, className: 'tw-terminal', flush: true });
    const pool = createWarmTerminalPool({
      createHost: (options) => createTerminalTileHost(options),
      container: surface.content,
      streamCap: 2,
    });
    return { id, surface, pool, empty: null };
  };
  /** The empty surface is built only when no member is shown there. */
  // AN EMPTY WORKSPACE IS BLANK AND SAYS SO (owner, 2026-08-27; docs/cowork-space.md).
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
  // The selected workspace is where the next roster card lands; every surface can carry it.
  const touch = (id) => {
    lastSeat = id;
    for (const seat of Object.values(seats)) {
      for (const tile of seat.surface.content.querySelectorAll('.tile')) tile.classList.toggle('active', seat.id === id);
      cellHolding(seat.id)?.classList.toggle('tw-selected', seat.id === id);
    }
  };
  const seats = {
    workspace1: makeSeat('workspace1', t('team.workspace_1', 'Workspace 1')),
    workspace2: makeSeat('workspace2', t('team.workspace_2', 'Workspace 2')),
    workspace3: makeSeat('workspace3', t('team.workspace_3', 'Workspace 3')),
    workspace4: makeSeat('workspace4', t('team.workspace_4', 'Workspace 4')),
  };
  // TWO SHAPES (owner, 2026-08-27): TWO workspaces around the selector column, or FOUR as a
  // 2×2 with the selector column left, centre or right. The Kit's workbench is a row of
  // columns — order, hide, splitters — so the columns stay three: each workspace column is
  // a STACK, workspace 1 over 3 on the left column, 2 over 4 on the right, and the count
  // shows or hides the lower cell. The selector's place is the existing `order`. A seat's
  // surface (or a commons) sits in its CELL; the Kit slot holds the column for good.
  const COLUMN_OF = { workspace1: 'workspace1', workspace3: 'workspace1', workspace2: 'workspace2', workspace4: 'workspace2' };
  const LOWER = ['workspace3', 'workspace4'];
  const columns = { workspace1: el('div', 'tw-column'), workspace2: el('div', 'tw-column') };
  const cells = {};
  for (const id of Object.keys(seats)) {
    const cell = el('div', 'tw-cell');
    cell.dataset.workspace = id;
    cell.append(seats[id].surface.el);
    cells[id] = cell;
    columns[COLUMN_OF[id]].append(cell);
  }
  // THE CELL OWNS SELECTION AND DROPS, whatever it holds (owner, 2026-08-28: "it doesn't
  // matter what is on a workspace … everything should function the same"). Capture-phase,
  // because a surface's own controls stop propagation. A dropped card names a session, or a
  // surface by its token (SURFACES below) — either way the cell is clobbered with it.
  for (const [id, cell] of Object.entries(cells)) {
    cell.addEventListener('pointerdown', () => touch(id), true);
    acceptSessionDrops(cell, () => id, (name, at) => arrange({ [at]: SURFACES[name] ? { surface: name } : { session: name } }));
  }
  const cellPlace = (id, node) => { if (cells[id].firstElementChild !== node) cells[id].replaceChildren(node); };
  const cellHolding = (id) => cells[id]?.firstElementChild ?? null;
  let count = 2;
  const liveSeats = () => Object.keys(seats).filter((id) => count === 4 || !LOWER.includes(id));

  const kanban = createSurface({ label: t('team.roster_title', 'Team Roster'), className: 'tw-kanban' });
  // The roster's header — the same depth as a tile head and the commons' tab strip.
  const rosterHead = el('div', 'tw-roster-head');
  const rosterCount = el('span', 'tw-roster-count');
  const rosterNote = el('span', 'tw-roster-note');
  // THE SHAPE CONTROL is the bar's #shapecycle (owner, 2026-08-28: the 1·2·4 count's seat,
  // "alt between the numbers"): this view writes its face and owns its click while it is
  // entered; the roster head carries no pair.
  const shapeBtn = document.getElementById('shapecycle');
  const paintShape = () => {
    if (!shapeBtn) return;
    shapeBtn.textContent = String(count);
    shapeBtn.title = count === 4 ? t('bar.shape_four', 'Four workspaces — click for two') : t('bar.shape_two', 'Two workspaces — click for four');
    shapeBtn.setAttribute('aria-label', shapeBtn.title);
  };
  const onShape = () => arrange({ count: count === 4 ? 2 : 4 });
  const rosterTitle = el('span', 'tw-roster-title', t('team.roster_title', 'Roster'));
  rosterHead.append(rosterTitle, rosterCount, rosterNote);
  kanban.el.prepend(rosterHead);
  const cards = el('div', 'tw-cards');
  kanban.content.append(cards);
  // Keyboard through the roster: arrows move between cards, Enter or Space picks (a
  // card is a button, so the pick is the button's own click).
  cards.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const all = [...cards.querySelectorAll('.wk-card[aria-pressed]')];
    const at = all.indexOf(document.activeElement);
    if (at < 0) return;
    all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    event.preventDefault();
  });

  // The wipeboard slice is real (owner, 2026-08-25 — the thread, and nothing else; the
  // Brief stays Team Configuration's). Its board id follows the roster: see setBoard below.
  const wipeboard = createTeamWipeboard();
  // DOCS IS THE COMMONS' ▧ DOCS PANE, NOT A TEAM COPY (owner, 2026-08-25: "the docs don't
  // show like it does on the commons"). `buildDocs` is mdedit itself — the same list over
  // the same `/api/home` letters, the same editor — narrowed to the roster's members. The
  // wrapper carries `home-docs` because that is the class mdedit's list/editor switch is
  // written against; `tw-docs` only gives it the surface's height.
  const docsPane = el('div', 'home-docs tw-docs');
  const docs = buildDocs(null, docsPane, () => entered && docsPane.isConnected,
    (name) => membersOfTeam(team).some((m) => m.name === name));
  const docsService = {
    el: docsPane,
    mount: () => {},
    // The list reads `homeData`, which only the Commons poll fills; ask for a read on the
    // way in so a page opened straight onto a Team is not looking at an empty letter box.
    enter: () => { void refreshHome(); docs.enter(); },
    leave: () => {},
    destroy: () => {},
  };
  const config = el('div', 'tw-config');
  const service = (node) => ({ el: node, mount: () => {}, enter: () => {}, leave: () => {}, destroy: () => {} });
  const channels = createChannelSurface({
    label: t('team.commons', 'Team commons'),
    // DOCS FIRST, NO CHAT (owner, 2026-08-28) — Chat returns to this list when it is a thing.
    channels: [
      { id: 'docs', label: t('workspace.channel_docs', 'Docs') },
      { id: 'wipeboard', label: t('workspace.channel_wipeboard', 'Wipeboard') },
      { id: 'team-configuration', label: t('workspace.channel_team_configuration', 'Team Configuration') },
    ],
    selected: 'docs',
    services: { wipeboard, docs: docsService, 'team-configuration': service(config) },
  });
  // THE COWORK COMMONS — the third surface a workspace can hold (owner, 2026-08-27). One
  // instance for the whole page; its strip carries the same T as the team commons'.
  const cowork = coworkCommons();
  // ＋ NEW SESSION IS A SURFACE (owner, 2026-08-27): the commons' launcher, in a workspace.
  // ＋ Add team member on the roster and か New on the bar both put it in the selected
  // workspace; a session born from it lands in that same workspace (`connect`).
  const newSurface = createSurface({ label: t('team.new_session', 'New session'), className: 'tw-new' });
  // Its own head and body (feature classes; the Kit's own nodes are the Kit's to style).
  const newHead = el('div', 'tw-new-head');
  newHead.append(el('span', 'tw-new-title', t('team.new_session', 'New session')));
  newSurface.el.prepend(newHead);
  const newBody = el('div', 'tw-new-body');
  const launcherHost = el('div', 'home-null');
  newBody.append(launcherHost);
  newSurface.content.append(newBody);
  const extras = new Set(); // sessions shown here that are not (yet) members — a newborn, a picked one
  const launcher = buildLauncher({ index: 'ws', connect: (name) => connectSession(name) }, launcherHost);
  // Chat is reserved by the Kit and this file adds NOTHING to it — no composer, no fetch,
  // no timer. Its emptiness is the owner's ruling, not an unfinished state.

  /* ---------- geometry: the whole of it is this declaration ---------- */
  // Three slots by name; the Kit's frame draws them and the Kit's layout map in the bar
  // shows, hides and reorders them. The roster goes down to 6% and turns compact under
  // 11rem (176px) — the frame writes data-width on its slot and the Kit's card CSS reads it.
  const DECLARATION = {
    slots: [
      { name: 'workspace1', label: t('team.workspace_1', 'Workspace 1'), width: 40 },
      { name: 'roster', label: t('team.roster_title', 'Team Roster'), width: 20, min: 6, compact: 176 },
      { name: 'workspace2', label: t('team.workspace_2', 'Workspace 2'), width: 40 },
    ],
  };
  const workbench = createWorkbenchLayout({
    declaration: DECLARATION,
    surfaces: { workspace1: columns.workspace1, roster: kanban.el, workspace2: columns.workspace2 },
    onStateChange: (arrangement) => ctx?.patchViewState('team', { arrangement }),
  });
  root.append(workbench.host);

  /* ---------- in and out ---------- */
  // THE SURFACE REGISTRY: one entry per workspace_surface that is not a seat — its token
  // (what a cell remembers, what a card drags), its element, and what "showing it" means.
  // A new surface (a league view, a new-team form…) is one more entry here and nothing
  // else: the cells, the drops, the memory, the view report and tejun-teampage's words all
  // read this table.
  const SURFACES = {
    [COMMONS]: { name: 'commons', el: channels.el, show: (tab, doc) => { if (doc) { channels.select('docs'); void docs.open(doc); } else if (tab) channels.select(tab); }, tab: () => channels.current?.() || '' },
    [COWORK]: { name: 'cowork', el: cowork.el, show: (tab) => cowork.select(tab || cowork.current()), tab: () => cowork.current?.() || '' },
    [NEW]: { name: 'new', el: newSurface.el, show: () => {
      // Drawn off the two fast reads (roles, saved launches) — never the 1.3s home read.
      launcher.render();
      if (!roleData) void loadPresets().then(() => launcher.render());
      void loadSavedLaunches().then(() => launcher.render());
    } },
  };
  const tokenOf = (el) => Object.keys(SURFACES).find((k) => SURFACES[k].el === el) || '';
  /** Which surface token this cell holds, or '' for its own seat. */
  const heldSurface = (id) => tokenOf(cellHolding(id));
  const whereIs = (token) => Object.keys(seats).find((id) => cellHolding(id) === SURFACES[token]?.el) || '';
  const commonsIn = () => whereIs(COMMONS);
  /** A surface other than the seat's own is in this workspace. */
  const surfaceIn = (id) => !!heldSurface(id);
  const holds = (id) => heldSurface(id) || seats[id].pool.active;
  /** ANY surface in: wherever it was, that seat's surface comes back; the cell it lands on
   *  keeps its tiles while it is out. One trade for every surface, present and future. */
  const putSurface = (token, id, tab = '', doc = '') => {
    const s = SURFACES[token];
    if (!s || !seats[id]) return false;
    const from = whereIs(token);
    if (from && from !== id) cellPlace(from, seats[from].surface.el);
    cellPlace(id, s.el);
    s.show?.(tab, doc);
    touch(id);
    remember();
    return true;
  };
  const isShown = (name) => Object.values(seats).some((seat) => seat.pool.active === name && !surfaceIn(seat.id));
  const remember = () => { ctx?.patchViewState('team', { seats: Object.fromEntries(Object.keys(seats).map((id) => [id, holds(id)])) }); reportView(); };
  const lead = () => membersOfTeam(team).find((m) => m.team_lead)?.name || '';

  const putCommons = (id, tab = '', doc = '') => putSurface(COMMONS, id, tab, doc);
  const putCowork = (id, tab = '') => putSurface(COWORK, id, tab);
  const putNew = (id) => putSurface(NEW, id);
  /** The shape: 2 or 4. Lowering to 2 leaves seats 3 and 4 as they are, hidden — their
   *  tiles stay warm under the pool's own cap; a selection down there moves up. */
  const setCount = (n) => {
    count = n === 4 ? 4 : 2;
    for (const col of Object.values(columns)) col.dataset.count = String(count);
    for (const id of LOWER) cells[id].hidden = count !== 4;
    paintShape();
    if (count === 2 && LOWER.includes(lastSeat)) touch('workspace1');
    ctx?.patchViewState('team', { count });
    remember();
  };
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
    if (surfaceIn(id)) cellPlace(id, seats[id].surface.el);
    seats[id].pool.destroyAll();
    ensureLeadHot(membersOfTeam(team));
    touch(id);
    paintSeats();
    remember();
  };
  /** Terminal in: the seat's surface comes back as it was; a seat that never showed
   *  anyone gets the lead. */
  const putTerminal = (id) => {
    cellPlace(id, seats[id].surface.el);
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
    showColumn: (name) => { if (workbench.arrangement.state().hidden.includes(name)) workbench.arrangement.toggle(name); },
    hideColumn: (name) => { if (!workbench.arrangement.state().hidden.includes(name)) workbench.arrangement.toggle(name); },
    moveColumn: (name, index) => workbench.arrangement.move(name, index),
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
    const a = workbench.arrangement.state();
    const workspaces = {};
    for (const id of liveSeats()) {
      const token = heldSurface(id);
      const s = token ? SURFACES[token] : null;
      workspaces[id] = s ? { holds: s.name, tab: s.tab?.() || '' } : seats[id].pool.active ? { holds: 'session', session: seats[id].pool.active } : { holds: 'empty' };
    }
    return { team, selected: lastSeat, count, order: [...a.order], hidden: [...a.hidden], workspaces };
  };
  let reportTimer = 0;
  const reportView = () => { if (entered && team) void sendView(team, TAB, view()); };
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
      if (SURFACES[wanted]) putSurface(wanted, id);
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
  // The hover flourish: a pointer resting on a card pre-warms that member's tile in the
  // workspace the click would land in.
  let dwellTimer = 0;
  const armPrewarm = (name) => {
    window.clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(() => seats[lastSeat].pool.prewarm(name), 150);
  };
  const disarmPrewarm = () => window.clearTimeout(dwellTimer);

  /* ---------- the roster's cards ---------- */
  // THE CARD IS A READING, NOT A LABEL (owner, 2026-08-25: "shingo, model, ready, session
  // taken"). The readings ride /api/home's row — the same row the Commons roster reads:
  // MICHI's SHINGO chip, the status, the model, the context gauge. Read on entry and every
  // five seconds while entered (the Commons' own cadence); nothing is guessed when a
  // reading is absent. RIREKI's cherry-pick or summary joins the row when the service
  // contributes it; there is no field for it today.
  let rows = new Map(); // name -> the /api/home row
  let homeTimer = 0;
  const readRows = async () => {
    const r = await request('/api/home', { cache: 'no-store' });
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
      row.attached ? t('team.attached', 'attached') : null,
    ].filter(Boolean);
  };
  function renderCards(members) {
    rosterCount.textContent = members.length ? String(members.length) : '';
    cards.replaceChildren();
    // THE TEAM COMMONS IS THE FIRST CARD (owner, 2026-08-28), thin, addressed like one.
    const commonsCard = createCard({
      heading: t('team.commons_card', 'Team commons'),
      className: 'tw-commons-card',
      selected: !!commonsIn(),
      action: () => arrange({ [lastSeat || 'workspace1']: { commons: true } }),
    });
    commonsCard.el.draggable = true;
    commonsCard.el.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(DRAG_TYPE, COMMONS);
      event.dataTransfer.setData('text/plain', t('team.commons_card', 'Team commons'));
      event.dataTransfer.effectAllowed = 'move';
    });
    cards.append(commonsCard.el);
    for (const m of members) {
      const readings = readingsOf(m);
      const card = createCard({
        heading: m.name,
        summary: m.summary || '',
        metadata: readings,
        // THE 人 IS THE CARD'S MARK (owner, 2026-08-26): the lead wears the kanji itself,
        // beside the name, and keeps it when the roster goes compact.
        mark: m.team_lead ? '人' : null,
        selected: isShown(m.name),
        action: () => arrange({ [lastSeat]: { session: m.name } }),
      });
      card.el.addEventListener('pointerenter', () => armPrewarm(m.name));
      card.el.addEventListener('pointerleave', disarmPrewarm);
      card.el.draggable = true;
      card.el.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData(DRAG_TYPE, m.name);
        event.dataTransfer.setData('text/plain', m.name);
        event.dataTransfer.effectAllowed = 'move';
      });
      cards.append(card.el);
    }
    const add = createCard({ heading: t('team.add_member', '＋ Add team member'), summary: t('team.add_member_summary', 'A new session, born into the workspace you are in.'), variant: 'dotted' });
    add.el.addEventListener('click', () => arrange({ [lastSeat || 'workspace1']: { new: true } }));
    cards.append(add.el);
  }

  /* ---------- Team Configuration: READ ONLY ---------- */
  // A READING OF THE TEAM, whether or not it has a durable record. Most teams on a box are
  // tag-only, and a tag-only team still has facts worth a page: who is on it, who leads
  // it, what each member is doing, and which board it writes on (the server opens the
  // team's own name as its wipeboard). The durable record, when there is one, reads first.
  // Nothing here writes — membership is the sessions' tags, the 人 is set from a tile.
  function renderConfig(roster, live) {
    config.replaceChildren();
    if (!team) {
      config.append(el('p', 'tw-config-head', t('team.none_selected', 'No Team selected')));
      return;
    }
    config.append(el('p', 'tw-config-head', team));
    const record = roster
      ? [[t('team.team_role', 'Team role'), roster.team_role], [t('team.objective', 'Objective'), roster.objective], [t('team.project_root', 'Project root'), roster.project_root],
        [t('team.repos', 'Repositories'), (roster.repos || []).join(', ')], [t('team.branch', 'Branch'), roster.branch],
        [t('team.wipeboard', 'Wipeboard'), roster.wipeboard || team], [t('team.state', 'State'), roster.state]]
      : [[t('team.record', 'Record'), t('team.record_tag_only', 'tag-only — no durable roster; the team is its sessions’ tags')], [t('team.wipeboard', 'Wipeboard'), team]];
    config.append(createMetadata({ className: 'tw-config-metadata', rows: record }).el);
    config.append(el('p', 'tw-config-head', live.length ? t('team.live_roster_n', 'Live roster · {n}', { n: live.length }) : t('team.live_roster_none', 'Live roster · none')));
    if (!live.length) return;
    const lead = live.filter((m) => m.team_lead).map((m) => m.name), table = el('div', 'tw-config-roster');
    const line = (name, reading) => table.append(el('span', 'tw-config-name', name), el('span', 'tw-config-reading', reading));
    line('人', lead.length ? lead.join(', ') : t('team.lead_none', 'not designated'));
    for (const m of live) line(m.team_lead ? `人 ${m.name}` : m.name, readingsOf(m).join(' · ') || '—');
    config.append(table);
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
    wipeboard.setBoard((roster.durable && roster.wipeboard) || team);
  };

  async function load(name) {
    if (!name) {
      syncPools([]);
      setSurfaceState(kanban.el, 'empty', t('team.none_selected_dot', 'No Team selected.'));
      renderCards([]);
      renderConfig(null, []);
      loaded = '';
      return;
    }
    setSurfaceState(kanban.el, 'loading', t('team.reading', 'Reading the Team…'));
    const result = await refreshTeams();
    if (!entered || team !== name) return; // the destination moved while this was in flight
    loaded = name;
    rosterTitle.textContent = t('team.roster_of', 'Roster: {team}', { team: name });
    if (!result.live.ok) {
      setSurfaceState(kanban.el, 'failed', t('team.read_failed', 'Could not read this Team — {message}', { message: result.live.message }));
      renderCards([]);
      renderConfig(null, []);
      return;
    }
    const members = membersOfTeam(name);
    setSurfaceState(kanban.el, members.length ? null : 'empty', members.length ? '' : t('team.no_live', 'No live sessions on this Team.'));
    paint();
  }

  return {
    el: root,
    // The ViewHost draws the Kit's layout map in the bar for this while the view is active.
    arrangement: workbench.arrangement,
    // THE NAME IS THE OWNER'S (2026-08-26): three tabs each titled "team · Ronin" cannot
    // be told apart, so the bar's field lets each tab say what it is for. Named, the tab
    // reads `<name> · <team>` and nothing else — the house only rides the default, which
    // is the team's own name with createWorkspace's tabTitle() adding "Ronin". Per tab,
    // like everything else here — one tab is one team.
    title: ({ param, viewState }) => {
      const name = viewState?.('team')?.tabName;
      return name ? { bare: `${name} · ${param || t('team.team', 'Team')}` } : (param || t('team.team', 'Team'));
    },
    tabName: {
      get: () => ctx?.viewState('team')?.tabName || '',
      placeholder: () => team || t('team.team', 'Team'),
      set: (value) => ctx?.patchViewState('team', { tabName: String(value || '').trim() }),
    },
    mount: (_host, context) => {
      ctx = context;
      channels.mount(context);
      unsubscribe = subscribe(() => { if (entered && team) paint(); });
      teamPageHandlers.add(onDraft);
      sessionsHandlers.add(onSessions);
    },
    enter: (context) => {
      ctx = context;
      entered = true;
      for (const seat of Object.values(seats)) seat.pool.destroyAll();
      team = context.param || context.state?.team || '';
      const typed = teamWorkspaceState(context.state, context.viewState('team'), DECLARATION);
      // THE DESK PROFILE'S ORDER (R38) when this tab has no arrangement of its own — the
      // owner's standing default, never an override of what a tab already arranged.
      const stored = context.viewState('team')?.arrangement;
      const profileOrder = activeProfile()?.team_arrangement || [];
      workbench.restore(!stored && profileOrder.length ? { ...typed.arrangement, order: profileOrder } : typed.arrangement);
      // What each workspace remembers holding; the old one-seat focusedSession lands in
      // the first workspace, once. With nothing remembered: the lead left, the commons right.
      if (shapeBtn) { shapeBtn.hidden = false; shapeBtn.addEventListener('click', onShape); }
      setCount(context.viewState('team')?.count === 4 ? 4 : 2);
      remembered = { ...typed.seats };
      if (!Object.keys(remembered).length) remembered = typed.focusedSession ? { workspace1: typed.focusedSession } : {};
      const members = membersOfTeam(team);
      syncPools(members);
      ensureLeadHot(members);
      seatTheTeam();
      paintSeats();
      touch(liveSeats().find((id) => !heldSurface(id)) || 'workspace1');
      channels.enter(context);
      // ⚙ ON THIS PAGE: the cowork commons into the workspace you are in; pressed again
      // there, the terminal back — the toggle ⛩ taught (layout.js reads this hook).
      S.showNewSession = (prompt = '') => {
        putNew(lastSeat || 'workspace1');
        if (prompt) void launcher.open('PersonalAssistant', prompt);
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
      S.showCoworkCommons = (tab = '') => {
        const id = lastSeat || 'workspace1';
        if (heldSurface(id) === COWORK && !tab) putTerminal(id);
        else putCowork(id, tab);
      };
      if (team !== loaded) void load(team);
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
      channels.leave();
      if (S.showCoworkCommons) S.showCoworkCommons = null;
      S.showNewSession = null;
      S.onSessionRenamed = null;
      S.connectSession = null;
      if (shapeBtn) { shapeBtn.hidden = true; shapeBtn.removeEventListener('click', onShape); }
    },
    destroy: () => {
      entered = false;
      unsubscribe?.();
      unsubscribe = null;
      teamPageHandlers.delete(onDraft);
      sessionsHandlers.delete(onSessions);
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); }
      channels.destroy();
    },
  };
}
