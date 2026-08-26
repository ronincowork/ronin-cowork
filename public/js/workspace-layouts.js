/* Named Workspace Kit compositions. These establish geometry only. */

import { declareArrangement, normalizeArrangement, visibleColumns, toggleSlot, moveSlot, resizeSlot, widthClass } from './workspace-arrangement.js';

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

/**
 * THE MANAGED WORKBENCH — N slots, arranged.
 *
 *   createWorkbenchLayout({ declaration, surfaces, state, onStateChange })
 *
 * The destination DECLARES its slots by name (workspace-arrangement.js) and hands one
 * element per name in `surfaces`; this frame draws them in the arrangement's order, at
 * its widths, hiding what it hides, with one splitter between each visible pair. It
 * knows no slot name — the team page's "terminal · roster · commons" is its business
 * alone, and commons-on-the-left is a reordered declaration, not a frame change.
 *
 * `arrangement` is the live controller the Kit's layout map binds to (the ViewHost draws
 * that map in the app bar for any view that exposes one). One state, two faces: a
 * splitter drag redraws the map, a map drag moves the real columns.
 *
 * Widths are `fr` units, not percentages, so the grid's own gap is absorbed instead of
 * overflowing the row. Splitters are positioned from the columns' measured edges after
 * every render and on every resize — never from arithmetic on percentages.
 */
