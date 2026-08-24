/* Workspace Kit primitives. Feature meaning belongs to consumers, never these nodes. */

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

function createSurface(options = {}) {
  const el = node('section', `wk-surface${options.className ? ` ${options.className}` : ''}`);
  if (options.label) el.setAttribute('aria-label', options.label);
  if (options.collapsible) el.dataset.collapsible = '';
  const controls = node('div', 'wk-surface-controls');
  controls.hidden = true;
  const content = node('div', 'wk-surface-content');
  const state = node('p', 'wk-state');
  state.hidden = true;
  el.append(controls, content, state);
  if (options.content instanceof Node) content.append(options.content);
  const collapse = (on = true) => {
    el.dataset.collapsed = on ? 'true' : 'false';
    el.hidden = !!on;
  };
  setSurfaceState(el, options.state, options.message);
  return { el, content, controls, collapse, setState: (kind, message) => setSurfaceState(el, kind, message) };
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
  if (options.mark != null) el.prepend(node('span', 'wk-card-mark', options.mark));
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
  const el = node('button', `wk-action${options.className ? ` ${options.className}` : ''}`, options.label ?? '');
  el.type = 'button';
  if (options.title) el.title = options.title;
  if (options.kind) el.dataset.kind = options.kind;
  el.disabled = !!options.disabled;
  if (options.action) el.addEventListener('click', options.action);
  return { el, setDisabled: (on = true) => { el.disabled = !!on; } };
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

const CHANNEL_SERVICES = ['chat', 'wipeboard', 'docs', 'team-configuration'];

/** Geometry and replacement-tab behavior only. Chat intentionally starts as empty space. */
function createChannelSurface(options = {}) {
  const surface = createSurface({ label: options.label || 'Team channels' });
  surface.el.classList.add('wk-channel-surface');
  const tabs = node('div', 'wk-channel-service-tabs');
  tabs.setAttribute('role', 'tablist');
  const services = new Map();
  const buttons = new Map();
  for (const id of CHANNEL_SERVICES) {
    const button = node('button', 'wk-channel-service-tab', id === 'team-configuration' ? 'Team Configuration' : id[0].toUpperCase() + id.slice(1));
    button.type = 'button';
    button.setAttribute('role', 'tab');
    const service = node('div', 'wk-channel-service');
    service.setAttribute('role', 'tabpanel');
    service.dataset.service = id;
    const mounted = options.services?.[id];
    if (mounted?.el instanceof Node) service.append(mounted.el);
    else if (mounted instanceof Node) service.append(mounted);
    // No transcript, composer, protocol or prompt is implied by the Chat tab.
    if (id === 'chat' && !service.childNodes.length) service.dataset.reserved = '';
    button.addEventListener('click', () => select(id));
    buttons.set(id, button);
    services.set(id, service);
    tabs.append(button);
    surface.content.append(service);
  }
  surface.el.prepend(tabs);
  const select = (requested) => {
    const id = CHANNEL_SERVICES.includes(requested) ? requested : 'chat';
    for (const [name, button] of buttons) {
      const on = name === id;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      services.get(name).hidden = !on;
    }
    return id;
  };
  select(options.selected);
  const invoke = (hook, context) => {
    for (const id of CHANNEL_SERVICES) {
      const mounted = options.services?.[id];
      if (mounted && !(mounted instanceof Node)) mounted[hook]?.(services.get(id), context);
    }
  };
  return {
    ...surface, tabs, services, select,
    mount: (context) => invoke('mount', context),
    enter: (context) => invoke('enter', context),
    leave: () => invoke('leave'),
    destroy: () => invoke('destroy'),
  };
}

function createExplorerRail(options = {}) {
  const el = node('nav', 'wk-explorer-rail');
  el.setAttribute('aria-label', options.label || 'Explorer');
  const head = node('div', 'wk-explorer-head');
  const collapseButton = node('button', 'wk-explorer-collapse', '«');
  collapseButton.type = 'button';
  collapseButton.setAttribute('aria-label', 'Collapse explorer');
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
    collapseButton.setAttribute('aria-label', collapsed ? 'Expand explorer' : 'Collapse explorer');
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

export const WorkspacePrimitives = Object.freeze({
  states: WORKSPACE_STATES,
  setSurfaceState,
  createSurface,
  createCard,
  createAction,
  createActionBar,
  createMetadata,
  createReservedSurface,
  channelServices: CHANNEL_SERVICES,
  createChannelSurface,
  createExplorerRail,
  createNotice,
  createField,
  createForm,
});
