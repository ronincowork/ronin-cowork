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
import { refreshHome, statusLabel } from './home.js';
import { request } from './request.js';
import { humanAge } from './shingo.js';
import { sessionsHandlers, teamPageHandlers } from './events.js';
import { createArranger, parseDraft, reportView as sendView } from './team-arrange.js';

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
    // C is sized by the tile head's own button rule; T stands at tab height on the strip.
    const button = el('button', letter === 'T' ? 'tw-flip tw-flip-strip' : 'tw-flip', letter);
    button.type = 'button';
    button.title = letter === 'C' ? 'Show the Team commons in this workspace' : 'Show the terminal in this workspace';
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
      arrange({ [id]: { session: name } });
    });
  }
  const seats = { workspace1: makeSeat('workspace1', 'Workspace 1'), workspace2: makeSeat('workspace2', 'Workspace 2') };

  const kanban = createSurface({ label: 'Team Roster', className: 'tw-kanban' });
  // The roster's header — the same depth as a tile head and the commons' tab strip.
  const rosterHead = el('div', 'tw-roster-head');
  const rosterCount = el('span', 'tw-roster-count');
  const rosterNote = el('span', 'tw-roster-note');
  rosterHead.append(el('span', 'tw-roster-title', 'Team Roster'), rosterCount, rosterNote);
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
  const remember = () => { ctx?.patchViewState('team', { seats: Object.fromEntries(Object.keys(seats).map((id) => [id, holds(id)])) }); reportView(); };
  const lead = () => membersOfTeam(team).find((m) => m.team_lead)?.name || '';

  /** Commons in: the seat's surface (tiles and all) leaves the slot; wherever the
   *  commons was, that seat's surface comes back. */
  const putCommons = (id, tab = '', doc = '') => {
    const from = commonsIn();
    if (from && from !== id) workbench.place(from, seats[from].surface.el);
    workbench.place(id, channels.el);
    if (doc) { channels.select('docs'); void docs.open(doc); } else if (tab) channels.select(tab);
    touch(id);
    remember();
  };
  /** The seat back, with nothing in it: its tiles go; the lead comes back warm on the next paint. */
  const emptySeat = (id) => {
    if (commonsIn() === id) workbench.place(id, seats[id].surface.el);
    seats[id].pool.destroyAll();
    ensureLeadHot(membersOfTeam(team));
    touch(id);
    paintSeats();
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
    putTerminal,
    emptySeat,
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
    for (const id of Object.keys(seats)) {
      const c = commonsIn() === id;
      workspaces[id] = c ? { holds: 'commons', tab: channels.current?.() || '' } : seats[id].pool.active ? { holds: 'session', session: seats[id].pool.active } : { holds: 'empty' };
    }
    return { team, selected: lastSeat, order: [...a.order], hidden: [...a.hidden], workspaces };
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
    rosterNote.textContent = `arranged by ${m.from}`;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => { rosterNote.textContent = ''; }, 6000);
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
      // A remembered session the roster does not have: wait while the roster is still
      // arriving, then let it go — a workspace waiting forever is the blank the owner met.
      else if (wanted && loaded !== team) continue;
      else if (lead() && !isShown(lead())) putSession(lead(), id, false);
      else if (!commonsIn()) putCommons(id);
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
      row.attached ? 'attached' : null,
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
    const add = createCard({ heading: '＋ Add team member', summary: 'Existing session or a new one — arrives with its own slice.', variant: 'dotted' });
    add.el.dataset.inert = 'true';
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
      config.append(el('p', 'tw-config-head', 'No Team selected'));
      return;
    }
    config.append(el('p', 'tw-config-head', team));
    const record = roster
      ? [['Team role', roster.team_role], ['Objective', roster.objective], ['Project root', roster.project_root],
        ['Repositories', (roster.repos || []).join(', ')], ['Branch', roster.branch],
        ['Wipeboard', roster.wipeboard || team], ['State', roster.state]]
      : [['Record', 'tag-only — no durable roster; the team is its sessions’ tags'], ['Wipeboard', team]];
    config.append(createMetadata({ className: 'tw-config-metadata', rows: record }).el);
    config.append(el('p', 'tw-config-head', live.length ? `Live roster · ${live.length}` : 'Live roster · none'));
    if (!live.length) return;
    const lead = live.filter((m) => m.team_lead).map((m) => m.name);
    const table = el('div', 'tw-config-roster');
    const line = (name, reading) => table.append(el('span', 'tw-config-name', name), el('span', 'tw-config-reading', reading));
    line('人', lead.length ? lead.join(', ') : 'not designated');
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
    // THE NAME IS THE OWNER'S (2026-08-26): three tabs each titled "team · Ronin" cannot
    // be told apart, so the bar's field lets each tab say what it is for. Named, the tab
    // reads `<name> · <team>` and nothing else — the house only rides the default, which
    // is the team's own name with createWorkspace's tabTitle() adding "Ronin". Per tab,
    // like everything else here — one tab is one team.
    title: ({ param, viewState }) => {
      const name = viewState?.('team')?.tabName;
      return name ? { bare: `${name} · ${param || 'Team'}` } : (param || 'Team');
    },
    tabName: {
      get: () => ctx?.viewState('team')?.tabName || '',
      placeholder: () => team || 'Team',
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
