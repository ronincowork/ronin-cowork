/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createFolderPicker } from './folder-picker.js';

export const PRESETS_TYPE = 'setup.presets';
export const PRESET_STORAGE_KEY = 'ronin.setup.presets.v1';

export const HOUSE_PRESETS = Object.freeze([
  { handle: 'bare_metal', shelf: 'teams', label: 'Bare Metal', description: 'Start one to four agents, each in its own tile. Lock and load.', glyph: { rects: [[4, 9, 10, 14], [18, 9, 10, 14]] }, destination: 'Ronin Lab' },
  { handle: 'staff_my_codebase', shelf: 'teams', label: 'Code Stack Eval', description: 'Point a team at a codebase and get its read on the stack.', glyph: { path: 'M5 7h22 M5 13h22 M5 19h22 M5 25h14' }, destination: 'Ronin Project 1' },
  { handle: 'develop_new_project', shelf: 'teams', label: 'Develop a New Project', description: 'A lead plus feature agents, each in its own worktree.', glyph: { path: 'M8 28V4 M8 12h6c4 0 4-4 10-4h3 M8 20h6c4 0 4 4 10 4h3' }, destination: 'Ronin Project 1' },
  { handle: 'personal_assistant', shelf: 'agents', label: 'Personal Assistant', description: 'One assistant that remembers. Alone, or a lead that hires help.', glyph: { text: '人' }, destination: 'Ronin Lab' },
  { handle: 'health_and_fitness', shelf: 'teams', label: 'Home Health', description: 'Head coach, nutritionist, race guide. Drop or add roles.', glyph: { path: 'M3 17h6l3-8 5 14 3-6h9' }, destination: 'Ronin Lab' },
  { handle: 'morning_brief', shelf: 'teams', label: 'Grokbot Morning Briefing', description: 'Grok writes you a briefing on a schedule you set.', glyph: { path: 'M6 22a10 10 0 0 1 20 0 M2 26h28 M16 5v3 M7 10l2 2 M25 10l-2 2' }, destination: 'Ronin Lab' },
  { handle: 'agent_editable_doc', shelf: 'agents', label: 'Agent + Editable Doc', description: 'One coding agent beside a document you both edit.', glyph: { rects: [[9, 4, 16, 24]], path: 'M13 12h8 M13 17h8 M13 22h5' }, destination: 'Ronin Lab' },
]);

/**
 * WHAT A PERSON USES RONIN FOR, and the three stones each answer shows first. The labels
 * and the triads are the owner artifact's proposal and provisional: change them here, in
 * one place. Several kinds may be picked; the stones shown are the union. Before any pick,
 * the default three.
 */
export const PRESET_KINDS = Object.freeze([
  { id: 'build', label: 'Build software', presets: Object.freeze(['bare_metal', 'staff_my_codebase', 'develop_new_project']) },
  { id: 'life', label: 'Life Assistants', presets: Object.freeze(['personal_assistant', 'health_and_fitness', 'agent_editable_doc']) },
  { id: 'research', label: 'Research and writing', presets: Object.freeze(['morning_brief', 'personal_assistant', 'bare_metal']) },
]);
export const DEFAULT_RESTING_PRESETS = Object.freeze(['bare_metal', 'personal_assistant', 'agent_editable_doc']);
export const PRESET_KINDS_KEY = 'ronin.setup.kinds.v1';
const knownKind = (id) => PRESET_KINDS.some((kind) => kind.id === id);
/** The house handles at rest for the picked kinds, in kind order, deduplicated. */
export const restingPresets = (kinds = []) => {
  const picked = PRESET_KINDS.filter((kind) => kinds.includes(kind.id)).flatMap((kind) => kind.presets);
  return picked.length ? [...new Set(picked)] : [...DEFAULT_RESTING_PRESETS];
};
/** One preference shared by Register and Presets; the Setup environment persists it. */
export function createKindsPreference(storage = globalThis.localStorage, persist = null) {
  let kinds = [];
  const listeners = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(PRESET_KINDS_KEY) || '[]');
    if (Array.isArray(saved)) kinds = saved.map(String).filter(knownKind);
  } catch { /* storage is optional */ }
  const api = {
    get: () => [...kinds],
    set: (next, { save = true } = {}) => {
      kinds = [...new Set((Array.isArray(next) ? next : []).map(String).filter(knownKind))];
      try { storage?.setItem(PRESET_KINDS_KEY, JSON.stringify(kinds)); } catch { /* storage is optional */ }
      if (save && typeof persist === 'function') void persist([...kinds]);
      for (const listener of listeners) listener([...kinds]);
      return [...kinds];
    },
    hydrate: (next) => api.set(next, { save: false }),
    toggle: (id) => api.set(kinds.includes(id) ? kinds.filter((kind) => kind !== id) : [...kinds, id]),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return api;
}
/** The kind pills — the same row on Register and above the stones. */
export function renderKindPills(host, preference, { lead = '' } = {}) {
  const row = document.createElement('div'); row.className = 'cv-pills sp-kinds';
  if (lead) { const word = document.createElement('span'); word.className = 'sp-kinds-lead'; word.textContent = lead; row.append(word); }
  const paint = (picked) => {
    for (const button of row.querySelectorAll?.('.cv-pill') || []) button.setAttribute('aria-pressed', String(picked.includes(button.dataset.kind)));
  };
  for (const kind of PRESET_KINDS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cv-pill'; button.dataset.kind = kind.id;
    button.textContent = kind.label; button.setAttribute('aria-pressed', String(preference.get().includes(kind.id)));
    button.addEventListener('click', () => preference.toggle(kind.id));
    row.append(button);
  }
  const stop = preference.subscribe(paint);
  host.append(row);
  return { el: row, destroy: stop };
}

