/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';

export const PRESETS_TYPE = 'setup.presets';
export const PRESET_STORAGE_KEY = 'ronin.setup.presets.v1';

export const HOUSE_PRESETS = Object.freeze([
  { handle: 'bare_metal', shelf: 'teams', label: 'Bare Metal', art: '◇', destination: 'Ronin Lab' },
  { handle: 'staff_my_codebase', shelf: 'teams', label: 'Code Stack Eval', art: '⌗', destination: 'Ronin Project 1' },
  { handle: 'develop_new_project', shelf: 'teams', label: 'Develop a New Project', art: '⌘', destination: 'Ronin Project 1' },
  { handle: 'personal_assistant', shelf: 'agents', label: 'Personal Assistant', art: '○', destination: 'Ronin Lab' },
  { handle: 'health_and_fitness', shelf: 'teams', label: 'Home Health', art: '△', destination: 'Ronin Lab' },
  { handle: 'morning_brief', shelf: 'teams', label: 'Grokbot Morning Briefing', art: '☼', destination: 'Ronin Lab' },
  { handle: 'agent_editable_doc', shelf: 'agents', label: 'Agent + Editable Doc', art: '▧', destination: 'Ronin Lab' },
]);

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
  morning_brief: treatment(['grok', 'schedule', 'delivery', 'active'], 'team', ({ sessions = [], team = '', document = '' }) => ({ count: 4, seats: [
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
    case 'staff_my_codebase': return { root: 'ronin_project_1' };
    case 'develop_new_project': return { root: 'ronin_project_1', features: ['frontend', 'backend'] };
    case 'personal_assistant': return { assistant_mode: 'single', specialists: '' };
    case 'health_and_fitness': return { roles: ['head_coach', 'nutritionist', 'race_and_event_guide'].map((name) => ({ name, provider: defaultProvider })) };
    case 'morning_brief': return { grok: 'grok', schedule: 'every day at 8am', delivery: 'team lead', active: true };
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

function renderRootControls(host, state, roots) {
  const select = el('select');
  for (const root of roots) select.append(option(root.name || root.id, root.label || root.name || root.id));
  if (!select.options.length) select.append(option(state.root || 'ronin_project_1', state.root || 'Ronin Project 1'));
  select.value = state.root;
  select.addEventListener('change', () => { state.root = select.value; });
  host.append(field('Workspace folder', select));
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

function renderSpecialControls(host, handle, state, runtime) {
  const providers = runtime.providers || [], roots = runtime.roots || [];
  if (['staff_my_codebase', 'develop_new_project', 'agent_editable_doc'].includes(handle)) renderRootControls(host, state, roots);
  if (handle === 'bare_metal') renderRows(host, state, 'sessions', providers, 'Session');
  if (handle === 'develop_new_project') renderRows(host, state, 'features', providers, 'Feature Agent');
  if (handle === 'health_and_fitness') renderRows(host, state, 'roles', providers, 'Health role');
  if (handle === 'personal_assistant') {
    const select = el('select');
    select.append(option('single', 'Single Assistant (instant)'), option('lead', 'Team Lead without recruiting'), option('recruit', 'Team Lead that recruits specialists'));
    select.value = state.assistant_mode; select.addEventListener('change', () => { state.assistant_mode = select.value; specialists.hidden = select.value !== 'recruit'; });
    const specialists = input(state.specialists); specialists.placeholder = 'financial adviser, research, scheduling…'; specialists.addEventListener('input', () => { state.specialists = specialists.value; });
    specialists.hidden = state.assistant_mode !== 'recruit';
    host.append(field('Launch as', select), field('Specialist help', specialists), el('p', 'sp-dependency', 'Requires gbrain.'));
  }
  if (handle === 'morning_brief') {
    for (const [key, label] of [['schedule', 'Cadence'], ['delivery', 'Delivery target']]) { const control = input(state[key]); control.addEventListener('input', () => { state[key] = control.value; }); host.append(field(label, control)); }
    const active = input('', 'checkbox'); active.checked = state.active; active.addEventListener('change', () => { state.active = active.checked; }); host.append(field('Start active', active));
  }
  if (handle === 'agent_editable_doc') { const doc = input(state.document); doc.addEventListener('input', () => { state.document = doc.value; }); host.append(field('Document path', doc)); }
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
  const { createSurface, createAction, createActionBar, createNotice } = WorkspaceKit.primitives;
  const surface = createSurface({ label: t('setup.presets', 'Presets'), className: 'sp-surface' });
  const grid = el('div', 'sp-grid'), detail = el('div', 'sp-detail'), notice = createNotice();
  surface.content.append(grid, detail, notice.el);
  let templates = [], runtime = { providers: [], roots: [] }, selected = 0;
  let slots = HOUSE_PRESETS.map((row) => ({ ...row }));
  const controls = new Map();
  const requirementState = createPresetRequirementState((next) => environment.setSetupRequirementState?.(next));

  const available = () => templates.map((row) => ({ ...row, shelf: row.shelf || (row.agents ? 'teams' : 'agents'), handle: row.name }));
  const save = () => saveSlots(environment, slots.map(({ handle, shelf }) => ({ handle, shelf })));
  const current = () => slots[selected];
  const controlState = () => {
    const slot = current();
    if (!controls.has(slot.handle)) controls.set(slot.handle, initialControls(slot.handle, runtime.providers.find((row) => row.activated)?.id || ''));
    return controls.get(slot.handle);
  };

  const paintGrid = () => {
    grid.replaceChildren();
    slots.forEach((slot, index) => {
      const button = el('button', 'sp-slot'); button.type = 'button'; button.setAttribute('aria-pressed', String(index === selected));
      const gate = presetReadiness(slot.handle, runtime);
      button.dataset.gated = String(!gate.ready);
      if (!gate.ready) button.title = gate.reason;
      button.append(el('i', '', slot.art || '▤'), el('b', '', slot.label || slot.handle));
      if (!gate.ready) {
        button.addEventListener('mouseenter', () => requirementState.preview(gate.targets));
        button.addEventListener('mouseleave', () => requirementState.clearPreview());
        button.addEventListener('focus', () => requirementState.preview(gate.targets));
        button.addEventListener('blur', () => requirementState.clearPreview());
      }
      button.addEventListener('click', () => {
        selected = index; requirementState.select(gate.ready ? [] : gate.targets);
        paintGrid(); paintDetail();
      }); grid.append(button);
    });
  };

  const paintDetail = () => {
    detail.replaceChildren(); const slot = current(); if (!slot) return;
    const heading = el('div', 'sp-heading');
    const headingCopy = el('div', 'sp-heading-copy');
    headingCopy.append(el('h3', '', slot.label || slot.handle), el('small', 'sp-destination', slot.destination || ''));
    heading.append(headingCopy);
    const change = el('details', 'sp-change'), summary = el('summary', '', '⚙ change preset'); change.append(summary);
    const picker = el('select');
    for (const row of available()) picker.append(option(`${row.shelf}:${row.handle}`, row.label || row.handle));
    picker.value = `${slot.shelf}:${slot.handle}`;
    picker.addEventListener('change', () => { const [shelf, handle] = picker.value.split(':'); const row = available().find((item) => item.shelf === shelf && item.handle === handle); slots[selected] = row || { shelf, handle, label: handle }; save(); paintGrid(); paintDetail(); });
    const restore = el('button', 'wk-action', 'Restore house default'); restore.type = 'button'; restore.addEventListener('click', () => { slots[selected] = { ...HOUSE_PRESETS[selected] }; save(); paintGrid(); paintDetail(); });
    change.append(picker, restore); heading.append(change); detail.append(heading);
    const gate = presetReadiness(slot.handle, runtime);
    requirementState.syncOpen(gate.ready ? [] : gate.targets);
    const message = el('textarea'); message.rows = 4; message.placeholder = 'What should this launch begin with?'; detail.append(field('User Message', message));
    if (isCorePreset(slot.handle)) { const fixed = el('div', 'sp-controls'); renderSpecialControls(fixed, slot.handle, controlState(), runtime); detail.append(fixed); }
    if (!gate.ready) {
      const blocked = el('div', 'sp-gate');
      blocked.append(el('p', '', gate.reason));
      const link = el('button', 'wk-action', gate.surface === 'setup.providers' ? 'Open model provider setup' : gate.surface === 'setup.gbrain' ? 'Open gbrain setup' : 'Open Ronin Services setup');
      link.type = 'button'; link.addEventListener('click', () => environment.navigateToSurface?.(gate.surface, gate.detail));
      blocked.append(link); detail.append(blocked);
    }
    const customize = createAction({ label: 'Customize', action: () => environment.customize?.({ template: { shelf: slot.shelf, name: slot.handle }, workspace: 'workspace2', user_message: message.value }) });
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
    const launch = createAction({ label: 'Launch', kind: 'primary', disabled: !gate.ready, ...(gate.ready ? { action: launchNow } : {}) });
    const actions = createActionBar({ label: 'Preset actions', actions: [customize, launch] }); detail.append(actions.el);
    if (!gate.ready) actions.append(el('span', 'sp-held', 'Held'));
  };

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
