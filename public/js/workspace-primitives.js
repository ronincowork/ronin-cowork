/* Workspace Kit primitives. Feature meaning belongs to consumers, never these nodes. */
import { t } from './lexicon.js';

const node = (tag, cls, text) => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text !== undefined && text !== null) out.textContent = String(text);
  return out;
};

const WORKSPACE_STATES = ['loading', 'empty', 'stale', 'failed', 'unavailable', 'inert'];
let fieldSequence = 0;

function setSurfaceState(root, state = null, message = '') {
  const valid = WORKSPACE_STATES.includes(state) ? state : '';
  if (valid) root.dataset.state = valid;
  else delete root.dataset.state;
  const notice = root.querySelector(':scope > .wk-state');
  if (notice) {
    notice.hidden = !valid && !message;
    notice.textContent = message || valid;
  }
}

// THE HOUSE MARK, INLINE. public/brand/nin-mark.svg is the master (and the favicon); these
// are its paths, copied once, so the glyph is part of whatever holds it: no fetch and no
// decode, so it never paints a frame after its button. Decorative wherever it appears. It
// draws in --kaki, so a skin that moves the brand moves the mark.
const NIN_MARK = '<path fill="none" style="stroke: var(--kaki)" stroke-width="8" stroke-linejoin="miter" d="M31 6h58l25 46-25 46H31L6 52z"/>'
  + '<path style="fill: var(--kaki)" d="M52.3 21.8c3.9-4.3 10.4-4.1 14.5-.5l3.8 3.4c2 1.8 2.1 4.4.5 6.7-5.4 7.8-8.7 15.8-12.1 23.7-6.1 14.4-15.7 24.7-29.4 32.7-3.7 2.2-7.4 1.4-8.8-1.6-1.2-2.6.4-5 3.7-7.4 11.2-8.1 19.1-17.7 24-29.2 3.8-9 6.8-17.1 5.1-22.4l-1.8-3c-.5-.8-.3-1.7.5-2.4z"/>'
  + '<path style="fill: var(--kaki)" d="M54.2 50c2.8-2.5 6.3-2.1 9.3 1.2 9.9 11.1 19.8 20 32.2 27.2 3.7 2.1 4.6 5 2.2 7.4-1.8 1.8-5 2.5-9.2 1.8-13.2-2.4-24.7-12.4-36.3-25.8-3.7-4.2-2.9-8.6 1.8-11.8z"/>';

/** The nin mark as an inline svg, sized by `className`. */
export function ninMark(className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 104');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  svg.innerHTML = NIN_MARK;
  return svg;
}

export function createSurface(options = {}) {
  const el = node('section', `wk-surface${options.className ? ` ${options.className}` : ''}`);
  if (options.label) el.setAttribute('aria-label', options.label);
  if (options.collapsible) el.dataset.collapsible = '';
  if (options.flush) el.dataset.flush = 'true';
  const controls = node('div', 'wk-surface-controls');
  controls.hidden = true;
  const header = options.header === false ? null : createSurfaceHeader({ label: options.label, actions: options.actions });
  const content = node('div', 'wk-surface-content');
  const state = node('p', 'wk-state');
  state.hidden = true;
  el.append(controls);
  if (header) el.append(header.el);
  el.append(content, state);
  if (options.content instanceof Node) content.append(options.content);
  const collapse = (on = true) => {
    el.dataset.collapsed = on ? 'true' : 'false';
    el.hidden = !!on;
  };
  setSurfaceState(el, options.state, options.message);
  return { el, header, content, controls, collapse, setState: (kind, message) => setSurfaceState(el, kind, message) };
}

/** The one thing behind every Workbench surface: a quiet place, not another workflow. */
function createBlankSurface(label = t('team.workspace_blank', 'Tilespace')) {
  const surface = createSurface({ label, className: 'wk-blank-surface' });
  const mark = node('div', 'tile-empty-mark');
  mark.setAttribute('aria-hidden', 'true');
  mark.append(ninMark());
  surface.content.append(mark);
  return surface;
}

export function createSurfaceHeader(options = {}) {
  const el = node('header', 'wk-surface-header');
  const title = node('span', 'wk-surface-header-title', options.label ?? '');
  const actions = node('div', 'wk-surface-header-actions');
  for (const action of options.actions || []) actions.append(action?.el ?? action);
  el.append(title, actions);
  return { el, title, actions };
}


