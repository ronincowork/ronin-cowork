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
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createTeamWipeboard } from './team-wipeboard.js';
import { buildDocs } from './docs.js';
import { refreshHome } from './home.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

const COMMONS = '@commons'; // what a workspace remembers when it holds the commons
const DRAG_TYPE = 'text/x-ronin-session';

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
    const button = el('button', 'tw-flip', letter);
    button.type = 'button';
    button.title = letter === 'C' ? 'Show the Team commons in this workspace' : 'Show the terminal in this workspace';
    button.addEventListener('click', () => {
      const id = button.closest('[data-surface]')?.dataset.surface;
      if (!seats[id]) return;
      if (letter === 'C') putCommons(id); else putTerminal(id);
      renderCards(membersOfTeam(team));
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
    acceptDrops(surface.el, () => id);
    const pool = createWarmTerminalPool({
      createHost: (options) => createTerminalTileHost({ ...options, actions: [flipButton('C')] }),
      container: surface.content,
      streamCap: 2,
    });
    return { id, surface, pool, empty: null };
  };
  /** The empty tile is in the seat exactly when no member is shown there. Built on first
   *  need, not at page load: a Tile registers itself with the Sessions grid's roll. */
  const paintSeats = () => {
    for (const seat of Object.values(seats)) {
      if (seat.pool.active) seat.empty?.el.remove();
      else if (!seat.empty) {
        seat.empty = createTerminalTileHost({ mode: 'full', actions: [flipButton('C')] });
        seat.empty.mount();
        seat.surface.content.append(seat.empty.el);
      } else if (!seat.empty.el.isConnected) seat.surface.content.append(seat.empty.el);
    }
  };
  // The selected workspace carries the highlight the Sessions grid gives its active
  // tile (`.tile.active`) — that is where the next card lands.
  const touch = (id) => {
    lastSeat = id;
    for (const seat of Object.values(seats)) for (const tile of seat.surface.content.querySelectorAll('.tile')) tile.classList.toggle('active', seat.id === id);
  };
  // A card dragged onto a workspace lands in that workspace.
  function acceptDrops(node, seatOf) {
    node.addEventListener('dragover', (event) => {
      if (![...event.dataTransfer.types].includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      node.dataset.dropReady = 'true';
    });
    node.addEventListener('dragleave', () => { delete node.dataset.dropReady; });
    node.addEventListener('drop', (event) => {
      delete node.dataset.dropReady;
      const name = event.dataTransfer.getData(DRAG_TYPE);
      const id = seatOf();
      if (!name || !id) return;
      event.preventDefault();
      if (putSession(name, id)) renderCards(membersOfTeam(team));
    });
  }
  const seats = { workspace1: makeSeat('workspace1', 'Workspace 1'), workspace2: makeSeat('workspace2', 'Workspace 2') };

  const kanban = createSurface({ label: 'Team Roster', className: 'tw-kanban' });
  // The roster's header — the same depth as a tile head and the commons' tab strip.
  const rosterHead = el('div', 'tw-roster-head');
  const rosterCount = el('span', 'tw-roster-count');
  rosterHead.append(el('span', 'tw-roster-title', 'Team Roster'), rosterCount);
  kanban.el.prepend(rosterHead);
  const cards = el('div', 'tw-cards');
  kanban.content.append(cards);

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
    label: 'Team commons',
    // Land on CHAT, by the owner's word (2026-08-25: "I don't want to land on the
    // whiteboard. I want to land on chat. That's fine that it's empty.") — explicit,
    // not the accident of an unqualified default.
    selected: 'chat',
    services: { wipeboard, docs: docsService, 'team-configuration': service(config) },
    actions: [flipButton('T')],
  });
  channels.el.addEventListener('pointerdown', () => { const id = commonsIn(); if (id) touch(id); });
  acceptDrops(channels.el, () => commonsIn());
  // Chat is reserved by the Kit and this file adds NOTHING to it — no composer, no fetch,
  // no timer. Its emptiness is the owner's ruling, not an unfinished state.

  /* ---------- geometry: the whole of it is this declaration ---------- */
  // Three slots by name; the Kit's frame draws them and the Kit's layout map in the bar
  // shows, hides and reorders them. The roster goes down to 6% and turns compact under
  // 11rem (176px) — the frame writes data-width on its slot and the Kit's card CSS reads it.
  const DECLARATION = {
    slots: [
      { name: 'workspace1', label: 'Workspace 1', width: 40 },
      { name: 'roster', label: 'Team Roster', width: 20, min: 6, compact: 176 },
      { name: 'workspace2', label: 'Workspace 2', width: 40 },
    ],
  };
  const workbench = createWorkbenchLayout({
    declaration: DECLARATION,
    surfaces: { workspace1: seats.workspace1.surface.el, roster: kanban.el, workspace2: seats.workspace2.surface.el },
    onStateChange: (arrangement) => ctx?.patchViewState('team', { arrangement }),
  });
  root.append(workbench.host);

  /* ---------- in and out ---------- */
  const commonsIn = () => Object.keys(seats).find((id) => workbench.holding(id) === channels.el) || '';
  const holds = (id) => (commonsIn() === id ? COMMONS : seats[id].pool.active);
  const isShown = (name) => Object.values(seats).some((seat) => seat.pool.active === name && commonsIn() !== seat.id);
  const remember = () => ctx?.patchViewState('team', { seats: Object.fromEntries(Object.keys(seats).map((id) => [id, holds(id)])) });
  const lead = () => membersOfTeam(team).find((m) => m.team_lead)?.name || '';

  /** Commons in: the seat's surface (tiles and all) leaves the slot; wherever the
   *  commons was, that seat's surface comes back. */
  const putCommons = (id) => {
    const from = commonsIn();
    if (from && from !== id) workbench.place(from, seats[from].surface.el);
    workbench.place(id, channels.el);
    touch(id);
    remember();
  };
  /** Terminal in: the seat's surface comes back as it was; a seat that never showed
   *  anyone gets the lead. */
  const putTerminal = (id) => {
    workbench.place(id, seats[id].surface.el);
    if (!seats[id].pool.active && lead() && seats[id].pool.has(lead())) seats[id].pool.show(lead(), false);
    touch(id);
    paintSeats();
    remember();
  };
  /** A session in: the terminal comes in if the commons was there, then the tile shows it. */
  const putSession = (name, id, focus = true) => {
    if (!seats[id].pool.has(name)) return false;
    if (commonsIn() === id) workbench.place(id, seats[id].surface.el);
    if (!seats[id].pool.show(name, focus)) return false;
    touch(id);
    paintSeats();
    remember();
    return true;
  };

  /** Fill each empty workspace: what it remembers first, else the defaults — the lead
   *  left, the commons right. Runs on enter AND when the roster arrives, since on a cold
   *  reload the roster is not known yet at enter. */
  let remembered = {};
  const seatTheTeam = () => {
    for (const id of Object.keys(seats)) {
      if (holds(id)) continue;
      const wanted = remembered[id];
      if (wanted === COMMONS) putCommons(id);
      else if (wanted && seats[id].pool.has(wanted)) putSession(wanted, id, false);
      else if (!wanted && lead() && !isShown(lead())) putSession(lead(), id, false);
      else if (!wanted && !commonsIn()) putCommons(id);
    }
  };

  const syncPools = (members) => {
    const names = members.map((m) => m.name);
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
  function renderCards(members) {
    rosterCount.textContent = members.length ? String(members.length) : '';
    cards.replaceChildren();
    for (const m of members) {
      const readings = [m.session_role || null, m.dial ? `dial ${m.dial}` : null, m.team_lead ? '人 lead' : null].filter(Boolean);
      const card = createCard({
        heading: m.name,
        summary: m.summary || '',
        metadata: readings,
        mark: m.mark || null,
        selected: isShown(m.name),
        action: () => { if (putSession(m.name, lastSeat)) renderCards(members); },
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
    const add = createCard({ heading: '＋ Add team member', summary: 'Existing session or a new one — arrives with its own slice.', variant: 'dotted' });
    add.el.dataset.inert = 'true';
    cards.append(add.el);
  }

  /* ---------- Team Configuration: READ ONLY ---------- */
  function renderConfig(roster, live) {
    config.replaceChildren();
    if (!roster) {
      config.append(
        el('p', 'tw-config-head', team ? `${team} has no roster` : 'No Team selected'),
        el('p', 'tw-note', 'A Team with no durable record is an ordinary state — most Teams on a box are tag-only. Creating one is a later slice; this Surface reads and does not write.'),
      );
      return;
    }
    config.append(el('p', 'tw-config-head', roster.name));
    const metadata = createMetadata({ className: 'tw-config-metadata', rows: [
      ['Team role', roster.team_role], ['Objective', roster.objective], ['Project root', roster.project_root],
      ['Repositories', (roster.repos || []).join(', ')], ['Branch', roster.branch], ['Wipeboard', roster.wipeboard],
      ['State', roster.state],
    ] });
    config.append(metadata.el);
    config.append(el('p', 'tw-config-head', `Live roster · ${live.length}`));
    for (const m of live) config.append(el('div', 'tw-config-row', `${m.name}${m.team_lead ? ' · 人' : ''}`));
    config.append(el('p', 'tw-note', 'Read-only in this preview. Editing, membership and roster creation are later slices.'));
  }

  /* ---------- reading ---------- */
  const paint = () => {
    const members = membersOfTeam(team);
    const roster = teamByName(team);
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
      setSurfaceState(kanban.el, 'empty', 'No Team selected.');
      renderCards([]);
      renderConfig(null, []);
      loaded = '';
      return;
    }
    setSurfaceState(kanban.el, 'loading', 'Reading the Team…');
    const result = await refreshTeams();
    if (!entered || team !== name) return; // the destination moved while this was in flight
    loaded = name;
    if (!result.live.ok) {
      setSurfaceState(kanban.el, 'failed', `Could not read this Team — ${result.live.message}`);
      renderCards([]);
      renderConfig(null, []);
      return;
    }
    const members = membersOfTeam(name);
    setSurfaceState(kanban.el, members.length ? null : 'empty', members.length ? '' : 'No live sessions on this Team.');
    paint();
  }

  return {
    el: root,
    // The ViewHost draws the Kit's layout map in the bar for this while the view is active.
    arrangement: workbench.arrangement,
    // The team's own name, alone — createWorkspace's tabTitle() adds the ⛩ and the house.
    title: ({ param }) => param || 'Team',
    mount: (_host, context) => {
      ctx = context;
      channels.mount(context);
      unsubscribe = subscribe(() => { if (entered && team) paint(); });
    },
    enter: (context) => {
      ctx = context;
      entered = true;
      for (const seat of Object.values(seats)) seat.pool.destroyAll();
      team = context.param || context.state?.team || '';
      const typed = teamWorkspaceState(context.state, context.viewState('team'), DECLARATION);
      workbench.restore(typed.arrangement);
      // What each workspace remembers holding; the old one-seat focusedSession lands in
      // the first workspace, once. With nothing remembered: the lead left, the commons right.
      remembered = { ...typed.seats };
      if (!Object.keys(remembered).length) remembered = typed.focusedSession ? { workspace1: typed.focusedSession, workspace2: COMMONS } : { workspace2: COMMONS };
      const members = membersOfTeam(team);
      syncPools(members);
      ensureLeadHot(members);
      seatTheTeam();
      paintSeats();
      touch(Object.keys(seats).find((id) => holds(id) !== COMMONS) || 'workspace1');
      channels.enter(context);
      if (team !== loaded) void load(team);
    },
    leave: () => {
      // Leaving the destination closes every Team transport; the seats remember what
      // they held and get it back on re-entry.
      entered = false;
      disarmPrewarm();
      // Every Tile goes — the pools' and the empty ones. A Tile left in this view's DOM
      // is still a Tile to the Sessions grid's roll, and the smoke gate counts it.
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); seat.empty = null; }
      channels.leave();
    },
    destroy: () => {
      entered = false;
      unsubscribe?.();
      unsubscribe = null;
      for (const seat of Object.values(seats)) { seat.pool.destroyAll(); seat.empty?.destroy(); }
      channels.destroy();
    },
  };
}
