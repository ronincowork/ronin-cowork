/* part of the ronin-cowork client — see js/README.md */
/** The one sealed Workbench, its shared surface library and named discovery profiles. */
import { createWorkbenchLayout } from './workspace-layouts.js';
import { WorkspacePrimitives } from './workspace-primitives.js';
import { t } from './lexicon.js';

export const WORKBENCH_IDS = Object.freeze(['workspace1', 'workspace2', 'workspace3', 'workspace4']);
const LOWER = new Set(['workspace3', 'workspace4']);
const COLUMN_OF = Object.freeze({ workspace1: 'workspace1', workspace3: 'workspace1', workspace2: 'workspace2', workspace4: 'workspace2' });
const SURFACE_DRAG = 'application/x-ronin-workbench-surface';
const HEADER_KINDS = new Set(['surface', 'channels', 'terminal']);

const node = (tag, cls = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  return out;
};

const libraryEntries = new Map(), profiles = new Map();
export const WorkbenchLibrary = Object.freeze({
  register(definition) {
    const type = String(definition?.type || '');
    if (!type || typeof definition.create !== 'function' || !HEADER_KINDS.has(definition.header)) throw new Error(`invalid Workbench.library surface: ${type || '(blank)'} (factory and fixed header contract required)`);
    const previous = libraryEntries.get(type);
    if (previous && previous !== definition) throw new Error(`Workbench.library already has ${type}`);
    libraryEntries.set(type, Object.freeze({ ...definition, type }));
    return type;
  },
  get: (type) => libraryEntries.get(type) || null,
  has: (type) => libraryEntries.has(type),
  types: () => [...libraryEntries.keys()],
});
export const WorkbenchProfiles = Object.freeze({
  define(name, types) {
    name = String(name || '');
    const list = [...new Set(Array.isArray(types) ? types.map(String) : [])];
    if (!name || !list.length) throw new Error('Workbench.profile needs a name and surface types');
    const missing = list.filter((type) => !WorkbenchLibrary.has(type));
    if (missing.length) throw new Error(`Workbench.profile ${name} names unknown library types: ${missing.join(', ')}`);
    const previous = profiles.get(name);
    if (previous && previous.types.join('\0') !== list.join('\0')) throw new Error(`Workbench.profile ${name} is already defined`);
    if (previous) return previous;
    profiles.set(name, Object.freeze({ name, types: Object.freeze(list) }));
    return profiles.get(name);
  },
  get: (name) => profiles.get(String(name || '')) || null,
  names: () => [...profiles.keys()],
});