function createCard(options = {}) {
  const tag = options.action ? 'button' : 'article';
  const el = node(tag, `wk-card${options.className ? ` ${options.className}` : ''}`);
  if (tag === 'button') el.type = 'button';
  if (options.variant === 'dotted') el.dataset.variant = 'dotted';
  if (options.selected != null) el.setAttribute('aria-pressed', String(!!options.selected));
  for (const state of ['active', 'warning', 'stale']) {
    if (options[state]) el.dataset[state] = 'true';
  }
  const heading = node('h3', 'wk-card-heading', options.heading ?? '');
  const summary = node('p', 'wk-card-summary', options.summary ?? '');
  const metadata = node('div', 'wk-card-meta');
  el.append(heading, summary, metadata);
  // hito and the team name should be same line"), not a line of its own above it.
  if (options.mark != null) heading.prepend(node('span', 'wk-card-mark', options.mark));
  for (const value of options.metadata || []) metadata.append(node('span', null, value));
  if (options.action) el.addEventListener('click', options.action);
  const setState = (state, on = true) => {
    if (!['active', 'warning', 'stale'].includes(state)) return;
    if (on) el.dataset[state] = 'true';
    else delete el.dataset[state];
  };
  return { el, heading, summary, metadata, setState };
}

function createAction(options = {}) {
  const el = node('button', `wk-action${options.className ? ` ${options.className}` : ''}`);
  el.type = 'button';
  const isLaunch = options.launch || options.label === t('forms.launch', 'Launch');
  if (isLaunch) {
    el.dataset.launch = 'true';
    el.append(ninMark('wk-launch-mark'), node('span', null, options.label ?? ''));
  } else {
    el.textContent = options.label ?? '';
  }
  if (options.title) el.title = options.title;
  if (options.kind) el.dataset.kind = options.kind;
  if (options.size) el.dataset.size = options.size;
  // A Send, Save or Cancel: its press ends an edit, and the kit's held row lands (editHold).
  if (options.endsEdit) el.dataset.endsEdit = '';
  if (options.selected != null) el.setAttribute('aria-pressed', String(!!options.selected));
  el.disabled = !!options.disabled;
  // EVERY BUTTON ANSWERS THE PRESS AT ONCE (owner, 2026-11-12: "If I push it, it looks
  // clicked, so I know it's clicked, even if it takes a second"). A pointer shows it on the
  // way down; a key, which has no way down, on its click.
  el.addEventListener('pointerdown', () => { if (!el.disabled) flashPressed(el); });
  if (options.action) {
    let busy = false;
    el.addEventListener('click', (event) => {
      // Still at work on the last press: this one is the same press again.
      if (busy) return;
      if (event?.detail === 0) flashPressed(el);
      const result = options.action(event);
      if (typeof result?.then !== 'function') return result;
      busy = true;
      el.setAttribute('aria-busy', 'true');
      const settle = () => { busy = false; el.removeAttribute('aria-busy'); };
      return Promise.resolve(result).then(settle, (error) => { settle(); throw error; });
    });
  }
  return { el, setDisabled: (on = true) => { el.disabled = !!on; } };
}

const PRESS_FLASH_MS = 250;
function flashPressed(el) {
  el.classList.add('pressed');
  clearTimeout(el.pressedTimer);
  el.pressedTimer = setTimeout(() => el.classList.remove('pressed'), PRESS_FLASH_MS);
}

function createActionBar(options = {}) {
  const el = node('div', `wk-action-bar${options.className ? ` ${options.className}` : ''}`);
  if (options.label) el.setAttribute('aria-label', options.label);
  const append = (...actions) => el.append(...actions.map((action) => action?.el ?? action).filter((action) => action instanceof Node));
  append(...(options.actions || []));
  return { el, append };
}

function createMetadata(options = {}) {
  const el = node('dl', `wk-metadata${options.className ? ` ${options.className}` : ''}`);
  const set = (rows = []) => {
    el.replaceChildren();
    for (const [label, value] of rows) {
      if (value === null || value === undefined || value === '') continue;
      el.append(node('dt', 'wk-metadata-key', label), node('dd', 'wk-metadata-value', value));
    }
  };
  set(options.rows);
  return { el, set };
}

