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
 * WHAT THIS FILE OWNS AND THE KIT DOES NOT. `createWorkbenchLayout` hides a collapsed
 * surface outright (`hidden = true`), so a collapsed region carries no control and could
 * not be reopened from inside the layout. The expand rails, the splitters and the
 * persistence are therefore this feature's chrome, built on top of the frozen geometry
 * rather than by forking it. The Kit stays untouched.
 */
import { WorkspaceKit } from './workspace-kit.js';
import { request } from './request.js';

const SURFACES = ['terminalTile', 'kanban', 'channels'];
/** The reviewed artifact's bounds are pixels; the frozen layout clamps percent (25–60). */
const BOUNDS = { left: [25, 60], right: [25, 60] };
const el = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text != null) out.textContent = String(text);
  return out;
};

/** One rail per collapsible surface — the control the frozen layout cannot carry itself. */
function buildRail(surface, label, onExpand) {
  const rail = el('button', 'tw-rail');
  rail.type = 'button';
  rail.hidden = true;
  rail.dataset.rail = surface;
  rail.title = `Show ${label}`;
  rail.setAttribute('aria-label', rail.title);
  rail.append(el('span', 'tw-rail-mark', surface === 'channels' ? '«' : '»'), el('span', 'tw-rail-label', label));
  rail.addEventListener('click', () => onExpand(surface));
  return rail;
}