function createWorkbenchLayout(options = {}) {
  if (options instanceof Node || arguments.length > 1) throw new Error('createWorkbenchLayout takes { declaration, surfaces, state, onStateChange }');
  const declaration = declareArrangement(options.declaration);
  const surfaces = options.surfaces && typeof options.surfaces === 'object' ? options.surfaces : {};
  const el = layout('workbench-layout', Object.fromEntries(declaration.slots.map((slot) => [slot.name, surfaces[slot.name] ?? null])));
  el.dataset.responsive = 'workbench';
  const host = document.createElement('div');
  host.className = 'wk-workbench-host';
  host.append(el);
  const wrappers = new Map(declaration.slots.map((slot) => [slot.name, el.querySelector(`:scope > [data-surface="${slot.name}"]`)]));
  const splitters = [];
  const listeners = new Set();
  let state = normalizeArrangement(options.state, declaration);
  let columns = [];

  // A SLOT HOLDS EXACTLY ONE THING (owner, 2026-08-25: "it's there or it's not there;
  // there is no hidden"). place() trades what a slot holds for what you hand it and
  // returns what came out. The frame keeps nothing else in the box.
  const place = (name, node) => {
    const wrapper = wrappers.get(name);
    if (!wrapper || !(node instanceof Node)) return null;
    const previous = wrapper.firstElementChild;
    if (previous === node) return node;
    wrapper.replaceChildren(node);
    measure();
    return previous;
  };
  const holding = (name) => wrappers.get(name)?.firstElementChild ?? null;

  const phone = () => window.matchMedia('(max-width: 680px)').matches;
  const placeSplitters = () => {
    const rect = el.getBoundingClientRect();
    for (const [i, splitter] of splitters.entries()) {
      const column = columns[i];
      const wrapper = column ? wrappers.get(column.name) : null;
      if (!wrapper || i >= columns.length - 1 || !rect.width) { splitter.hidden = true; continue; }
      const edge = wrapper.getBoundingClientRect().right - rect.left;
      splitter.hidden = false;
      splitter.style.left = `${edge}px`;
      splitter.setAttribute('aria-label', `Resize ${declaration.slots.find((s) => s.name === column.name)?.label || column.name}`);
      splitter.dataset.between = `${column.name}:${columns[i + 1].name}`;
    }
  };
  const markWidths = () => {
    for (const column of columns) {
      const wrapper = wrappers.get(column.name);
      if (!wrapper) continue;
      wrapper.dataset.width = widthClass(wrapper.getBoundingClientRect().width, column.compact);
    }
  };
  const measure = () => { placeSplitters(); markWidths(); };

  const render = () => {
    columns = visibleColumns(state, declaration);
    for (const name of state.order) {
      const wrapper = wrappers.get(name);
      if (!wrapper) continue;
      wrapper.hidden = state.hidden.includes(name);
      el.append(wrapper); // append in order: a move is a DOM move, and the phone stack reads DOM order
    }
    el.style.gridTemplateColumns = columns.map((c) => `minmax(0, ${c.width.toFixed(3)}fr)`).join(' ');
    el.dataset.slots = columns.map((c) => c.name).join(' ');
    // Splitters are absolutely positioned, so their DOM order is irrelevant — and they
    // must NOT be re-appended here: moving the node mid-drag drops its pointer capture.
    measure();
  };
  const snapshot = () => state;
  const commit = (next, emit) => {
    if (next === state) return;
    state = next;
    render();
    for (const fn of listeners) fn(state);
    if (emit) options.onStateChange?.(state);
  };
  const arrangement = Object.freeze({
    declaration,
    state: snapshot,
    toggle: (name) => commit(toggleSlot(state, name), true),
    move: (name, index) => commit(moveSlot(state, name, index), true),
    resize: (name, percent, neighbour) => commit(resizeSlot(state, name, percent, declaration, neighbour), true),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  });
  const restore = (next) => { commit(normalizeArrangement(next, declaration), false); return state; };

  // One splitter per gap the declaration can ever have; render hides the spares.
  for (let i = 0; i < declaration.slots.length - 1; i += 1) {
    const splitter = document.createElement('div');
    splitter.className = 'wk-workbench-splitter';
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-orientation', 'vertical');
    splitter.tabIndex = 0;
    // The pair this splitter sits between: the outer one is resized and the one toward
    // the middle yields — the same rule from either edge, so both workspaces feel alike.
    const pair = () => {
      const left = columns[i];
      const right = columns[i + 1];
      if (!left || !right) return null;
      const rightIsLast = i + 1 === columns.length - 1;
      return rightIsLast && i > 0 ? { name: right.name, neighbour: left.name, fromRight: true } : { name: left.name, neighbour: right.name, fromRight: false };
    };
    // A pull of N pixels is a change of N pixels to the outer column, from the width it
    // had when the pointer went down. Shares are of the COLUMNS' content (padding and
    // gaps excluded); measuring from the grid's box or a neighbour's edge instead left
    // one side six to ten pixels off per hundred — measured, 2026-08-25.
    let grip = null;
    const drag = (clientX) => {
      if (!grip) return;
      const content = columns.reduce((sum, c) => sum + wrappers.get(c.name).getBoundingClientRect().width, 0);
      if (!content) return;
      const delta = clientX - grip.x;
      const width = grip.width + (grip.target.fromRight ? -delta : delta);
      commit(resizeSlot(state, grip.target.name, (width / content) * 100, declaration, grip.target.neighbour), false);
    };
    splitter.addEventListener('pointerdown', (event) => {
      if (phone()) return;
      const target = pair();
      if (!target || !el.getBoundingClientRect().width) return;
      grip = { x: event.clientX, width: wrappers.get(target.name).getBoundingClientRect().width, target };
      splitter.setPointerCapture(event.pointerId);
      splitter.dataset.dragging = 'true';
      const move = (next) => drag(next.clientX);
      const done = () => {
        grip = null;
        delete splitter.dataset.dragging;
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', done);
        splitter.removeEventListener('pointercancel', done);
        for (const fn of listeners) fn(state);
        options.onStateChange?.(state);
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', done);
      splitter.addEventListener('pointercancel', done);
    });
    splitter.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const target = pair();
      if (!target) return;
      const current = columns.find((c) => c.name === target.name)?.width ?? 0;
      const step = (event.key === 'ArrowRight') === !target.fromRight ? 2 : -2;
      arrangement.resize(target.name, current + step, target.neighbour);
      event.preventDefault();
    });
    splitters.push(splitter);
    el.append(splitter);
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(el);
  render();
  return { el, host, arrangement, place, holding, restore, snapshot };
}

export const WorkspaceLayouts = Object.freeze({
  createLeagueBoard,
  createSessionGrid,
  createExplorerLayout,
  createAgentConfigurationLayout,
  createNewTeamLayout,
  createWorkbenchLayout,
});