/** A reserved surface is valid while empty; it promises geometry, not a workflow. */
function createReservedSurface(label = 'Reserved') {
  const surface = createSurface({ label });
  surface.el.dataset.reserved = '';
  return surface;
}

function createExplorerRail(options = {}) {
  const el = node('nav', 'wk-explorer-rail');
  el.setAttribute('aria-label', options.label || t('workspace.explorer', 'Explorer'));
  const head = node('div', 'wk-explorer-head');
  const collapseButton = node('button', 'wk-explorer-collapse', '«');
  collapseButton.type = 'button';
  collapseButton.setAttribute('aria-label', t('workspace.explorer_collapse', 'Collapse explorer'));
  head.append(collapseButton);
  const list = node('div', 'wk-explorer-list');
  list.setAttribute('role', 'listbox');
  const state = node('p', 'wk-state');
  state.hidden = true;
  el.append(head, list, state);
  let selected = '';
  let items = [];
  let collapsed = false;
  const setCollapsed = (on = true) => {
    collapsed = !!on;
    el.dataset.collapsed = String(collapsed);
    collapseButton.textContent = collapsed ? '»' : '«';
    collapseButton.setAttribute('aria-label', collapsed ? t('workspace.explorer_expand', 'Expand explorer') : t('workspace.explorer_collapse', 'Collapse explorer'));
  };
  const setDrawer = (open = true) => {
    el.dataset.drawer = open ? 'open' : 'closed';
    el.setAttribute('aria-hidden', String(!open));
  };
  collapseButton.addEventListener('click', () => setCollapsed(!collapsed));
  const select = (id, focus = false) => {
    selected = String(id ?? '');
    for (const button of list.querySelectorAll('[data-explorer-id]')) {
      const on = button.dataset.explorerId === selected;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      if (on && focus) button.focus();
    }
    options.onSelect?.(selected);
  };
  const setSections = (next = []) => {
    const sections = Array.isArray(next) ? next : [];
    items = sections.flatMap((section) => Array.isArray(section?.items) ? section.items : []);
    list.replaceChildren();
    for (const section of sections) {
      const group = node('section', 'wk-explorer-section');
      const heading = node('h3', 'wk-explorer-section-heading');
      heading.append(node('span', null, section?.label ?? ''));
      if (section?.count != null) heading.append(node('span', 'wk-explorer-count', section.count));
      group.append(heading);
      for (const item of section?.items || []) {
        const button = node('button', 'wk-explorer-item');
        button.type = 'button';
        button.dataset.explorerId = String(item?.id ?? '');
        button.setAttribute('role', 'option');
        button.append(node('span', 'wk-explorer-label', item?.label ?? ''));
        if (item?.count != null) button.append(node('span', 'wk-explorer-count', item.count));
        if (item?.provenance != null) button.append(node('small', 'wk-explorer-provenance', item.provenance));
        button.addEventListener('click', () => select(button.dataset.explorerId));
        group.append(button);
      }
      list.append(group);
    }
    const wanted = items.some((item) => String(item?.id ?? '') === selected) ? selected : String(items[0]?.id ?? '');
    select(wanted);
  };
  const setItems = (next = []) => setSections([{ label: '', items: Array.isArray(next) ? next : [] }]);
  list.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return;
    const at = items.findIndex((item) => String(item?.id ?? '') === selected);
    const last = items.length - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowDown' ? Math.min(last, at + 1) : Math.max(0, at - 1);
    select(items[next]?.id, true);
    event.preventDefault();
  });
  if (options.sections) setSections(options.sections);
  else setItems(options.items);
  setSurfaceState(el, options.state, options.message);
  return {
    el, list, setItems, setSections, select, setCollapsed, setDrawer,
    setState: (kind, message) => setSurfaceState(el, kind, message),
    get selected() { return selected; },
    get collapsed() { return collapsed; },
  };
}

function createNotice(options = {}) {
  const el = node('p', 'wk-notice', options.message ?? '');
  const set = (kind = '', message = '') => {
    el.dataset.kind = ['info', 'warning', 'failed', 'success'].includes(kind) ? kind : '';
    el.textContent = message;
    el.hidden = !message;
  };
  set(options.kind, options.message);
  return { el, set };
}