const treatment = (controls, launchShape, seats) => Object.freeze({ controls: Object.freeze(controls), launchShape, seats });
export const CORE_PRESET_TREATMENTS = Object.freeze({
  bare_metal: treatment(['sessions'], 'team', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : Math.max(1, sessions.length), seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
  staff_my_codebase: treatment(['root'], 'team', () => ({ count: 2, seats: [] })),
  develop_new_project: treatment(['root', 'features'], 'team', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : 2, seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
  personal_assistant: treatment(['assistant_mode', 'specialists'], 'choice', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : Math.max(1, sessions.length), seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
  health_and_fitness: treatment(['roles'], 'team', ({ sessions = [], team = '' }) => ({ count: 4, seats: [
    sessions.find((row) => /head[_ -]coach/i.test(row.name)) && { workspace: 'workspace1', type: 'session', key: sessions.find((row) => /head[_ -]coach/i.test(row.name)).name },
    team && { workspace: 'workspace2', type: 'team.commons', key: team, tab: 'wipeboard' },
    ...sessions.filter((row) => !/head[_ -]coach/i.test(row.name)).slice(0, 2).map((row, index) => ({ workspace: `workspace${index + 3}`, type: 'session', key: row.name })),
  ].filter(Boolean) })),
  morning_brief: treatment(['schedule', 'roles'], 'team', ({ sessions = [], team = '', document = '' }) => ({ count: 4, seats: [
    sessions[0] && { workspace: 'workspace1', type: 'session', key: sessions[0].name },
    team && { workspace: 'workspace2', type: 'team.commons', key: team, tab: 'cron-jobs' },
    document && { workspace: 'workspace3', type: 'document', key: document },
  ].filter(Boolean) })),
  agent_editable_doc: treatment(['root', 'document'], 'agent', ({ sessions = [], document = '' }) => ({ count: 2, seats: [
    sessions[0] && { workspace: 'workspace1', type: 'session', key: sessions[0].name },
    document && { workspace: 'workspace2', type: 'document', key: document },
  ].filter(Boolean) })),
});

export const isCorePreset = (handle) => Object.hasOwn(CORE_PRESET_TREATMENTS, String(handle || ''));
export const bareMetalWorkspaceCount = (count) => count <= 1 ? 1 : count === 2 ? 2 : 4;
export const cascadeProvider = (rows, provider, previous = '') => rows.map((row) => ({
  ...row,
  provider: !row.provider || row.provider === previous ? provider : row.provider,
}));
export const presetActions = (handle) => ['user_message', 'customize', 'launch', ...(isCorePreset(handle) ? CORE_PRESET_TREATMENTS[handle].controls : [])];
export function firstActivatableProvider(runtime = {}) {
  return (Array.isArray(runtime.providers) ? runtime.providers : []).find((provider) => {
    if (!provider?.id || provider.activated === true || provider.blocked) return false;
    return provider.installed === true || provider.installable === true || provider.login_open === true
      || ['installable', 'installed', 'login_open'].includes(provider.state);
  }) || null;
}
export function presetRequirementTargets(handle, runtime = {}) {
  const targets = [];
  if (Number(runtime.activated_count || 0) < 1) {
    targets.push('setup.providers');
    const provider = firstActivatableProvider(runtime);
    if (provider) targets.push(`setup.provider:${provider.id}`);
  }
  if (handle === 'personal_assistant' && runtime.gbrain?.active !== true) targets.push('setup.gbrain');
  if (handle === 'morning_brief' && runtime.services?.active !== true) targets.push('setup.services');
  return targets;
}
export function createPresetRequirementState(setter = () => {}) {
  let state = { hovered: [], open: [], flash: [], flashCycle: 0 };
  const keys = (targets) => [...new Set((Array.isArray(targets) ? targets : []).filter((target) => typeof target === 'string' && target))];
  const publish = (patch = {}) => {
    state = { ...state, ...patch };
    const next = {
      hovered: [...state.hovered], open: [...state.open], flash: [...state.flash],
      flashCycle: state.flashCycle,
    };
    setter(next);
    return next;
  };
  return {
    preview: (targets) => publish({ hovered: keys(targets) }),
    clearPreview: () => publish({ hovered: [] }),
    select: (targets) => {
      const selected = keys(targets);
      return publish({
        hovered: [], open: selected, flash: selected,
        flashCycle: selected.length ? state.flashCycle + 1 : state.flashCycle,
      });
    },
    syncOpen: (targets) => {
      const opened = keys(targets);
      return publish({ open: opened, ...(opened.length ? {} : { flash: [] }) });
    },
    snapshot: () => ({ ...state, hovered: [...state.hovered], open: [...state.open], flash: [...state.flash] }),
  };
}
export function presetReadiness(handle, runtime = {}) {
  const provider = Number(runtime.activated_count || 0) > 0;
  const targets = presetRequirementTargets(handle, runtime);
  const activatable = firstActivatableProvider(runtime);
  if (!provider) return { ready: false, reason: 'Activate one model provider before launching a preset.', surface: 'setup.providers', detail: { provider: activatable?.id || '' }, targets };
  if (handle === 'personal_assistant' && runtime.gbrain?.active !== true) return { ready: false, reason: 'Personal Assistant requires gbrain to be active.', surface: 'setup.gbrain', detail: {}, targets };
  if (handle === 'morning_brief' && runtime.services?.active !== true) return { ready: false, reason: 'Grokbot Morning Briefing requires Ronin Services to be active.', surface: 'setup.services', detail: {}, targets };
  return { ready: true, reason: '', surface: '', detail: {}, targets: [] };
}
export function seatingPlan(handle, receipt = {}) {
  const fixed = CORE_PRESET_TREATMENTS[handle];
  if (!fixed) return null;
  const plan = fixed.seats(receipt);
  return plan.seats.length ? plan : null;
}

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};
const field = (label, control) => { const wrap = el('label', 'sp-field'); wrap.append(el('span', '', label), control); return wrap; };
const input = (value = '', type = 'text') => { const out = el('input'); out.type = type; out.value = value; return out; };
const option = (value, label = value) => { const out = el('option', '', label); out.value = value; return out; };
const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

export function initialControls(handle, defaultProvider = '') {
  switch (handle) {
    case 'bare_metal': return { sessions: [{ name: 'session_1', provider: defaultProvider }, { name: 'session_2', provider: defaultProvider }] };
    case 'staff_my_codebase': return { root: 'ronin_project_1', root_dir: '' };
    case 'develop_new_project': return { root: 'ronin_project_1', features: ['frontend', 'backend'] };
    case 'personal_assistant': return { assistant_mode: 'single', specialists: '' };
    case 'health_and_fitness': return { roles: [
      { name: 'Head Coach', ask: 'Set the programme, hold the check-ins, and adjust it season by season.' },
      { name: 'Nutritionist', ask: "Match the plate to the programme; plan the week's meals around real life." },
      { name: 'Race and Event Guide', ask: "Put the next race or event on the calendar, build the training weeks back from it, and know the course, the rules, the kit list and the day's logistics." },
    ] };
    case 'morning_brief': return { schedule: 'daily 08:00', roles: [
      { name: 'brief writer', ask: "Write the morning page on the owner's topic: what moved, what is waiting on the owner, and what today holds. One page, read on a phone in the time the kettle takes. List it on the Docs tab." },
      { name: 'reader', ask: 'Read what the topic produced since yesterday — documents, records, and notes in the project root — and hand the writer the facts, each with the document that proves it.' },
    ] };
    case 'agent_editable_doc': return { root: 'ronin_lab', document: 'README.md' };
    default: return {};
  }
}

export function buildLaunchPlan(slot, message, controls) {
  const handle = slot?.handle || '';
  return {
    template: { shelf: slot?.shelf || '', name: handle },
    user_message: String(message || '').trim(),
    treatment: isCorePreset(handle) ? handle : null,
    launch_shape: CORE_PRESET_TREATMENTS[handle]?.launchShape || 'ordinary',
    inputs: structuredClone(controls || {}),
  };
}

function renderRootControls(host, state, roots, label = 'Which project') {
  const select = el('select');
  for (const root of roots) select.append(option(root.name || root.id, root.label || root.name || root.id));
  if (!select.options.length) select.append(option(state.root || 'ronin_project_1', state.root || 'Ronin Project 1'));
  select.value = state.root;
  select.addEventListener('change', () => { state.root = select.value; });
  host.append(field(label, select));
}

function renderCodebaseControls(host, state) {
  const picker = createFolderPicker({ value: state.root_dir || '', onChange: (dir, folder = null) => {
    state.root_dir = dir;
    state.root = folder?.registered_root?.name || '';
  } });
  host.append(field('Your own codebase', picker.el));
  const url = input(); url.placeholder = 'https://github.com/owner/repository'; url.disabled = true;
  host.append(field('GitHub repo · remote evaluation pending', url));
}

function renderRows(host, state, key, providers, addLabel) {
  const rows = el('div', 'sp-rows');
  const paint = () => {
    rows.replaceChildren();
    state[key].forEach((row, index) => {
      if (typeof row === 'string') row = state[key][index] = { name: row, provider: '' };
      const line = el('div', 'sp-row');
      const name = input(row.name); name.setAttribute('aria-label', `${addLabel} ${index + 1}`);
      name.addEventListener('input', () => { row.name = slug(name.value); });
      const provider = el('select'); provider.setAttribute('aria-label', 'Model provider');
      provider.append(option('', 'Default provider'), ...providers.map((item) => option(item.id || item.name, item.label || item.name || item.id)));
      provider.value = row.provider || '';
      provider.addEventListener('change', () => { row.provider = provider.value; });
      const remove = el('button', 'sp-remove', '✕'); remove.type = 'button'; remove.title = `Remove ${addLabel}`;
      remove.addEventListener('click', () => { state[key].splice(index, 1); paint(); });
      line.append(name, provider, remove); rows.append(line);
    });
    const add = el('button', 'fs-door', `＋ Add ${addLabel}`); add.type = 'button';
    add.addEventListener('click', () => { state[key].push({ name: `${slug(addLabel)}_${state[key].length + 1}`, provider: providers.find((p) => p.activated)?.id || '' }); paint(); });
    rows.append(add);
  };
  paint(); host.append(rows);
}

function renderAskRows(host, state, key, addLabel) {
  const rows = el('div', 'sp-rows');
  const paint = () => {
    rows.replaceChildren();
    state[key].forEach((row, index) => {
      if (typeof row === 'string') row = state[key][index] = { name: row, ask: '' };
      const line = el('div', 'sp-row sp-row-ask');
      const name = input(row.name); name.setAttribute('aria-label', `${addLabel} ${index + 1}`);
      name.addEventListener('input', () => { row.name = slug(name.value); });
      const ask = input(row.ask); ask.placeholder = 'What should this agent do?'; ask.setAttribute('aria-label', `Ask for ${row.name}`);
      ask.addEventListener('input', () => { row.ask = ask.value; });
      const remove = el('button', 'sp-remove', '✕'); remove.type = 'button'; remove.title = `Remove ${addLabel}`;
      remove.addEventListener('click', () => { state[key].splice(index, 1); paint(); });
      line.append(name, ask, remove); rows.append(line);
    });
    const add = el('button', 'fs-door', `＋ Add ${addLabel}`); add.type = 'button';
    add.addEventListener('click', () => { state[key].push({ name: `${slug(addLabel)}_${state[key].length + 1}`, ask: '' }); paint(); });
    rows.append(add);
  };
  paint(); host.append(rows);
}

function renderSpecialControls(host, handle, state, runtime) {
  const providers = runtime.providers || [], roots = runtime.roots || [];
  if (handle === 'staff_my_codebase') renderCodebaseControls(host, state);
  if (handle === 'develop_new_project') renderRootControls(host, state, roots, 'Where');
  if (handle === 'agent_editable_doc') renderRootControls(host, state, roots, 'Which folder');
  if (handle === 'bare_metal') { host.append(el('p', 'sp-control-label', 'Choose the model for each session')); renderRows(host, state, 'sessions', providers, 'Session'); }
  if (handle === 'develop_new_project') { host.append(el('p', 'sp-control-label', 'Split the work · each feature agent gets its own worktree')); renderRows(host, state, 'features', providers, 'Feature Agent'); }
  if (handle === 'health_and_fitness') { host.append(el('p', 'sp-control-label', "Each agent's kick-off message")); renderAskRows(host, state, 'roles', 'role'); }
  if (handle === 'personal_assistant') {
    const select = el('select');
    select.append(option('single', 'Single assistant'), option('recruit', 'Chief of Staff'));
    select.value = state.assistant_mode; select.addEventListener('change', () => { state.assistant_mode = select.value; specialists.hidden = select.value !== 'recruit'; });
    const specialists = input(state.specialists); specialists.placeholder = 'financial adviser, research, scheduling…'; specialists.addEventListener('input', () => { state.specialists = specialists.value; });
    specialists.hidden = state.assistant_mode !== 'recruit';
    host.append(field('How it runs', select), field('Recruit', specialists));
  }
  if (handle === 'morning_brief') {
    const when = el('select');
    for (const [value, label] of [['daily 07:00', 'Every day, 7:00'], ['daily 08:00', 'Every day, 8:00'], ['weekdays 08:00', 'Weekdays, 8:00']]) when.append(option(value, label));
    when.value = state.schedule; when.addEventListener('change', () => { state.schedule = when.value; });
    host.append(field('When', when), el('p', 'sp-control-label', 'What Grokbot looks at'));
    renderAskRows(host, state, 'roles', 'role');
  }
  if (handle === 'agent_editable_doc') { const doc = input(state.document); doc.addEventListener('input', () => { state.document = doc.value; }); host.append(field('Which document', doc)); }
}

function presetGlyph(slot) {
  const wrap = el('i', 'sp-glyph');
  wrap.setAttribute('aria-hidden', 'true');
  if (slot.glyph?.text) { wrap.textContent = slot.glyph.text; return wrap; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of [['viewBox', '0 0 32 32'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'square'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  for (const [x, y, width, height] of slot.glyph?.rects || []) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [name, value] of Object.entries({ x, y, width, height })) rect.setAttribute(name, String(value));
    svg.append(rect);
  }
  if (slot.glyph?.path) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', slot.glyph.path); svg.append(path); }
  wrap.append(svg); return wrap;
}

function storedSlots(environment) {
  if (typeof environment.loadPresetSlots === 'function') return environment.loadPresetSlots();
  try { return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || 'null'); } catch { return null; }
}
function saveSlots(environment, slots) {
  if (typeof environment.savePresetSlots === 'function') return environment.savePresetSlots(slots);
  try { localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(slots)); } catch { /* storage is optional */ }
}

export function createPresetsSurface({ environment = {}, workspace = 'workspace1' } = {}) {
  const { createSurface, createAction, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('setup.presets', 'Presets'), className: 'sp-surface' });
  const grid = el('div', 'sp-grid'), detail = el('div', 'sp-detail'), notice = createNotice();
  const kinds = environment.kinds || createKindsPreference();
  const more = el('div', 'sp-more');
  const showAll = createAction({ label: t('setup.presets_show_all', 'Show all seven ›'), size: 'compact', action: () => { expanded = !expanded; if (!visibleIndexes().includes(selected)) selected = -1; paintGrid(); paintDetail(); } });
  more.append(showAll.el);
  renderKindPills(surface.content, kinds, { lead: t('setup.presets_kinds_lead', 'You use Ronin for') });
  const inner = el('div', 'sp-inner');
  const column = el('div', 'sp-column'); column.append(grid, more);
  inner.append(column, detail); surface.content.append(inner, notice.el);
  let templates = [], runtime = { providers: [], roots: [] }, selected = -1, expanded = false;
  let slots = HOUSE_PRESETS.map((row) => ({ ...row }));
  const controls = new Map();
  const requirementState = createPresetRequirementState((next) => environment.setSetupRequirementState?.(next));

  const available = () => templates.map((row) => ({ ...row, shelf: row.shelf || (row.agents ? 'teams' : 'agents'), handle: row.name }));
  const save = () => saveSlots(environment, slots.map(({ handle, shelf }) => ({ handle, shelf })));
  const current = () => selected >= 0 ? slots[selected] : null;
  const controlState = () => {
    const slot = current();
    if (!controls.has(slot.handle)) controls.set(slot.handle, initialControls(slot.handle, runtime.providers.find((row) => row.activated)?.id || ''));
    return controls.get(slot.handle);
  };

  // THREE STONES AT REST. The resting set is by house position, so a replaced slot keeps
  // its place; all seven stay in the DOM (hidden when folded) so slot indexes, persistence
  // and change-preset hold. Show all seven unfolds the rest.
  const restingIndexes = () => restingPresets(kinds.get()).map((handle) => HOUSE_PRESETS.findIndex((row) => row.handle === handle)).filter((index) => index >= 0);
  const visibleIndexes = () => expanded ? slots.map((_, index) => index) : restingIndexes();
  const paintGrid = () => {
    grid.replaceChildren();
    const visible = visibleIndexes();
    showAll.el.textContent = expanded ? t('setup.presets_show_fewer', '‹ Show fewer') : t('setup.presets_show_all', 'Show all seven ›');
    showAll.el.setAttribute('aria-expanded', String(expanded));
    slots.forEach((slot, index) => {
      const button = el('button', 'sp-slot'); button.type = 'button'; button.setAttribute('aria-pressed', String(index === selected));
      const position = visible.indexOf(index);
      button.hidden = position < 0;
      button.dataset.column = String(position < 0 ? 0 : position % 3);
      button.dataset.column2 = String(position < 0 ? 0 : position % 2);
      const gate = presetReadiness(slot.handle, runtime);
      button.dataset.gated = String(!gate.ready);
      if (!gate.ready) button.title = gate.reason;
      button.append(presetGlyph(slot), el('b', '', slot.label || slot.handle), el('small', 'sp-slot-copy', slot.description || ''));
      if (!gate.ready) {
        button.addEventListener('mouseenter', () => requirementState.preview(gate.targets));
        button.addEventListener('mouseleave', () => requirementState.clearPreview());
        button.addEventListener('focus', () => requirementState.preview(gate.targets));
        button.addEventListener('blur', () => requirementState.clearPreview());
      }
      button.addEventListener('click', () => {
        selected = selected === index ? -1 : index;
        requirementState.select(selected < 0 || gate.ready ? [] : gate.targets);
        paintGrid(); paintDetail();
      }); grid.append(button);
    });
  };

  const paintDetail = () => {
    detail.replaceChildren(); const slot = current();
    inner.dataset.open = String(Boolean(slot));
    detail.hidden = !slot;
    if (!slot) { requirementState.syncOpen([]); return; }
    const gate = presetReadiness(slot.handle, runtime);
    requirementState.syncOpen(gate.ready ? [] : gate.targets);
    const heading = el('div', 'sp-heading');
    heading.append(el('h3', '', slot.label || slot.handle));
    const go = el('div', 'sp-go');
    const warning = el('p', 'sp-warning', gate.reason); warning.hidden = true;
    let warningTimer = null;
    const showHeld = () => {
      warning.hidden = false; requirementState.select(gate.targets);
      clearTimeout(warningTimer); warningTimer = setTimeout(() => { warning.hidden = true; }, 3200);
    };
    const message = el('textarea'); message.rows = 3; message.placeholder = 'What should it start on?';
    const launchNow = async () => {
      if (typeof environment.launch !== 'function') return notice.set('failed', 'Launch is not available yet.');
      const tab = environment.reserveLaunchTab?.() || window.open('about:blank', '_blank');
      launch.setDisabled(true); notice.set('info', 'Launching…');
      const result = await environment.launch(buildLaunchPlan(slot, message.value, controlState()));
      launch.setDisabled(false);
      if (!result?.ok) { tab?.close?.(); return notice.set('failed', result?.message || 'Launch failed.'); }
      const plan = seatingPlan(slot.handle, result.data || {});
      const url = environment.launchUrl?.(result.data || {}, plan) || result.data?.url;
      if (tab && url) { tab.opener = null; tab.location.href = url; }
      else if (url) window.open(url, '_blank', 'noopener');
      notice.set('success', 'Launched in a new tab.');
    };
    if (!gate.ready) { const mark = el('button', 'sp-warn', '!'); mark.type = 'button'; mark.title = 'Not launchable yet'; mark.addEventListener('click', showHeld); go.append(mark); }
    const launch = createAction({ label: 'Launch', kind: 'primary', action: gate.ready ? launchNow : showHeld });
    launch.el.className = `${launch.el.className || ''} sp-launch`.trim();
    if (!gate.ready) { launch.el.dataset.held = 'true'; launch.el.setAttribute('aria-disabled', 'true'); }
    go.append(launch.el); heading.append(go); detail.append(heading, warning, el('p', 'sp-description', slot.description || ''));
    const panel = el('div', 'sp-choice-panel');
    if (isCorePreset(slot.handle)) { const fixed = el('div', 'sp-controls'); renderSpecialControls(fixed, slot.handle, controlState(), runtime); panel.append(fixed); }
    if (slot.handle !== 'bare_metal') panel.append(field('Initial message to agent', message));
    detail.append(panel);
  };

  kinds.subscribe(() => {
    const visible = visibleIndexes();
    if (!visible.includes(selected)) { selected = -1; paintGrid(); paintDetail(); }
    else paintGrid();
  });
  const enter = async () => {
    surface.setState('loading', 'Loading presets…');
    const supplied = await environment.presetData?.();
    if (supplied) {
      templates = Array.isArray(supplied.templates) ? supplied.templates : [];
      runtime = supplied.runtime || runtime;
    }
    else {
      const [teams, agents, setup] = await Promise.all([request('/api/templates/teams'), request('/api/templates/agents'), request('/api/setup/runtime')]);
      templates = [...(teams.ok ? teams.data : []).map((row) => ({ ...row, shelf: 'teams' })), ...(agents.ok ? agents.data : []).map((row) => ({ ...row, shelf: 'agents' }))];
      runtime = setup.ok ? setup.data : runtime;
    }
    const remembered = await storedSlots(environment);
    if (Array.isArray(remembered) && remembered.length === HOUSE_PRESETS.length) slots = HOUSE_PRESETS.map((fallback, index) => {
      const saved = remembered[index] || {}; const row = available().find((item) => item.handle === saved.handle && item.shelf === saved.shelf);
      return row || fallback;
    });
    surface.setState('', ''); paintGrid(); paintDetail();
  };
  return { el: surface.el, enter, show: enter, slots: () => slots.map((row) => ({ ...row })), workspace };
}

export function registerPresetsSurface(library = WorkspaceKit.workbench.library) {
  if (library.has(PRESETS_TYPE)) return PRESETS_TYPE;
  return library.register({
    type: PRESETS_TYPE,
    header: 'surface',
    label: () => t('setup.presets', 'Presets'),
    summary: () => t('setup.presets_summary', 'Seven quick starts, each editable.'),
    create: ({ environment, workspace }) => environment?.presets?.(workspace) || createPresetsSurface({ environment, workspace }),
  });
}
