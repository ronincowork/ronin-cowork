/* Named Workspace Kit compositions. These establish geometry only. */

import { WorkspacePrimitives } from './workspace-primitives.js';

const layout = (name, surfaces) => {
  const el = document.createElement('div');
  el.className = `wk-layout wk-${name}`;
  el.dataset.layout = name;
  for (const [surface, child] of Object.entries(surfaces)) {
    const host = document.createElement('div');
    host.className = `wk-layout-surface wk-layout-surface-${surface}`;
    host.dataset.surface = surface;
    if (child instanceof Node) host.append(child);
    el.append(host);
  }
  return el;
};

const createLeagueBoard = (cards = null) => layout('league-board', { cards });
const createSessionGrid = (tiles = null) => layout('session-grid', { tiles });
const createExplorerLayout = (rail = null, content = null) => layout('explorer-layout', { rail, content });
// Agent Configuration has configuration and resolved-profile preview surfaces. It does
// not imply or reserve a terminal Tile.
const createAgentConfigurationLayout = (configuration = null, preview = null) =>
  layout('agent-configuration-layout', { configuration, preview });
// Transaction is the durable home for preflight, progress, receipts, partial failure and
// retry. New Team decides their behavior; the Kit guarantees they are not transient toast.
const createNewTeamLayout = (definition = null, roster = null, transaction = null) =>
  layout('new-team-layout', { definition, roster, transaction });

function createWorkbenchLayout(terminalTile = null, kanban = null, channels = null, options = {}) {
  const el = layout('workbench-layout', { terminalTile, kanban, channels });
  const managed = options.managed === true;
  const host = document.createElement('div');
  host.className = 'wk-workbench-host';
  const rails = document.createElement('div');
  rails.className = 'wk-workbench-rails';
  rails.hidden = true;
  host.append(rails, el);
  const surfaces = { terminalTile, kanban, channels };
  const labels = { terminalTile: 'focused session', kanban: 'Team sessions', channels: 'Team channels' };
  const collapsed = { terminalTile: false, kanban: false, channels: false };
  let widths = { left: 40, right: 40 };
  const clamp = (value) => Math.max(25, Math.min(60, Number(value) || 40));
  const setWidths = (left = 40, right = 40) => {
    const boundedLeft = clamp(left);
    const boundedRight = clamp(right);
    // Keep a usable Kanban between them; the last changed edge yields when necessary.
    const excess = Math.max(0, boundedLeft + boundedRight - 80);
    const resolvedRight = boundedRight - excess;
    el.style.setProperty('--wk-left', `${boundedLeft}%`);
    el.style.setProperty('--wk-right', `${resolvedRight}%`);
    widths = { left: boundedLeft, right: resolvedRight };
    return { ...widths };
  };
  const snapshot = () => ({ widths: { ...widths }, surfaces: { ...collapsed } });
  const notify = () => options.onStateChange?.(snapshot());
  const expandActions = new Map();
  const setCollapsed = (surface, on, emit = false) => {
    const target = el.querySelector(`[data-surface="${surface}"]`);
    if (!target) return;
    target.hidden = !!on;
    collapsed[surface] = !!on;
    const expand = expandActions.get(surface);
    if (expand) expand.hidden = !on;
    rails.hidden = !Object.values(collapsed).some(Boolean);
    el.dataset.open = ['terminalTile', 'kanban', 'channels']
      .filter((name) => !el.querySelector(`[data-surface="${name}"]`)?.hidden)
      .join('-');
    if (emit) notify();
  };
  const restore = (state = {}) => {
    const nextWidths = state.widths || {};
    setWidths(nextWidths.left, nextWidths.right);
    for (const name of Object.keys(surfaces)) setCollapsed(name, !!state.surfaces?.[name]);
    return snapshot();
  };
  el.dataset.open = 'terminalTile-kanban-channels';
  el.dataset.responsive = 'workbench';
  setWidths();

  if (managed) {
    for (const name of Object.keys(surfaces)) {
      const expand = WorkspacePrimitives.createAction({
        className: 'wk-workbench-expand',
        label: name === 'channels' ? '«' : '»',
        title: `Show ${labels[name]}`,
        action: () => setCollapsed(name, false, true),
      }).el;
      expand.dataset.surface = name;
      expand.hidden = true;
      expandActions.set(name, expand);
      rails.append(expand);

      const controls = surfaces[name]?.querySelector(':scope > .wk-surface-controls');
      if (controls) {
        const collapse = WorkspacePrimitives.createAction({
          className: 'wk-workbench-collapse',
          label: name === 'channels' ? '»' : name === 'kanban' ? '⌃' : '«',
          title: `Hide ${labels[name]}`,
          action: () => setCollapsed(name, true, true),
        }).el;
        collapse.dataset.surface = name;
        controls.hidden = false;
        controls.append(collapse);
      }
    }

    for (const side of ['left', 'right']) {
      const splitter = document.createElement('div');
      splitter.className = 'wk-workbench-splitter';
      splitter.dataset.side = side;
      splitter.setAttribute('role', 'separator');
      splitter.setAttribute('aria-orientation', 'vertical');
      splitter.setAttribute('aria-label', side === 'left' ? 'Resize the focused session' : 'Resize the Team channels');
      splitter.tabIndex = 0;
      const resize = (clientX, rect) => {
        const ratio = ((side === 'left' ? clientX - rect.left : rect.right - clientX) / rect.width) * 100;
        const next = side === 'left' ? { left: ratio, right: widths.right } : { left: widths.left, right: ratio };
        setWidths(next.left, next.right);
      };
      splitter.addEventListener('pointerdown', (event) => {
        if (window.matchMedia('(max-width: 680px)').matches) return;
        const rect = el.getBoundingClientRect();
        if (!rect.width) return;
        splitter.setPointerCapture(event.pointerId);
        splitter.dataset.dragging = 'true';
        const move = (next) => resize(next.clientX, rect);
        const done = () => {
          delete splitter.dataset.dragging;
          splitter.removeEventListener('pointermove', move);
          splitter.removeEventListener('pointerup', done);
          splitter.removeEventListener('pointercancel', done);
          notify();
        };
        splitter.addEventListener('pointermove', move);
        splitter.addEventListener('pointerup', done);
        splitter.addEventListener('pointercancel', done);
      });
      splitter.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        const direction = event.key === 'ArrowRight' ? 2 : -2;
        const next = side === 'left' ? { left: widths.left + direction, right: widths.right } : { left: widths.left, right: widths.right - direction };
        setWidths(next.left, next.right);
        notify();
        event.preventDefault();
      });
      el.append(splitter);
    }
    restore(options.state);
  }

  return { el, host, rails, setCollapsed, setWidths, restore, snapshot };
}

export const WorkspaceLayouts = Object.freeze({
  createLeagueBoard,
  createSessionGrid,
  createExplorerLayout,
  createAgentConfigurationLayout,
  createNewTeamLayout,
  createWorkbenchLayout,
});