/** One format. Profiles choose library entries; tenants only parameterize/filter them. */
export function createWorkbench(options = {}) {
  const profile = typeof options.profile === 'string' ? WorkbenchProfiles.get(options.profile) : options.profile;
  if (!profile || !Array.isArray(profile.types)) throw new Error(`unknown Workbench.profile: ${options.profile || '(blank)'}`);
  if (typeof options.defaultNode !== 'function') throw new Error('a workbench needs a defaultNode(workspace) factory');
  const tenant = options.tenant && typeof options.tenant === 'object' ? options.tenant : Object.freeze({ kind: 'none' });

  const defaults = {}, cells = {}, columns = { workspace1: node('div', 'wk-workbench-column'), workspace2: node('div', 'wk-workbench-column') };
  const instances = new Map(), instanceNodes = new WeakMap();
  let selected = 'workspace1', count = 2, restoring = false, selectorTitle = null;
  const visibleIds = () => WORKBENCH_IDS.filter((id) => count === 4 || !LOWER.has(id));
  const holding = (id) => cells[id]?.firstElementChild ?? null;
  const remember = () => {
    if (restoring) return;
    options.onStateChange?.({ count, selected, arrangement: layout.arrangement.state() });
  };
  const select = (id) => {
    if (!cells[id] || (count === 2 && LOWER.has(id))) id = 'workspace1';
    selected = id;
    for (const [name, cell] of Object.entries(cells)) cell.classList.toggle('wk-workbench-selected', name === id);
    options.onSelect?.(id);
    remember();
    return id;
  };

  for (const id of WORKBENCH_IDS) {
    const made = options.defaultNode(id);
    if (!(made instanceof Node)) throw new Error(`defaultNode(${id}) did not return a node`);
    defaults[id] = made;
    const cell = node('div', 'wk-workbench-cell');
    cell.dataset.workspace = id;
    cell.append(made);
    cell.addEventListener('pointerdown', () => select(id), true);
    cell.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes(SURFACE_DRAG)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
    cell.addEventListener('drop', (event) => {
      const raw = event.dataTransfer?.getData(SURFACE_DRAG);
      if (!raw) return;
      event.preventDefault();
      try { const item = JSON.parse(raw); place(item.type, id, item.detail || {}); }
      catch (_) { place(raw, id); }
    });
    options.installDrop?.(cell, id);
    cells[id] = cell;
    columns[COLUMN_OF[id]].append(cell);
  }

  const selector = node('div', 'wk-workbench-selector');
  const selectorCards = node('div', 'wk-workbench-selector-cards');
  selector.append(selectorCards);
  const declaration = { slots: [
    { name: 'workspace1', label: t('team.workspace_1', 'Workspace 1'), width: 40, composite: true },
    { name: 'selector', label: options.label || profile.name, width: 20, min: 6, compact: 176 },
    { name: 'workspace2', label: t('team.workspace_2', 'Workspace 2'), width: 40, composite: true },
  ], priorDefaultOrders: [['workspace1', 'workspace2', 'selector']] };
  const layout = createWorkbenchLayout({
    declaration,
    surfaces: { workspace1: columns.workspace1, selector, workspace2: columns.workspace2 },
    headers: { selector: { actions: options.actions || [] } },
    onStateChange: remember,
  });
  layout.el.dataset.workbenchProfile = profile.name;

  const shape = options.shapeControl;
  const paintShape = () => {
    if (!shape) return;
    shape.textContent = String(count);
    shape.title = count === 4 ? t('bar.shape_four', 'Four workspaces — click for two') : t('bar.shape_two', 'Two workspaces — click for four');
    shape.setAttribute('aria-label', shape.title);
  };
  const setCount = (value, quiet = false) => {
    // on a tablet is a layout nobody drives by finger, and the 2⇄4 button left the
    // touch bar with this pin (layout.js trimBarForTouch). Spelled locally — the Kit
    // keeps its own dependencies — and here rather than at the callers so a restored
    // state.count of 4 from a desktop session cannot strand a tablet at a shape it
    // has no control to leave.
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    count = value === 4 && !coarse ? 4 : 2;
    for (const column of Object.values(columns)) column.dataset.count = String(count);
    for (const id of LOWER) cells[id].hidden = count !== 4;
    if (count === 2 && LOWER.has(selected)) select('workspace1');
    paintShape();
    if (!quiet) remember();
    return count;
  };
  const onShape = () => setCount(count === 4 ? 2 : 4);
  const enter = (state = {}) => {
    restoring = true;
    layout.restore(state.arrangement);
    setCount(state.count, true);
    select(state.selected || selected);
    restoring = false;
    if (shape) { shape.hidden = false; shape.removeEventListener('click', onShape); shape.addEventListener('click', onShape); }
    remember();
  };
  const leave = () => {
    if (shape) { shape.hidden = true; shape.removeEventListener('click', onShape); }
  };
  const placeNode = (id, value) => {
    if (!cells[id] || !(value instanceof Node)) return false;
    if (holding(id) !== value) cells[id].replaceChildren(value);
    select(id);
    return true;
  };
  const restoreDefault = (id) => placeNode(id, defaults[id]);

  const allowed = () => profile.types.flatMap((type) => {
    const definition = WorkbenchLibrary.get(type);
    if (!definition || definition.visible?.(tenant, options.environment) === false) return [];
    const discovered = definition.discover?.(tenant, options.environment);
    return Array.isArray(discovered) ? discovered.map((offer) => ({ definition, offer })) : [{ definition, offer: {} }];
  });
  const instance = (type, id, detail = {}) => {
    const definition = WorkbenchLibrary.get(type);
    if (!definition || !profile.types.includes(type) || !cells[id]) return null;
    const resource = String(detail.key || '');
    const key = `${id}\0${type}\0${resource}`;
    if (instances.has(key)) return instances.get(key);
    const made = definition.create({ workspace: id, tenant, environment: options.environment, workbench: api, detail });
    const value = made instanceof Node ? { el: made } : made;
    if (!(value?.el instanceof Node)) throw new Error(`${type} did not create a workspace surface for ${id}`);
    const owner = instanceNodes.get(value.el);
    if (owner && owner !== id) throw new Error(`${type} reused a surface node from ${owner}`);
    value.el.dataset.workbenchSurface = type;
    if (resource) value.el.dataset.workbenchResource = resource;
    instanceNodes.set(value.el, id);
    const required = definition.header === 'surface' ? '.wk-surface-header' : definition.header === 'channels' ? '.wk-channel-service-tabs' : null;
    if (required && !value.el.querySelector(`:scope > ${required}`)) throw new Error(`${type} did not use its ${definition.header} Workbench header`);
    instances.set(key, value);
    return value;
  };
  const typeAt = (id) => holding(id)?.dataset?.workbenchSurface || '';
  const resourceAt = (id) => holding(id)?.dataset?.workbenchResource || '';
  const locations = (type, resource = '') => WORKBENCH_IDS.filter((id) => typeAt(id) === type && (!resource || resourceAt(id) === resource));
  const place = (type, id = selected, detail = {}) => {
    const value = instance(type, id, detail);
    if (!value || !placeNode(id, value.el)) return false;
    value.el.dataset.workbenchSurface = type;
    if (detail.key) value.el.dataset.workbenchResource = detail.key;
    else delete value.el.dataset.workbenchResource;
    WorkbenchLibrary.get(type)?.show?.(value, detail, { workspace: id, tenant, environment: options.environment, workbench: api });
    value.show?.(detail);
    if (WorkbenchLibrary.get(type)?.header === 'terminal' && !value.el.querySelector('.tile-head')) throw new Error(`${type} did not render its terminal Workbench header`);
    refreshSelector();
    options.onPlacement?.(snapshot());
    return true;
  };
  const snapshot = () => ({ count, selected, arrangement: layout.arrangement.state(), seats: Object.fromEntries(WORKBENCH_IDS.map((id) => [id, resourceAt(id) ? { type: typeAt(id), key: resourceAt(id) } : typeAt(id)])) });
  const refreshSelector = () => {
    if (selectorTitle) selectorTitle.textContent = options.title?.(tenant) || options.label || profile.name;
    selectorCards.replaceChildren();
    for (const { definition, offer } of allowed()) {
      const label = offer.label ?? (typeof definition.label === 'function' ? definition.label(tenant, options.environment) : definition.label || definition.type);
      const summary = offer.summary ?? (typeof definition.summary === 'function' ? definition.summary(tenant, options.environment) : definition.summary || '');
      const detail = { ...offer, key: offer.key || '' };
      // A selector card is a door, not a status lamp. The workspace itself already shows
      // what is placed there; painting every matching door as pressed made one of two
      // visible Agents look selected and the other not as seats changed underneath it.
      const card = WorkspacePrimitives.createCard({ heading: label, summary, metadata: offer.metadata, mark: offer.mark, variant: offer.variant || definition.variant || null, action: () => place(definition.type, selected, detail) });
      // A readable title is display text, not identity. Consumers such as the render gate
      // address an offered resource by its fixed key even after its title is edited.
      if (detail.key) card.el.dataset.workbenchOfferResource = detail.key;
      for (const cls of [definition.className, offer.className]) {
        if (cls) card.el.classList.add(...String(cls).split(/\s+/).filter(Boolean));
      }
      if (offer.onPointerEnter) card.el.addEventListener('pointerenter', offer.onPointerEnter);
      if (offer.onPointerLeave) card.el.addEventListener('pointerleave', offer.onPointerLeave);
      card.el.draggable = true;
      card.el.addEventListener('dragstart', (event) => { event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: definition.type, detail })); event.dataTransfer.setData('text/plain', label); event.dataTransfer.effectAllowed = 'copy'; });
      selectorCards.append(card.el);
    }
  };

  paintShape();
  const api = {
    profile: profile.name, tenant, host: layout.host, el: layout.el, arrangement: layout.arrangement,
    selectorHeader: layout.headers.get('selector'), declaration, cells: Object.freeze(cells),
    ids: WORKBENCH_IDS, visibleIds, holding, selected: () => selected, count: () => count,
    select, setCount, placeNode, restoreDefault, isDefault: (id) => holding(id) === defaults[id],
    instance, place, typeAt, resourceAt, locations, snapshot, refreshSelector, enter, leave,
  };
  selectorTitle = api.selectorHeader?.title || null;
  if (!options.deferSelector) refreshSelector();
  return Object.freeze(api);
}
