/* part of the ronin-cowork client — see js/README.md */
/**
 * THE TEAM DESTINATION — Eye 2's first deployable preview.
 *
 * What this is: the Team workbench as GEOMETRY AND SHELLS. The owner authorized exactly
 * this slice against the frozen Workspace Kit (18d9b35) and held back the rest, so the
 * boundaries below are deliberate and are not "not done yet":
 *
 *   NO terminal host, NO socket, NO xterm — the terminal Tile is a placeholder Surface.
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

  /* ---------- the three surfaces ---------- */
  const terminalTile = createSurface({ label: 'Focused session', className: 'tw-terminal', flush: true });
  const kanban = createSurface({ label: 'Team sessions', className: 'tw-kanban' });
  const wipeboard = el('p', 'tw-note', 'The Team wipeboard thread arrives with its own slice. The Brief is Team Configuration’s and never appears here.');
  const docs = el('p', 'tw-note', 'The Team’s working documents arrive with their own slice.');
  const config = el('div', 'tw-config');
  const service = (node) => ({ el: node, mount: () => {}, enter: () => {}, leave: () => {}, destroy: () => {} });
  const channels = createChannelSurface({
    label: 'Team channels',
    services: { wipeboard: service(wipeboard), docs: service(docs), 'team-configuration': service(config) },
  });
  // Full mode preserves the existing Tile wholesale: its genuine header, controls,
  // terminal, composer and lifecycle. Team owns only the surrounding Surface chrome.
  const terminalHost = createTerminalTileHost({ mode: 'full' });
  const placeholder = el('div', 'tw-placeholder');
  placeholder.append(
    el('p', 'tw-placeholder-head', 'Terminal Tile'),
    el('p', null, 'Select a Team session to mount it here. Leaving this destination parks and closes its transport.'),
  );
  terminalTile.content.append(placeholder, terminalHost.el);

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

  /* ---------- the Kanban's shells ---------- */
  function renderCards(members) {
    cards.replaceChildren();
    for (const m of members) {
      const readings = [m.session_role || null, m.dial ? `dial ${m.dial}` : null, m.team_lead ? '人 lead' : null].filter(Boolean);
      const card = createCard({
        heading: m.name,
        summary: m.summary || '',
        metadata: readings,
        mark: m.mark || null,
        selected: terminalHost.session === m.name,
        action: () => {
          terminalHost.switchSession(m.name);
          placeholder.hidden = true;
          ctx?.patchState({ focusedSession: m.name });
          renderCards(members);
        },
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
    const roster_ = el('p', 'tw-config-head', `Live roster · ${live.length}`);
    config.append(roster_);
    for (const m of live) config.append(el('div', 'tw-config-row', `${m.name}${m.team_lead ? ' · 人' : ''}`));
    config.append(el('p', 'tw-note', 'Read-only in this preview. Editing, membership and roster creation are later slices.'));
  }

  /* ---------- reading ---------- */
  async function load(name) {
    if (!name) {
      setSurfaceState(kanban.el, 'empty', 'No Team selected.');
      renderCards([]);
      renderConfig(null, []);
      loaded = '';
      return;
    }
    setSurfaceState(kanban.el, 'loading', 'Reading the Team…');
    const result = await refreshTeams();
    if (team !== name) return; // the destination moved while this was in flight
    loaded = name;
    if (!result.live.ok) {
      setSurfaceState(kanban.el, 'failed', `Could not read this Team — ${result.live.message}`);
      renderCards([]);
      renderConfig(null, []);
      return;
    }
    const members = membersOfTeam(name);
    const roster = teamByName(name);
    setSurfaceState(kanban.el, members.length ? null : 'empty', members.length ? '' : 'No live sessions on this Team.');
    renderCards(members);
    renderConfig(roster.durable ? roster : null, members);
  }

  return {
    el: root,
    // The team's own name, alone — createWorkspace's tabTitle() adds the ⛩ and the house.
    title: ({ param }) => param || 'Team',
    mount: (_host, context) => {
      ctx = context;
      channels.mount(context);
      unsubscribe = subscribe(() => {
        if (!team) return;
        const members = membersOfTeam(team);
        const roster = teamByName(team);
        renderCards(members);
        renderConfig(roster.durable ? roster : null, members);
      });
    },
    enter: (context) => {
      ctx = context;
      team = context.param || context.state?.team || '';
      const typed = teamWorkspaceState(context.state);
      workbench.restore(typed);
      const eligible = membersOfTeam(team).some((member) => member.name === typed.focusedSession);
      if (eligible) { terminalHost.switchSession(typed.focusedSession); placeholder.hidden = true; }
      else { terminalHost.park(); placeholder.hidden = false; }
      channels.enter(context);
      if (team !== loaded) void load(team);
    },
    leave: () => {
      terminalHost.park();
      channels.leave();
    },
    destroy: () => { unsubscribe?.(); unsubscribe = null; terminalHost.destroy(); channels.destroy(); },
  };
}