export function createTeamView() {
  // Resolved INSIDE the factory, never at module top level: a top-level read of an imported
  // binding is the load-order fragility public/js/README.md rule 4 forbids, and the module
  // gate enforces it.
  const { createSurface, createCard, createChannelSurface, setSurfaceState } = WorkspaceKit.primitives;
  const { createWorkbenchLayout } = WorkspaceKit.layouts;

  const root = el('main', 'tw-view');
  let ctx = null;
  let team = '';
  let loaded = ''; // the team whose roster reading is currently drawn

  /* ---------- the three surfaces ---------- */
  const terminalTile = createSurface({ label: 'Focused session', className: 'tw-terminal' });
  const kanban = createSurface({ label: 'Team sessions', className: 'tw-kanban' });
  const channels = createChannelSurface({ label: 'Team channels' });

  // The focused Tile carries ONE piece of identity — the @session label on its rail
  // (owner's ruling) — and no second header. There is no session yet in this slice, so it
  // states that plainly rather than drawing a fake one.
  const actions = el('div', 'tw-actions');
  const collapseLeft = el('button', 'tw-collapse', '«');
  collapseLeft.type = 'button';
  collapseLeft.title = 'Hide the focused session';
  const label = el('span', 'tw-session-label', '—');
  actions.append(collapseLeft, label, el('span', 'tw-grow'));
  for (const [mark, title] of [['⚡', 'Session macros'], ['🏷', 'Teams'], ['🎛', 'Control'], ['📝', 'Note'], ['メ', 'More']]) {
    const b = el('button', 'tw-action', mark);
    b.type = 'button';
    b.title = `${title} — arrives with the terminal host`;
    b.disabled = true;
    actions.append(b);
  }
  terminalTile.controls.hidden = false;
  terminalTile.controls.append(actions);
  const placeholder = el('div', 'tw-placeholder');
  placeholder.append(
    el('p', 'tw-placeholder-head', 'Terminal Tile'),
    el('p', null, 'The terminal host is a later gate. This Surface is the reserved geometry for it — no socket is opened and no session is attached.'),
  );
  terminalTile.content.append(placeholder);

  const collapseRight = el('button', 'tw-collapse', '»');
  collapseRight.type = 'button';
  collapseRight.title = 'Hide the Team channels';
  channels.controls.hidden = false;
  channels.controls.append(collapseRight);

  const collapseKanban = el('button', 'tw-collapse', '⌃');
  collapseKanban.type = 'button';
  collapseKanban.title = 'Hide the Team sessions';
  kanban.controls.hidden = false;
  kanban.controls.append(collapseKanban);
  const cards = el('div', 'tw-cards');
  kanban.content.append(cards);

  /* ---------- Channel services: read-only in this slice ---------- */
  // Chat is reserved by the Kit and this file adds NOTHING to it — no composer, no fetch,
  // no timer. Its emptiness is the owner's ruling, not an unfinished state.
  const wipeboard = el('p', 'tw-note', 'The Team wipeboard thread arrives with its own slice. The Brief is Team Configuration’s and never appears here.');
  channels.services.get('wipeboard').append(wipeboard);
  channels.services.get('docs').append(el('p', 'tw-note', 'The Team’s working documents arrive with their own slice.'));
  const config = el('div', 'tw-config');
  channels.services.get('team-configuration').append(config);

  /* ---------- geometry ---------- */
  const workbench = createWorkbenchLayout(terminalTile.el, kanban.el, channels.el);
  const rails = {
    terminalTile: buildRail('terminalTile', 'Focused session', (s) => setCollapsed(s, false)),
    kanban: buildRail('kanban', 'Team sessions', (s) => setCollapsed(s, false)),
    channels: buildRail('channels', 'Team channels', (s) => setCollapsed(s, false)),
  };
  const railStrip = el('div', 'tw-rails');
  railStrip.append(rails.terminalTile, rails.kanban, rails.channels);
  root.append(railStrip, workbench.el);

  const stateOf = () => ctx?.state ?? null;
  const collapsedMap = () => ({ ...(stateOf()?.surfaces || {}) });

  function setCollapsed(surface, on, persist = true) {
    if (!SURFACES.includes(surface)) return;
    workbench.setCollapsed(surface, on);
    rails[surface].hidden = !on;
    railStrip.hidden = !SURFACES.some((s) => !rails[s].hidden);
    if (persist) ctx?.patchState({ surfaces: { ...collapsedMap(), [surface]: !!on } });
  }
  collapseLeft.addEventListener('click', () => setCollapsed('terminalTile', true));
  collapseRight.addEventListener('click', () => setCollapsed('channels', true));
  collapseKanban.addEventListener('click', () => setCollapsed('kanban', true));

  /* ---------- bounded resize, persisted ---------- */
  const splitters = {};
  for (const side of ['left', 'right']) {
    const grip = el('div', 'tw-splitter');
    grip.dataset.side = side;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', side === 'left' ? 'Resize the focused session' : 'Resize the Team channels');
    grip.tabIndex = 0;
    splitters[side] = grip;
    workbench.el.append(grip);
    grip.addEventListener('pointerdown', (event) => {
      if (window.matchMedia('(max-width: 680px)').matches) return;
      const rect = workbench.el.getBoundingClientRect();
      if (!rect.width) return;
      grip.setPointerCapture(event.pointerId);
      grip.classList.add('tw-dragging');
      const move = (ev) => {
        const ratio = ((side === 'left' ? ev.clientX - rect.left : rect.right - ev.clientX) / rect.width) * 100;
        const [lo, hi] = BOUNDS[side];
        applyWidths(side === 'left' ? { left: Math.max(lo, Math.min(hi, ratio)) } : { right: Math.max(lo, Math.min(hi, ratio)) });
      };
      const done = () => {
        grip.classList.remove('tw-dragging');
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', done);
        grip.removeEventListener('pointercancel', done);
        ctx?.patchState({ widths: currentWidths() });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', done);
      grip.addEventListener('pointercancel', done);
    });
  }
  let widths = { left: 40, right: 40 };
  const currentWidths = () => ({ ...widths });
  function applyWidths(patch) {
    widths = { ...widths, ...patch };
    // The frozen setWidths clamps and resolves the pair; take back what it decided so the
    // persisted number is the one actually rendered, not the one asked for.
    const resolved = workbench.setWidths(widths.left, widths.right);
    widths = { left: resolved.left, right: resolved.right };
  }

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
      });
      // Selection arrives with the terminal host; a card that cannot focus anything yet
      // must not pretend to be pressable.
      card.el.dataset.inert = 'true';
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
    for (const [k, v] of [
      ['Team role', roster.team_role], ['Objective', roster.objective], ['Project root', roster.project_root],
      ['Repositories', (roster.repos || []).join(', ')], ['Branch', roster.branch], ['Wipeboard', roster.wipeboard],
      ['State', roster.state],
    ]) {
      const row = el('div', 'tw-config-row');
      row.append(el('span', 'tw-config-key', k), el('span', 'tw-config-value', v || '—'));
      config.append(row);
    }
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
    const [liveRes, rosterRes] = await Promise.all([
      request(`/api/teams/${encodeURIComponent(name)}/live`, { cache: 'no-store' }),
      request(`/api/team-rosters/${encodeURIComponent(name)}`, { cache: 'no-store' }),
    ]);
    if (team !== name) return; // the destination moved while this was in flight
    loaded = name;
    if (!liveRes.ok) {
      setSurfaceState(kanban.el, 'failed', `Could not read this Team — ${liveRes.message}`);
      renderCards([]);
      renderConfig(rosterRes.ok ? rosterRes.data : null, []);
      return;
    }
    const members = liveRes.data?.members || [];
    setSurfaceState(kanban.el, members.length ? null : 'empty', members.length ? '' : 'No live sessions on this Team.');
    renderCards(members);
    renderConfig(rosterRes.ok ? rosterRes.data : null, members);
  }

  return {
    el: root,
    // The team's own name, alone — createWorkspace's tabTitle() adds the ⛩ and the house.
    title: ({ param }) => param || 'Team',
    mount: (_host, context) => {
      ctx = context;
    },
    enter: (context) => {
      ctx = context;
      team = context.param || context.state?.team || '';
      const stored = context.state?.widths || {};
      applyWidths({ left: Number(stored.left) || 40, right: Number(stored.right) || 40 });
      for (const s of SURFACES) setCollapsed(s, !!context.state?.surfaces?.[s], false);
      if (team !== loaded) void load(team);
    },
    leave: () => {
      // Nothing to tear down in this slice: no socket, no timer, no observer. Recorded so
      // the next author knows the absence is deliberate rather than forgotten.
    },
  };
}