function createField(options = {}) {
  const el = node('div', 'wk-field');
  const proposedId = options.id || `wk-field-${++fieldSequence}`;
  const control = options.control instanceof HTMLElement ? options.control : node('input', 'wk-field-control');
  control.classList.add('wk-field-control');
  control.id ||= proposedId;
  const id = control.id;
  const label = node('label', 'wk-field-label', options.label ?? '');
  label.htmlFor = id;
  const description = node('p', 'wk-field-description', options.description ?? '');
  const validation = node('p', 'wk-field-validation');
  validation.hidden = true;
  control.setAttribute('aria-describedby', `${id}-description ${id}-validation`);
  description.id = `${id}-description`;
  validation.id = `${id}-validation`;
  el.append(label, control, description, validation);
  const setValidation = (kind = '', message = '') => {
    const valid = ['valid', 'warning', 'invalid', 'pending'].includes(kind) ? kind : '';
    if (valid) el.dataset.validation = valid;
    else delete el.dataset.validation;
    validation.textContent = message;
    validation.hidden = !message;
    control.setAttribute('aria-invalid', String(valid === 'invalid'));
  };
  setValidation(options.validation, options.validationMessage);
  return { el, label, control, description, validation, setValidation };
}

function createForm(options = {}) {
  const el = node('form', 'wk-form');
  const fields = node('div', 'wk-form-fields');
  const notice = createNotice();
  const actions = node('div', 'wk-form-actions');
  el.noValidate = options.noValidate !== false;
  el.append(fields, notice.el, actions);
  if (options.onSubmit) el.addEventListener('submit', options.onSubmit);
  return { el, fields, notice, actions };
}

/**
 * THE LAYOUT MAP — a workbench's arrangement drawn small: one switch per slot, in order,
 * its width the slot's share. Click toggles the slot; drag one past another to reorder;
 * arrows move focus, Space toggles, Shift+arrows move the slot. It renders from the
 * arrangement it is given ({ declaration, state(), toggle, move, subscribe }) and never
 * holds state of its own, so a splitter drag redraws it and a map drag moves the real
 * columns. The ViewHost mounts it in the app bar for any view exposing an arrangement.
 */
/**
 * THE TAB NAME — one text field in the app bar, drawn by the ViewHost for a view that
 * exposes `tabName` ({ get(), placeholder(), set(value) }). What is typed becomes the
 * browser tab's title (the ViewHost retitles on every change); empty means the view's
 * own default, shown as the placeholder. Enter or leaving the field commits, Escape
 * puts the last committed value back. Nothing here knows what the view is.
 */
function createTabName(tabName) {
  const el = node('input', 'wk-tab-name');
  el.type = 'text';
  el.maxLength = 48;
  el.spellcheck = false;
  el.setAttribute('aria-label', t('workspace.tab_name', 'Name this tab'));
  el.title = t('workspace.tab_name_title', 'Name this browser tab — what it is for. Empty is the default name.');
  const render = () => {
    el.placeholder = tabName.placeholder?.() || '';
    el.value = tabName.get?.() || '';
  };
  const commit = () => {
    const next = el.value.trim();
    if (next === (tabName.get?.() || '')) return;
    tabName.set?.(next);
    render();
  };
  el.addEventListener('change', commit);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { commit(); el.blur(); }
    else if (event.key === 'Escape') { render(); el.blur(); }
  });
  render();
  return { el, render, destroy: () => el.remove() };
}

