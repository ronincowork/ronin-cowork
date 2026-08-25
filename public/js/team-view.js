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
 */
import { WorkspaceKit } from './workspace-kit.js';
import { membersOfTeam, refreshTeams, subscribe, teamByName } from './team-controller.js';
import { createWarmTerminalPool } from './team-terminal-pool.js';
import { createTeamWipeboard } from './team-wipeboard.js';

const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

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

  /* ---------- the three surfaces ---------- */
  const terminalTile = createSurface({ label: 'Focused session', className: 'tw-terminal', flush: true });
  const kanban = createSurface({ label: 'Team sessions', className: 'tw-kanban' });
  // The wipeboard slice is real (owner, 2026-08-25 — the thread, and nothing else; the
  // Brief stays Team Configuration's). Its board id follows the roster: see setBoard below.
  const wipeboard = createTeamWipeboard();
  const docs = el('p', 'tw-note', 'The Team’s working documents arrive with their own slice.');
  const config = el('div', 'tw-config');
  const service = (node) => ({ el: node, mount: () => {}, enter: () => {}, leave: () => {}, destroy: () => {} });
  const channels = createChannelSurface({
    label: 'Team channels',
    // Land on CHAT, by the owner's word (2026-08-25: "I don't want to land on the
    // whiteboard. I want to land on chat. That's fine that it's empty.") — explicit,
    // not the accident of an unqualified default.
    selected: 'chat',
    services: { wipeboard, docs: service(docs), 'team-configuration': service(config) },
  });
  const placeholder = el('div', 'tw-placeholder');
  placeholder.append(
    el('p', 'tw-placeholder-head', 'Terminal Tile'),
    el('p', null, 'Select a Team session to show its warm Tile. Leaving this destination closes every Team transport.'),
  );
  terminalTile.content.append(placeholder);
  const terminalPool = createWarmTerminalPool({
    createHost: createTerminalTileHost,
    container: terminalTile.content,
  });

  const cards = el('div', 'tw-cards');
  kanban.content.append(cards);

  /* ---------- Channel services: read-only in this slice ---------- */
  // Chat is reserved by the Kit and this file adds NOTHING to it — no composer, no fetch,
  // no timer. Its emptiness is the owner's ruling, not an unfinished state.
  // Service DOM and lifecycle are mounted by ChannelSurface above; feature code supplies
  // content only and never owns a second tab/service engine.

  /* ---------- geometry ---------- */
  const workbench = createWorkbenchLayout(terminalTile.el, kanban.el, channels.el, {
    managed: true,
    onStateChange: (state) => ctx?.patchState(state),
  });
  root.append(workbench.host);

  function syncTerminalPool(members) {
    const result = terminalPool.sync(members.map((member) => member.name));
    if (result.removedActive) {
      placeholder.hidden = false;
      ctx?.patchState({ focusedSession: '' });
    }
    return result;
  }

  /* ---------- the Kanban's shells ---------- */
  // THE HOVER FLOURISH: a pointer resting on a card pre-warms that member's tile, so
  // the click lands on a painted terminal. The dwell keeps a pointer skating across the
  // whole roster from spawning a transport per card; the pool itself declines at the
  // stream cap and quietly parks a prewarm nobody clicks.
  // THE LEAD IS ALWAYS HOT — from page entry, focused or not, first visit or return.
  // Pin every 人, then mount each one hidden if it is not already streaming. Runs on
  // load, on every roster change, and on every enter (a re-entry skips load() when the
  // team is unchanged, which is exactly how the lead once arrived cold — 2026-08-25).
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

  function renderCards(members) {
    cards.replaceChildren();
    for (const m of members) {
      const readings = [m.session_role || null, m.dial ? `dial ${m.dial}` : null, m.team_lead ? '人 lead' : null].filter(Boolean);
      const card = createCard({
        heading: m.name,
        summary: m.summary || '',
        metadata: readings,
        mark: m.mark || null,
        selected: terminalPool.active === m.name,
        action: () => {
          if (!terminalPool.show(m.name)) return;
          placeholder.hidden = true;
          ctx?.patchState({ focusedSession: m.name });
          renderCards(members);
        },
      });
      card.el.addEventListener('pointerenter', () => armPrewarm(m.name));
      card.el.addEventListener('pointerleave', disarmPrewarm);
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
    renderCards(members);
    renderConfig(roster.durable ? roster : null, members);
    // THE BOARD IS ASSUMED: the roster's wipeboard id, or the team's own name for a
    // tag-only team. The server creates it on open, so the slice never meets a void.
    wipeboard.setBoard((roster.durable && roster.wipeboard) || name);
    // THE LEAD IS THE TEAM'S DEFAULT SESSION AND IS ALWAYS HOT (owner, 2026-08-25:
    // "the team manager is always hot, regardless"). Pinned first, so nothing ever
    // takes the lead's stream; then, with nothing chosen and nothing showing, the
    // lead's Tile opens — unfocused, so the keyboard is not stolen. A leaderless team
    // keeps the placeholder and pins nobody.
    ensureLeadHot(members);
    if (entered && team === name && !terminalPool.active) {
      const lead = members.find((m) => m.team_lead);
      if (lead && terminalPool.show(lead.name, false)) {
        placeholder.hidden = true;
        ctx?.patchState({ focusedSession: lead.name });
        renderCards(members);
      }
    }
  }

  return {
    el: root,
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
      const typed = teamWorkspaceState(context.state);
      workbench.restore(typed);
      const members = membersOfTeam(team);
      syncTerminalPool(members);
      ensureLeadHot(members);
      const eligible = terminalPool.has(typed.focusedSession);
      if (eligible) { terminalPool.show(typed.focusedSession, false); placeholder.hidden = true; }
      else {
        // Nothing restored: the lead is the team's default session, on re-entry too.
        const lead = members.find((m) => m.team_lead);
        if (lead && terminalPool.show(lead.name, false)) placeholder.hidden = true;
        else placeholder.hidden = false;
      }
      channels.enter(context);
      if (team !== loaded) void load(team);
    },
    leave: () => {
      entered = false;
      disarmPrewarm();
      terminalPool.destroyAll();
      placeholder.hidden = false;
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
