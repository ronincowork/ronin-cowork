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
 *   NO Sessions mode — Gates C and D remain later work.
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

  /* ---------- the flip: one button in the header row, C or T ---------- */
  const flipButton = (letter) => {
    // C is sized by the tile head's own button rule; T stands at tab height on the strip.
    const button = el('button', letter === 'T' ? 'tw-flip tw-flip-strip' : 'tw-flip', letter);
    button.type = 'button';
    button.title = letter === 'C' ? t('team.flip_commons', 'Show the Team commons in this workspace') : t('team.flip_terminal', 'Show the terminal in this workspace');
    button.addEventListener('click', () => {
      const id = button.closest('[data-surface]')?.dataset.surface;
      if (seats[id]) arrange({ [id]: letter === 'C' ? { commons: true } : { terminal: true } });
    });
    return button;
  };

  /* ---------- the workspaces: two seats, the roster between them, one commons ---------- */
  // A seat is a surface with its tiles in it: the pool's (one per member shown here,
  // the active one visible) and, when no member is shown, the seat's own empty tile —
  // head row and C, no session. The Kit slot holds EITHER the seat's surface OR the
  // commons; trading is place(), and the seat keeps its tiles while it is out.
  const makeSeat = (id, label) => {
    const surface = createSurface({ label, className: 'tw-terminal', flush: true });
    surface.el.addEventListener('pointerdown', () => touch(id));
    acceptSessionDrops(surface.el, () => id, (name, id) => arrange({ [id]: { session: name } }));
    const pool = createWarmTerminalPool({
      createHost: (options) => createTerminalTileHost({ ...options, actions: [flipButton('C')] }),
      container: surface.content,
      streamCap: 2,
    });
    return { id, surface, pool, empty: null };
  };
  /** The empty tile is in the seat exactly when no member is shown there. Built on first
   *  need, not at page load: a Tile registers itself with the Sessions grid's roll. */
  // AN EMPTY WORKSPACE IS BLANK, AND SAYS SO (owner, 2026-08-27: *"it should just say
  // 'workspace'. That's okay, it's blank"*). It was an empty Tile showing the tile-level
  // commons — a surface the cowork_space no longer uses (its rooms moved: Roster and
  // Archived to the cowork commons, ＋ New session to a surface of its own).
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
  // The selected workspace carries the highlight the Sessions grid gives its active
  // tile (`.tile.active`) — that is where the next card lands.
  // ANY SURFACE CAN BE SELECTED (owner, 2026-08-27: *"I should be able to select any
  // workspace at any point … when I click admin desk, it populates the selected
  // workspace"*): the mark goes on whatever the workspace holds — a tile gets `.active`
  // as on the grid, a commons gets `.tw-selected` on its surface — so a workspace holding
  // the team commons is as selectable as one holding a terminal.
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
    // Land on CHAT, by the owner's word (2026-08-25: "I don't want to land on the
    // whiteboard. I want to land on chat. That's fine that it's empty.") — explicit,
    // not the accident of an unqualified default.
    selected: 'chat',
    services: { wipeboard, docs: docsService, 'team-configuration': service(config) },
    actions: [flipButton('T')],
  });
  channels.el.addEventListener('pointerdown', () => { const id = commonsIn(); if (id) touch(id); });
  acceptSessionDrops(channels.el, () => commonsIn(), (name, id) => arrange({ [id]: { session: name } }));
  // THE COWORK COMMONS — the third surface a workspace can hold (owner, 2026-08-27). One
  // instance for the whole page; its strip carries the same T as the team commons'.
  const cowork = coworkCommons();
  if (!cowork.tabs.querySelector('.tw-flip-strip')) {
    cowork.tabs.append(el('span', 'wk-channel-service-grow'), flipButton('T'));
  }
  cowork.el.addEventListener('pointerdown', () => { const id = coworkIn(); if (id) touch(id); });
  acceptSessionDrops(cowork.el, () => coworkIn(), (name, id) => arrange({ [id]: { session: name } }));
  // ＋ NEW SESSION IS A SURFACE (owner, 2026-08-27): the commons' launcher, in a workspace.
  // ＋ Add team member on the roster and か New on the bar both put it in the selected
  // workspace; a session born from it lands in that same workspace (`connect`).
  const newSurface = createSurface({ label: t('team.new_session', 'New session'), className: 'tw-new' });
  // Its own head and body (feature classes; the Kit's own nodes are the Kit's to style).
  const newHead = el('div', 'tw-new-head');
  newHead.append(flipButton('T'), el('span', 'tw-new-title', t('team.new_session', 'New session')));
  newSurface.el.prepend(newHead);
  const newBody = el('div', 'tw-new-body');
  const launcherHost = el('div', 'home-null');
  newBody.append(launcherHost);
  newSurface.content.append(newBody);
  const extras = new Set(); // sessions shown here that are not (yet) members — a newborn, a picked one
  const launcher = buildLauncher({ index: 'ws', connect: (name) => connectSession(name) }, launcherHost);
  newSurface.el.addEventListener('pointerdown', () => { const id = newIn(); if (id) touch(id); });
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
  const commonsIn = () => Object.keys(seats).find((id) => cellHolding(id) === channels.el) || '';
  const coworkIn = () => Object.keys(seats).find((id) => cellHolding(id) === cowork.el) || '';
  const newIn = () => Object.keys(seats).find((id) => cellHolding(id) === newSurface.el) || '';
  /** A surface other than the seat's own is in this workspace. */
  const surfaceIn = (id) => commonsIn() === id || coworkIn() === id || newIn() === id;
  const holds = (id) => (commonsIn() === id ? COMMONS : coworkIn() === id ? COWORK : newIn() === id ? NEW : seats[id].pool.active);
  const isShown = (name) => Object.values(seats).some((seat) => seat.pool.active === name && !surfaceIn(seat.id));
  const remember = () => { ctx?.patchViewState('team', { seats: Object.fromEntries(Object.keys(seats).map((id) => [id, holds(id)])) }); reportView(); };
  const lead = () => membersOfTeam(team).find((m) => m.team_lead)?.name || '';

  /** Commons in: the seat's surface (tiles and all) leaves the slot; wherever the
   *  commons was, that seat's surface comes back. */
  const putCommons = (id, tab = '', doc = '') => {
    const from = commonsIn();
    if (from && from !== id) cellPlace(from, seats[from].surface.el);
    cellPlace(id, channels.el);
    if (doc) { channels.select('docs'); void docs.open(doc); } else if (tab) channels.select(tab);
    touch(id);
    remember();
  };
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
  /** New session in: the launcher, in this workspace. */
  const putNew = (id) => {
    const from = newIn();
    if (from && from !== id) cellPlace(from, seats[from].surface.el);
    cellPlace(id, newSurface.el);
    // The board is the roles catalog — ~0.1s — so it is asked for and drawn on its own;
    // the home read (~1.3s, every session's status) only feeds the saved-launch row and
    // must never hold the board back (owner: "why is new session so slow to load?").
    launcher.render();
    if (!roleData) void loadPresets().then(() => launcher.render());
    void loadSavedLaunches().then(() => launcher.render());
    touch(id);
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
  /** Cowork commons in: the same trade as the team commons — wherever it was, that seat's
   *  surface comes back; the seat it lands on keeps its tiles while it is out. */
  const putCowork = (id, tab = '') => {
    const from = coworkIn();
    if (from && from !== id) cellPlace(from, seats[from].surface.el);
    cellPlace(id, cowork.el);
    if (tab) cowork.select(tab);
    else cowork.select(cowork.current());
    touch(id);
    remember();
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
      const c = commonsIn() === id;
      const k = coworkIn() === id;
      workspaces[id] = c ? { holds: 'commons', tab: channels.current?.() || '' } : k ? { holds: 'cowork', tab: cowork.current?.() || '' } : newIn() === id ? { holds: 'new' } : seats[id].pool.active ? { holds: 'session', session: seats[id].pool.active } : { holds: 'empty' };
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
      if (wanted === COMMONS) putCommons(id);
      else if (wanted === COWORK) putCowork(id);
      else if (wanted === NEW) putNew(id);
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
    const lead = live.filter((m) => m.team_lead).map((m) => m.name);
    const table = el('div', 'tw-config-roster');
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
      touch(liveSeats().find((id) => holds(id) !== COMMONS && holds(id) !== COWORK) || 'workspace1');
      channels.enter(context);
      // ⚙ ON THIS PAGE: the cowork commons into the workspace you are in; pressed again
      // there, the terminal back — the toggle ⛩ taught (layout.js reads this hook).
      S.showNewSession = () => putNew(lastSeat || 'workspace1');
      S.connectSession = (name) => connectSession(name);
      S.showCoworkCommons = (tab = '') => {
        const id = lastSeat || 'workspace1';
        if (coworkIn() === id && !tab) putTerminal(id);
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
      // Every Tile goes — the pools' and the empty ones. A Tile left in this view's DOM
      // is still a Tile to the Sessions grid's roll, and the smoke gate counts it.
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); seat.empty = null; }
      channels.leave();
      if (S.showCoworkCommons) S.showCoworkCommons = null;
      S.showNewSession = null;
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
