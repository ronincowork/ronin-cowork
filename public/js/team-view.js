/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM DESTINATION — Eye 2's first deployable preview.
 *
 * What this is: the Team workbench over the hardened Workspace Kit. Its boundaries are
 * deliberate:
 *
 *   Full existing Tiles only — one warm Kit host per live member while this view is entered.
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
 * KEEP IT SIMPLE (owner, 2026-08-25). Two workspaces, each holding exactly one thing: a
 * member's tile, or the team commons — "it's there or it's not there". The warm and hold
 * rules are the pool's (team-terminal-pool.js) and stand: warm is durable, the lead is
 * pinned hot, four streams is the cap. A member has one host, so picking a session that
 * is up in the other workspace moves it; the box it left is simply empty.
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
  // (owner, 2026-08-25: "just make it a button, just like the other buttons … a T and a
  // C"). C on a terminal's head row trades in the commons; T on the commons' tab strip
  // trades the terminal back. It acts on whichever workspace it finds itself in.
  const flipButton = (letter) => {
    const button = el('button', 'tw-flip', letter);
    button.type = 'button';
    button.title = letter === 'C' ? 'Show the Team commons in this workspace' : 'Show a terminal in this workspace';
    button.addEventListener('click', () => {
      const seat = button.closest('[data-surface]')?.dataset.surface;
      if (!seat || !seats[seat]) return;
      if (letter === 'C' ? putCommons(seat) : putTerminal(seat)) renderCards(membersOfTeam(team));
    });
    return button;
  };

  /* ---------- the workspaces: two seats, the roster between them, one commons ---------- */
  // A seat's surface holds its member's tile, or nothing. The commons is not a child of
  // any seat — the Kit slot holds EITHER the seat's surface OR the commons, traded
  // through place().
  const makeSeat = (id, label) => {
    const surface = createSurface({ label, className: 'tw-terminal', flush: true });
    surface.el.addEventListener('pointerdown', () => touch(id));
    acceptDrops(surface.el, () => id);
    return { id, surface, traded: '' };
  };
  // THE SELECTED WORKSPACE carries the same highlight the Sessions grid gives its active
  // tile (`.tile.active`) — that is where the next card lands.
  const touch = (id) => {
    lastSeat = id;
    for (const seat of Object.values(seats)) seat.surface.content.querySelector('.tile')?.classList.toggle('active', seat.id === id);
  };
  // BOTH WAYS (owner, 2026-08-25): a click lands in the seat last touched; a card
  // dragged onto a workspace lands in that workspace — the commons included.
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
      const seat = seatOf();
      if (!name || !seat) return;
      event.preventDefault();
      if (put(name, seat)) renderCards(membersOfTeam(team));
    });
  }
  const seats = { workspace1: makeSeat('workspace1', 'Workspace 1'), workspace2: makeSeat('workspace2', 'Workspace 2') };
  const kanban = createSurface({ label: 'Team sessions', className: 'tw-kanban' });
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
  channels.el.addEventListener('pointerdown', () => { const seat = commonsIn(); if (seat) touch(seat); });
  acceptDrops(channels.el, () => commonsIn());

  const terminalPool = createWarmTerminalPool({
    createHost: (options) => createTerminalTileHost({ ...options, actions: [flipButton('C')] }),
    seats: { workspace1: seats.workspace1.surface.content, workspace2: seats.workspace2.surface.content },
  });

  const cards = el('div', 'tw-cards');
  kanban.content.append(cards);

  /* ---------- Channel services: read-only in this slice ---------- */
  // Chat is reserved by the Kit and this file adds NOTHING to it — no composer, no fetch,
  // no timer. Its emptiness is the owner's ruling, not an unfinished state.
  // Service DOM and lifecycle are mounted by ChannelSurface above; feature code supplies
  // content only and never owns a second tab/service engine.

  /* ---------- geometry: the whole of it is this declaration ---------- */
  // Three slots by name; the Kit's frame draws them and the Kit's layout map in the bar
  // shows, hides and reorders them. Commons-on-the-left is a reordered array here, not a
  // frame change. The action column (roster) goes down to 6% and turns compact under
  // 11rem (176px) — the frame writes data-width on its slot and the Kit's card CSS reads it.
  const DECLARATION = {
    slots: [
      { name: 'workspace1', label: 'Workspace 1', width: 40 },
      { name: 'roster', label: 'Team sessions', width: 20, min: 6, compact: 176 },
      { name: 'workspace2', label: 'Workspace 2', width: 40 },
    ],
  };
  const workbench = createWorkbenchLayout({
    declaration: DECLARATION,
    surfaces: { workspace1: seats.workspace1.surface.el, roster: kanban.el, workspace2: seats.workspace2.surface.el },
    onStateChange: (arrangement) => ctx?.patchViewState('team', { arrangement }),
  });
  root.append(workbench.host);

  /* ---------- what each workspace holds ---------- */
  const commonsIn = () => Object.keys(seats).find((id) => workbench.holding(id) === channels.el) || '';
  const holds = (id) => (commonsIn() === id ? COMMONS : terminalPool.activeIn(id));
  const remember = () => ctx?.patchViewState('team', { seats: Object.fromEntries(Object.keys(seats).map((id) => [id, holds(id)])) });

  /** Trade the commons into a workspace: wherever it was gets its seat back, and this
   *  workspace's member goes to the holding, warm — remembered, so T brings it back. */
  const putCommons = (id) => {
    const from = commonsIn();
    if (from === id) { touch(id); return true; }
    if (from) workbench.place(from, seats[from].surface.el);
    seats[id].traded = terminalPool.activeIn(id);
    terminalPool.clearSeat(id);
    workbench.place(id, channels.el);
    touch(id);
    remember();
    return true;
  };
  /** Trade a terminal back into a workspace holding the commons: the member the commons
   *  displaced, else the lead, else an empty box. */
  const putTerminal = (id) => {
    if (commonsIn() !== id) { touch(id); return false; }
    workbench.place(id, seats[id].surface.el);
    const lead = membersOfTeam(team).find((m) => m.team_lead)?.name || '';
    const pick = [seats[id].traded, lead].find((name) => name && terminalPool.has(name) && !terminalPool.isShown(name)) || '';
    if (pick) terminalPool.show(pick, false, id);
    touch(id);
    remember();
    return true;
  };
  /** Trade a member into a workspace: if the commons was there it comes out first. */
  const putSession = (name, id, focus = true) => {
    if (!terminalPool.has(name)) return false;
    if (commonsIn() === id) workbench.place(id, seats[id].surface.el);
    if (!terminalPool.show(name, focus, id)) return false;
    touch(id);
    remember();
    return true;
  };
  const put = (name, id, focus = true) => (name === COMMONS ? putCommons(id) : putSession(name, id, focus));

  /** Fill each empty workspace: what it remembers first, else the defaults — the lead in
   *  the first empty seat, the commons in the next. Runs on enter AND when the roster
   *  arrives: on a cold reload the roster is not known yet at enter, and a remembered
   *  member must not lose its seat to the lead. */
  let remembered = {};
  const seatTheTeam = (members) => {
    const lead = members.find((m) => m.team_lead)?.name || '';
    let changed = false;
    for (const id of Object.keys(seats)) {
      if (holds(id)) continue;
      const wanted = remembered[id];
      if (wanted === COMMONS) { if (putCommons(id)) changed = true; continue; }
      if (wanted && terminalPool.has(wanted) && !terminalPool.isShown(wanted)) { if (putSession(wanted, id, false)) changed = true; continue; }
      if (wanted) continue; // remembered, not here yet — the roster may still be arriving
      if (lead && !terminalPool.isShown(lead)) { if (putSession(lead, id, false)) changed = true; }
      else if (!commonsIn()) { if (putCommons(id)) changed = true; }
    }
    return changed;
  };

  function syncTerminalPool(members) {
    const result = terminalPool.sync(members.map((member) => member.name));
    if (result.removedActive) remember();
    return result;
  }

  /* ---------- the roster's cards ---------- */
  // THE HOVER FLOURISH: a pointer resting on a card pre-warms that member's tile, so
  // the click lands on a painted terminal. The dwell keeps a pointer skating across the
  // whole roster from spawning a transport per card; the pool itself declines at the
  // stream cap and quietly parks a prewarm nobody clicks.
  // THE LEAD IS ALWAYS HOT — from page entry, focused or not, first visit or return.
  // Pin every 人, then mount each one warm if it is not already streaming. Runs on
  // load, on every roster change, and on every enter.
  const ensureLeadHot = (members) => {
    const leads = members.filter((m) => m.team_lead).map((m) => m.name);
    terminalPool.setPinned(leads);
    for (const lead of leads) terminalPool.keepHot(lead);
  };

  let dwellTimer = 0;
  const armPrewarm = (name) => {
    window.clearTimeout(dwellTimer);
    dwellTimer = window.setTimeout(() => terminalPool.prewarm(name), 150);
  };
  const disarmPrewarm = () => window.clearTimeout(dwellTimer);

  const draggable = (node, name) => {
    node.draggable = true;
    node.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData(DRAG_TYPE, name);
      event.dataTransfer.setData('text/plain', name);
      event.dataTransfer.effectAllowed = 'move';
    });
  };

  function renderCards(members) {
    cards.replaceChildren();
    // THE COMMONS IS A CARD: what a workspace can hold is what the roster lists.
    const commons = createCard({
      heading: 'Team commons',
      summary: 'chat · wipeboard · docs · configuration',
      mark: '⛩',
      className: 'tw-commons-card',
      selected: !!commonsIn(),
      action: () => { if (put(COMMONS, lastSeat)) renderCards(members); },
    });
    draggable(commons.el, COMMONS);
    cards.append(commons.el);
    for (const m of members) {
      const readings = [m.session_role || null, m.dial ? `dial ${m.dial}` : null, m.team_lead ? '人 lead' : null].filter(Boolean);
      const card = createCard({
        heading: m.name,
        summary: m.summary || '',
        metadata: readings,
        mark: m.mark || null,
        selected: terminalPool.isShown(m.name),
        action: () => { if (put(m.name, lastSeat)) renderCards(members); },
      });
      card.el.addEventListener('pointerenter', () => armPrewarm(m.name));
      card.el.addEventListener('pointerleave', disarmPrewarm);
      draggable(card.el, m.name);
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
    const roster_ = el('p', 'tw-config-head', `Live roster · ${live.length}`);
    config.append(roster_);
    for (const m of live) config.append(el('div', 'tw-config-row', `${m.name}${m.team_lead ? ' · 人' : ''}`));
    config.append(el('p', 'tw-note', 'Read-only in this preview. Editing, membership and roster creation are later slices.'));
  }

  /* ---------- reading ---------- */
  async function load(name) {
    if (!name) {
      syncTerminalPool([]);
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
    const roster = teamByName(name);
    syncTerminalPool(members);
    setSurfaceState(kanban.el, members.length ? null : 'empty', members.length ? '' : 'No live sessions on this Team.');
    renderConfig(roster.durable ? roster : null, members);
    // THE BOARD IS ASSUMED: the roster's wipeboard id, or the team's own name for a
    // tag-only team. The server creates it on open, so the slice never meets a void.
    wipeboard.setBoard((roster.durable && roster.wipeboard) || name);
    // THE LEAD IS THE TEAM'S DEFAULT SESSION AND IS ALWAYS HOT (owner, 2026-08-25:
    // "the team manager is always hot, regardless"). Pinned first, so nothing ever
    // takes the lead's stream; then an empty workspace gets the lead — unfocused, so the
    // keyboard is not stolen. A leaderless team pins nobody.
    ensureLeadHot(members);
    seatTheTeam(members);
    touch(lastSeat);
    renderCards(members);
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
      unsubscribe = subscribe(() => {
        if (!entered || !team) return;
        const members = membersOfTeam(team);
        const roster = teamByName(team);
        syncTerminalPool(members);
        ensureLeadHot(members);
        seatTheTeam(members);
        touch(lastSeat);
        renderCards(members);
        renderConfig(roster.durable ? roster : null, members);
        wipeboard.setBoard((roster.durable && roster.wipeboard) || team);
      });
    },
    enter: (context) => {
      ctx = context;
      entered = true;
      terminalPool.destroyAll();
      team = context.param || context.state?.team || '';
      const typed = teamWorkspaceState(context.state, context.viewState('team'), DECLARATION);
      workbench.restore(typed.arrangement);
      const members = membersOfTeam(team);
      syncTerminalPool(members);
      ensureLeadHot(members);
      // What each workspace remembers holding; the old one-seat focusedSession lands in
      // the first workspace, once. With nothing remembered: the lead left, the commons right.
      remembered = { ...typed.seats };
      if (!Object.keys(remembered).length) remembered = typed.focusedSession ? { workspace1: typed.focusedSession, workspace2: COMMONS } : { workspace2: COMMONS };
      seatTheTeam(members);
      touch(Object.keys(seats).find((id) => holds(id) !== COMMONS) || 'workspace1');
      channels.enter(context);
      if (team !== loaded) void load(team);
    },
    leave: () => {
      // Leaving the destination closes every Team transport; the seats remember what
      // they held and get it back on re-entry.
      entered = false;
      disarmPrewarm();
      terminalPool.destroyAll();
      channels.leave();
    },
    destroy: () => {
      entered = false;
      unsubscribe?.();
      unsubscribe = null;
      terminalPool.destroyAll();
      channels.destroy();
    },
  };
}