function createLayoutMap(arrangement) {
  const el = node('div', 'wk-layout-map');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', t('workspace.columns', 'Workspace columns'));
  // popped the help box over the page ("Roster — click to show, drag to move"), which
  // on a screen with no hover is noise standing where the result should be. Spelled
  // locally rather than imported — the Kit keeps its own dependencies.
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const labelOf = (name) => arrangement.declaration.slots.find((slot) => slot.name === name)?.label || name;
  const render = () => {
    const state = arrangement.state();
    el.replaceChildren();
    for (const name of state.order) {
      const hidden = state.hidden.includes(name);
      const button = node('button', 'wk-layout-map-slot');
      button.type = 'button';
      button.dataset.slot = name;
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-checked', hidden ? 'false' : 'true');
      button.setAttribute('aria-label', labelOf(name));
      if (!coarse) button.title = hidden ? t('workspace.slot_show', '{column} — click to show, drag to move', { column: labelOf(name) }) : t('workspace.slot_hide', '{column} — click to hide, drag to move', { column: labelOf(name) });
      button.style.flexGrow = String(Math.max(6, state.widths[name] || 0));
      el.append(button);
    }
  };
  // A press is a click until the pointer has travelled past the midpoint of a neighbour;
  // from then on it is a drag, and the release is not a toggle. The drag listens on the
  // document, not the button: every move re-renders the map, and a captured button that
  // has just been replaced hears nothing more.
  el.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('.wk-layout-map-slot');
    if (!button || event.button !== 0) return;
    const name = button.dataset.slot;
    let dragged = false;
    const current = () => el.querySelector(`[data-slot="${name}"]`);
    const move = (next) => {
      const mine = current();
      const over = document.elementsFromPoint(next.clientX, next.clientY).find((n) => n !== mine && n.classList?.contains('wk-layout-map-slot') && el.contains(n));
      if (!over) return;
      const rect = over.getBoundingClientRect();
      const order = arrangement.state().order;
      const from = order.indexOf(name);
      const to = order.indexOf(over.dataset.slot);
      const past = to > from ? next.clientX > rect.left + rect.width / 2 : next.clientX < rect.right - rect.width / 2;
      if (!past) return;
      dragged = true;
      arrangement.move(name, to);
      const moved = current();
      if (moved) moved.dataset.dragging = 'true';
    };
    const done = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', done);
      document.removeEventListener('pointercancel', done);
      const mine = current();
      if (mine) delete mine.dataset.dragging;
      if (!dragged) arrangement.toggle(name);
      if (!coarse) current()?.focus();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', done);
    document.addEventListener('pointercancel', done);
    event.preventDefault();
  });
  el.addEventListener('keydown', (event) => {
    const button = event.target.closest('.wk-layout-map-slot');
    if (!button) return;
    const name = button.dataset.slot;
    const order = arrangement.state().order;
    const at = order.indexOf(name);
    if (event.key === ' ' || event.key === 'Enter') { arrangement.toggle(name); event.preventDefault(); return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    if (event.shiftKey) arrangement.move(name, at + step);
    const target = order[Math.max(0, Math.min(order.length - 1, at + step))];
    el.querySelector(`[data-slot="${event.shiftKey ? name : target}"]`)?.focus();
    event.preventDefault();
  });
  const unsubscribe = arrangement.subscribe(render);
  render();
  return { el, destroy: () => { unsubscribe(); el.remove(); } };
}

/**
 * ONE WAY TO REDRAW A LIST (owner, 2026-11-12, KAN-412; lifted from the People list's update(),
 * w451, and the item island's update()). A keyed list keeps one row per key between pushes:
 * - each row compares what it shows with what it would show now and repaints only itself;
 * - a row is added or removed only when the set of keys changes (`sweep`);
 * - a row's nodes move only when its order or its parent (its group) changes, and laying them
 *   out touches only what moved, so an opened row, a field being typed in, keeps its place;
 * - a row keeps its nodes when it moves from one parent to another.
 * `create(row)` → { nodes(): Node[], update(row), destroy?() } — the row drawn; `update` hears every
 * later `place` and decides for itself. Or, for a row that is one node: `shows(row)` (a string of
 * what it shows) and `draw(row)` (its node), redrawn only when `shows` moves.
 * `place(parent, rows)` lays rows into parent in order; `sweep()` lets go every row not placed
 * since the last sweep; `set(parent, rows)` is both, for a list in one parent.
 * NEVER UNDER AN EDIT (owner's rule, w451, KAN-414): a row whose nodes the person has typed or
 * changed something in (a trusted `input` or `change`) is held: a push only keeps its newest
 * row. It still moves with its order and group, and goes when its key does. The hold lets go,
 * and the newest row lands at once, when the edit is sent or abandoned:
 * - `submit` or `reset` in it;
 * - a press on a button marked `data-ends-edit` in it: every Send, Save or Cancel that is not a
 *   form submit carries that mark (the one way a button says the edit is over);
 * - a `<details>` in it folds;
 * - focus leaves it with every control the person touched back to what it was.
 * `editHold()` is the same hold for a surface's one open detail (phalanx.js).
 */
const valueOf = (control) => (control.type === 'checkbox' || control.type === 'radio' ? String(control.checked)
  : control.isContentEditable ? control.textContent : String(control.value ?? ''));
export function editHold() {
  let dirty = false;
  let cleared = null;
  const watched = new Set();
  const was = new Map(); // a control the person entered → its value before they touched it
  const inside = (node) => [...watched].some((one) => one === node || one.contains?.(node));
  const mark = (event) => { if (event?.isTrusted !== false) dirty = true; };
  // After the surface's own handler, so what it sends reads the edit first.
  const clear = () => setTimeout(() => { if (!dirty) return; dirty = false; was.clear(); cleared?.(); }, 0);
  const entered = (event) => { const one = event.target; if (one && 'value' in one && !was.has(one)) was.set(one, valueOf(one)); };
  const left = () => setTimeout(() => {
    if (!dirty || inside(document.activeElement)) return;
    if ([...was].every(([one, before]) => valueOf(one) === before)) clear();
  }, 0);
  const pressed = (event) => { if (event?.isTrusted !== false && event.target?.closest?.('[data-ends-edit]')) clear(); };
  const folded = (event) => { if (event.target?.tagName === 'DETAILS' && !event.target.open) clear(); };
  return {
    watch(nodes) {
      for (const one of nodes) {
        if (!one?.addEventListener || watched.has(one)) continue;
        watched.add(one);
        one.addEventListener('input', mark);
        one.addEventListener('change', mark);
        one.addEventListener('submit', clear);
        one.addEventListener('reset', clear);
        one.addEventListener('click', pressed);
        one.addEventListener('toggle', folded, true);
        one.addEventListener('focusin', entered);
        one.addEventListener('focusout', left);
      }
      for (const one of [...watched]) if (!nodes.includes(one) && !one.isConnected) watched.delete(one);
    },
    held: () => dirty,
    release: () => { dirty = false; was.clear(); },
    onClear: (callback) => { cleared = callback; },
  };
}

export function layNodes(parent, nodes) {
  const wanted = new Set(nodes);
  for (const child of [...parent.childNodes]) if (!wanted.has(child)) child.remove();
  nodes.forEach((one, index) => { if (parent.childNodes[index] !== one) parent.insertBefore(one, parent.childNodes[index] || null); });
}

export function createKeyedList({ key = (row) => row.id, create, shows, draw } = {}) {
  const drawn = (row) => {
    let el = null;
    let said = null;
    const update = (now) => {
      const next = shows(now);
      if (next === said) return;
      said = next;
      const fresh = draw(now);
      el?.replaceWith(fresh);
      el = fresh;
    };
    update(row);
    return { nodes: () => [el], update };
  };
  const make = (row) => {
    const one = (create || drawn)(row);
    const hold = editHold();
    let waiting = null;
    hold.onClear(() => { if (!waiting) return; const next = waiting; waiting = null; one.update(next); hold.watch(one.nodes()); });
    return { ...one, update: (next) => { if (hold.held()) waiting = next; else one.update(next); hold.watch(one.nodes()); }, watch: () => hold.watch(one.nodes()) };
  };
  const rows = new Map();
  const placed = new Set();
  const place = (parent, list = []) => {
    const nodes = [];
    for (const row of list) {
      const id = key(row);
      placed.add(id);
      const one = rows.get(id);
      if (one) one.update(row); else { rows.set(id, make(row)); rows.get(id).watch(); }
      nodes.push(...rows.get(id).nodes());
    }
    layNodes(parent, nodes);
  };
  const sweep = () => {
    for (const [id, one] of rows) if (!placed.has(id)) { for (const n of one.nodes()) n?.remove(); one.destroy?.(); rows.delete(id); }
    placed.clear();
  };
  return {
    place,
    sweep,
    set: (parent, list) => { place(parent, list); sweep(); },
    get: (id) => rows.get(id),
    destroy: () => { for (const one of rows.values()) one.destroy?.(); rows.clear(); placed.clear(); },
  };
}

export const WorkspacePrimitives = Object.freeze({
  states: WORKSPACE_STATES,
  createLayoutMap,
  createTabName,
  setSurfaceState,
  createSurface,
  createBlankSurface,
  createSurfaceHeader,
  createCard,
  createAction,
  createActionBar,
  createMetadata,
  createReservedSurface,
  createExplorerRail,
  createNotice,
  createField,
  createForm,
  ninMark,
  createKeyedList,
  layNodes,
  editHold,
});
