/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';

export { createStoneWorkSurface };

export const PRESETS_TYPE = 'setup.presets';
export const PRESET_STORAGE_KEY = 'ronin.setup.presets.v1';

export const HOUSE_PRESETS = Object.freeze([
  { handle: 'bare_metal', shelf: 'teams', label: 'Bare Metal', description: 'Start one to four agents, each in its own tile. Lock and load.', glyph: { rects: [[4, 9, 10, 14], [18, 9, 10, 14]] }, destination: 'Ronin Lab' },
  { handle: 'ronin_team', shelf: 'teams', label: 'Ronin Team', description: 'A Team Lead and two agents, born with the full Ronin team room.', glyph: { text: '人人' }, destination: 'Ronin Lab' },
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
 * one place. The visible choice is singular.
 */
export const PRESET_KINDS = Object.freeze([
  { id: 'build', label: 'Build software', presets: Object.freeze(['bare_metal', 'ronin_team', 'staff_my_codebase', 'develop_new_project']) },
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
  const choices = [
    ...PRESET_KINDS.map(({ id, label }) => ({ id, label, kinds: [id] })),
    { id: 'all', label: 'All Sample Presets', kinds: PRESET_KINDS.map(({ id }) => id) },
  ];
  const paint = (picked) => {
    const id = picked.length === PRESET_KINDS.length && PRESET_KINDS.every(({ id: kind }) => picked.includes(kind))
      ? 'all'
      : picked.length === 1 && knownKind(picked[0]) ? picked[0] : '';
    for (const button of row.querySelectorAll?.('.cv-pill[data-kind]') || []) button.setAttribute('aria-pressed', String(button.dataset.kind === id));
  };
  for (const choice of choices) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'cv-pill'; button.dataset.kind = choice.id;
    button.textContent = choice.label;
    button.addEventListener('click', () => preference.set(choice.kinds));
    row.append(button);
  }
  paint(preference.get());
  const stop = preference.subscribe(paint);
  host.append(row);
  return { el: row, destroy: stop };
}

const treatment = (controls, launchShape, seats) => Object.freeze({ controls: Object.freeze(controls), launchShape, seats });
export const CORE_PRESET_TREATMENTS = Object.freeze({
  bare_metal: treatment(['sessions'], 'team', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : Math.max(1, sessions.length), seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
  ronin_team: treatment(['sessions'], 'team', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : Math.max(1, sessions.length), seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
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
  agent_editable_doc: treatment(['root', 'document'], 'agent', ({ sessions = [], document = '', root = '' }) => ({ count: 2, seats: [
    sessions[0] && { workspace: 'workspace1', type: 'session', key: sessions[0].name },
    document && root && { workspace: 'workspace2', type: 'document', key: document, root, path: document },
  ].filter(Boolean) })),
});

export const isCorePreset = (handle) => Object.hasOwn(CORE_PRESET_TREATMENTS, String(handle || ''));
export const bareMetalWorkspaceCount = (count) => count <= 1 ? 1 : count === 2 ? 2 : 4;
export const cascadeProvider = (rows, provider, previous = '') => rows.map((row) => ({
  ...row,
  provider: !row.provider || row.provider === previous ? provider : row.provider,
}));
/** The providers a preset row may run on: activated ones only, in catalog order. */
export const eligibleProviders = (runtime = {}) => (Array.isArray(runtime.providers) ? runtime.providers : []).filter((provider) => provider?.id && provider.activated === true);
export const presetActions = (handle) => ['user_message', 'launch', ...(isCorePreset(handle) ? CORE_PRESET_TREATMENTS[handle].controls : [])];
export function firstActivatableProvider(runtime = {}) {
  return (Array.isArray(runtime.providers) ? runtime.providers : []).find((provider) => {
    if (!provider?.id || provider.activated === true || provider.blocked) return false;
    return provider.installed === true || provider.installable === true || provider.login_open === true
      || ['installable', 'installed', 'login_open'].includes(provider.state);
  }) || null;
}
export function presetReadiness(handle, runtime = {}) {
  const provider = Number(runtime.activated_count || 0) > 0;
  const activatable = firstActivatableProvider(runtime);
  if (!provider) return { ready: false, reason: 'A model provider is required before launching a preset.', surface: 'setup.providers', detail: { provider: activatable?.id || '' } };
  if (handle === 'personal_assistant' && runtime.gbrain?.active !== true) return { ready: false, reason: 'Personal Assistant requires gbrain to be active.', surface: 'setup.gbrain', detail: {} };
  if (handle === 'morning_brief' && runtime.services?.active !== true) return { ready: false, reason: 'Grokbot Morning Briefing requires Ronin Services to be active.', surface: 'setup.services', detail: {} };
  return { ready: true, reason: '', surface: '', detail: {} };
}
export function seatingPlan(handle, receipt = {}, inputs = {}) {
  const fixed = CORE_PRESET_TREATMENTS[handle];
  if (!fixed) return null;
  const plan = fixed.seats(receipt);
  if (handle === 'bare_metal' && [2, 4].includes(Number(inputs.tiles))) plan.count = Math.max(plan.count, Number(inputs.tiles));
  return plan.seats.length ? plan : null;
}

const el = (tag, cls = '', text = '') => {
  const out = document.createElement(tag);
  if (cls) out.className = cls;
  if (text) out.textContent = text;
  return out;
};
const field = (label, control, prompt = '') => {
  const wrap = el('label', 'sp-field sp-section');
  const head = el('span', 'sp-field-label');
  head.append(el('span', '', label));
  if (prompt) head.append(el('span', 'sp-select', prompt));
  wrap.append(head, control);
  return wrap;
};
const controlLabel = (label, prompt = '') => {
  const head = el('p', 'sp-control-label');
  head.append(el('span', '', label));
  if (prompt) head.append(el('span', 'sp-select', prompt));
  return head;
};
const section = (label, prompt, ...content) => {
  const wrap = el('section', 'sp-section');
  wrap.append(controlLabel(label, prompt), ...content);
  return wrap;
};
const input = (value = '', type = 'text') => { const out = el('input'); out.type = type; out.value = value; return out; };
const option = (value, label = value) => { const out = el('option', '', label); out.value = value; return out; };
const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

export function initialControls(handle, defaultProvider = '') {
  switch (handle) {
    case 'bare_metal': return { tiles: 2, sessions: [{ name: 'session_1', provider: defaultProvider, model: '' }, { name: 'session_2', provider: defaultProvider, model: '' }] };
    case 'ronin_team': return { sessions: [
      { name: 'team_lead', provider: defaultProvider, model: '', team_lead: true },
      { name: 'agent_1', provider: defaultProvider, model: '' },
      { name: 'agent_2', provider: defaultProvider, model: '' },
    ] };
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
    case 'agent_editable_doc': return { root: 'ronin_lab', document: 'priorities-for-the-week.md' };
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

function workspaceFoldersAction(environment, label = '＋ workspace folder', detail = {}) {
  const action = el('button', 'sp-workspace-link', label); action.type = 'button';
  action.addEventListener('click', () => environment.navigateToSurface?.('setup.roots', detail));
  return action;
}

function renderRootControls(host, state, roots, label = 'Which project', environment = null, manage = false) {
  const select = el('select');
  for (const root of roots) select.append(option(root.name || root.id, root.label || root.name || root.id));
  if (!select.options.length) select.append(option(state.root || 'ronin_project_1', state.root || 'Ronin Project 1'));
  select.value = state.root;
  select.addEventListener('change', () => { state.root = select.value; });
  const content = el('div', 'sp-root-choice'); content.append(select);
  if (manage) content.append(workspaceFoldersAction(environment));
  host.append(field(label, content, 'select'));
}

function renderCodebaseControls(host, state, environment) {
  const browser = el('div', 'sp-codebase-browser');
  const place = el('div', 'sp-codebase-place');
  const listing = el('div', 'sp-codebase-list');
  let current = '';
  let parent = '';
  const load = async (dir = current) => {
    listing.replaceChildren(el('p', 'setup-fine', 'Reading folders…'));
    const query = new URLSearchParams(); if (dir) query.set('dir', dir);
    const result = await request(`/api/folders?${query}`, { cache: 'no-store' });
    if (!result.ok) { listing.replaceChildren(el('p', 'setup-notice bad', result.message)); return; }
    current = result.data.dir || ''; parent = result.data.parent || '';
    place.replaceChildren();
    const up = el('button', 'sp-workspace-link', '← Up'); up.type = 'button'; up.disabled = !parent; up.addEventListener('click', () => parent && load(parent));
    place.append(up, el('strong', '', current === result.data.home ? 'Home' : current));
    listing.replaceChildren();
    for (const folder of result.data.folders || []) {
      const row = el('div', 'sp-codebase-row');
      const open = el('button', 'sp-codebase-open', folder.name); open.type = 'button'; open.addEventListener('click', () => load(folder.dir));
      const kind = el('span', 'sp-codebase-kind', folder.registered_root ? 'workspace folder' : folder.kind === 'repository' ? 'repository' : 'folder');
      const future = el('button', 'sp-codebase-future', folder.registered_root ? 'Used by Ronin' : 'Use with Ronin'); future.type = 'button';
      future.setAttribute('aria-pressed', String(Boolean(folder.registered_root)));
      future.addEventListener('click', () => environment.navigateToSurface?.('setup.roots', { dir: folder.dir }));
      const choose = el('button', 'sp-codebase-evaluate', state.root_dir === folder.dir ? 'Selected' : 'Evaluate'); choose.type = 'button';
      choose.addEventListener('click', () => { state.root_dir = folder.dir; state.root = folder.registered_root?.name || ''; void load(current); });
      row.append(open, kind, future, choose); listing.append(row);
    }
    if (!listing.children.length) listing.append(el('p', 'setup-fine', 'No folders here.'));
  };
  browser.append(place, listing, workspaceFoldersAction(environment, 'Manage workspace folders'));
  host.append(field('Your own codebase', browser, 'select'));
  void load();
}

const MODELS = Object.freeze({
  codex: Object.freeze(['Default model', 'gpt-5.6-sol', 'gpt-5.6']),
  claude: Object.freeze(['Default model', 'opus', 'sonnet']),
  gemini: Object.freeze(['Default model', 'gemini-3']),
  grok: Object.freeze(['Default model']),
  hermes: Object.freeze(['Default model']),
});
const cycle = (button, values, current, paint, label) => {
  const options = values.length ? values : [''];
  button.addEventListener('click', () => {
    const index = Math.max(0, options.indexOf(current()));
    paint(options[(index + 1) % options.length]);
  });
  button.setAttribute('aria-label', label);
};

function renderRows(host, state, key, providers, addLabel) {
  const rows = el('div', 'sp-rows');
  const paint = () => {
    rows.replaceChildren();
    state[key].forEach((row, index) => {
      if (typeof row === 'string') row = state[key][index] = { name: row, provider: '' };
      const line = el('div', 'sp-row');
      const name = input(row.name); name.setAttribute('aria-label', `${addLabel} ${index + 1}`);
      name.addEventListener('input', () => { row.name = slug(name.value); });
      const providerOptions = [{ id: '', label: 'Default provider' }, ...providers.map((item) => ({ id: item.id || item.name, label: item.label || item.name || item.id }))];
      const provider = el('button', 'sp-cycle'); provider.type = 'button';
      const providerPaint = (value) => { row.provider = value; row.model = ''; provider.textContent = providerOptions.find((item) => item.id === value)?.label || value || 'Default provider'; modelPaint(''); };
      cycle(provider, providerOptions.map((item) => item.id), () => row.provider || '', providerPaint, 'Model provider');
      const model = el('button', 'sp-cycle'); model.type = 'button';
      const modelValues = () => MODELS[row.provider] || ['Default model'];
      const modelPaint = (value) => { row.model = value === 'Default model' ? '' : value; model.textContent = row.model || 'Default model'; };
      model.addEventListener('click', () => {
        const values = modelValues(); const shown = row.model || 'Default model'; const index = Math.max(0, values.indexOf(shown));
        modelPaint(values[(index + 1) % values.length]);
      });
      model.setAttribute('aria-label', 'Model');
      providerPaint(row.provider || ''); modelPaint(row.model || '');
      const remove = el('button', 'sp-remove', '✕'); remove.type = 'button'; remove.title = `Remove ${addLabel}`;
      remove.addEventListener('click', () => { state[key].splice(index, 1); paint(); });
      const lead = el('span', 'sp-lead', row.team_lead ? 'Team Lead' : '');
      if (row.team_lead) remove.hidden = true;
      line.append(lead, name, provider, model, remove); rows.append(line);
    });
    const add = el('button', 'fs-door', `＋ Add ${addLabel}`); add.type = 'button';
    add.addEventListener('click', () => { state[key].push({ name: `${slug(addLabel)}_${state[key].length + 1}`, provider: providers.find((p) => p.activated)?.id || '' }); paint(); });
    rows.append(add);
  };
  paint(); host.append(rows);
}

function renderTileChoices(host, state) {
  const choices = el('div', 'sp-tile-options');
  const paint = () => {
    for (const button of choices.querySelectorAll?.('[data-tiles]') || []) button.setAttribute('aria-pressed', String(Number(button.dataset.tiles) === state.tiles));
  };
  for (const count of [2, 4]) {
    const button = el('button', 'sp-tile-choice'); button.type = 'button'; button.dataset.tiles = String(count);
    const icon = el('span', 'sp-tile-icon');
    for (let index = 0; index < count; index += 1) icon.append(el('i'));
    button.append(icon, el('span', '', count === 1 ? 'one tile' : count === 2 ? 'side by side' : 'two by two'));
    button.addEventListener('click', () => { state.tiles = count; paint(); }); choices.append(button);
  }
  paint(); host.append(choices);
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
      const ask = el('textarea'); ask.value = row.ask || ''; ask.rows = 1; ask.placeholder = 'What should this agent do?'; ask.setAttribute('aria-label', `Ask for ${row.name}`);
      // One line at rest, about three while editing: the row marks itself so the CSS can
      // give the open textarea its height without the sibling cells moving.
      ask.addEventListener('focus', () => { ask.rows = 3; line.dataset.editing = 'true'; });
      ask.addEventListener('blur', () => { ask.rows = 1; delete line.dataset.editing; });
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

const WEEKDAYS = Object.freeze([['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']]);
// THREE WAYS TO SAY WHEN, each asking only for what it needs: Every day wants a time;
// Day of the week wants the day and a time; One time wants the date and a time. The
// schedule string is the house grammar the Cron jobs route already reads.
function renderMorningBriefTiming(host, state) {
  const parsed = String(state.schedule || 'daily 08:00').match(/^daily (\d{2}:\d{2})$|^weekly ([a-z]{3}) (\d{2}:\d{2})$|^once (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
  let cadence = parsed?.[1] ? 'daily' : parsed?.[2] ? 'weekly' : parsed?.[4] ? 'once' : 'daily';
  const nextDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const timing = el('details', 'sp-timing');
  const summary = el('summary', 'sp-timing-summary');
  const editor = el('div', 'sp-timing-editor');
  const cadenceSelect = el('select');
  cadenceSelect.append(option('daily', 'Every day'), option('weekly', 'Day of the week'), option('once', 'One time'));
  cadenceSelect.value = cadence;
  const day = el('select');
  for (const [value, label] of WEEKDAYS) day.append(option(value, label));
  day.value = parsed?.[2] || 'mon';
  const date = input(parsed?.[4] || nextDay, 'date');
  const time = input(parsed?.[1] || parsed?.[3] || parsed?.[5] || '08:00', 'time');
  const cadenceField = el('label', 'sp-timing-field'); cadenceField.append(el('span', '', 'Repeats'), cadenceSelect);
  const dayField = el('label', 'sp-timing-field'); dayField.append(el('span', '', 'Day'), day);
  const dateField = el('label', 'sp-timing-field'); dateField.append(el('span', '', 'Date'), date);
  const timeField = el('label', 'sp-timing-field'); timeField.append(el('span', '', 'Time'), time);
  const dayName = () => WEEKDAYS.find(([value]) => value === day.value)?.[1] || day.value;
  const paint = () => {
    cadence = cadenceSelect.value;
    dayField.hidden = cadence !== 'weekly';
    dateField.hidden = cadence !== 'once';
    state.schedule = cadence === 'once' ? `once ${date.value} ${time.value}` : cadence === 'weekly' ? `weekly ${day.value} ${time.value}` : `daily ${time.value}`;
    summary.textContent = cadence === 'once' ? `Once · ${date.value} at ${time.value}` : cadence === 'weekly' ? `Every ${dayName()} at ${time.value}` : `Every day at ${time.value}`;
  };
  for (const control of [cadenceSelect, day, date, time]) { control.addEventListener('change', paint); control.addEventListener('input', paint); }
  editor.append(cadenceField, dayField, dateField, timeField); timing.append(summary, editor); paint();
  host.append(field('When', timing, 'select'));
}

function renderSpecialControls(host, handle, state, runtime, environment) {
  // ONLY A PROVIDER THAT IS ACTIVATED CAN RUN A ROW. The catalog lists every provider
  // Ronin knows; a row may choose only among the ones this machine can launch with.
  const providers = eligibleProviders(runtime), roots = runtime.roots || [];
  if (handle === 'staff_my_codebase') renderCodebaseControls(host, state, environment);
  if (handle === 'develop_new_project') renderRootControls(host, state, roots, 'Where', environment, true);
  if (handle === 'agent_editable_doc') renderRootControls(host, state, roots, 'Which folder', environment);
  if (handle === 'bare_metal') {
    const agents = el('div'); renderRows(agents, state, 'sessions', providers, 'Session');
    const tiles = el('div'); renderTileChoices(tiles, state);
    host.append(section('Agents run side by side', 'select', ...agents.children), section('Tile view', 'select', ...tiles.children));
  }
  if (handle === 'ronin_team') { const body = el('div'); renderRows(body, state, 'sessions', providers, 'Agent'); host.append(section('Team Lead and agents', 'select', ...body.children)); }
  if (handle === 'develop_new_project') { const body = el('div'); renderRows(body, state, 'features', providers, 'Feature Agent'); host.append(section('Split the work · each feature agent gets its own worktree', '', ...body.children)); }
  if (handle === 'health_and_fitness') { const body = el('div'); renderAskRows(body, state, 'roles', 'role'); host.append(section("Each agent's kick-off message", 'edit', ...body.children)); }
  if (handle === 'personal_assistant') {
    const modes = el('div', 'sp-mode-options');
    const specialists = input(state.specialists); specialists.placeholder = 'financial adviser, research, scheduling…'; specialists.addEventListener('input', () => { state.specialists = specialists.value; });
    const recruit = field('Recruit', specialists);
    const paintMode = () => {
      for (const button of modes.children) button.setAttribute('aria-pressed', String(button.dataset.mode === state.assistant_mode));
      recruit.hidden = state.assistant_mode !== 'recruit';
    };
    for (const [mode, label] of [['single', 'Single assistant'], ['recruit', 'Chief of Staff']]) {
      const button = el('button', 'sp-mode-choice', label); button.type = 'button'; button.dataset.mode = mode;
      button.addEventListener('click', () => { state.assistant_mode = mode; paintMode(); }); modes.append(button);
    }
    paintMode();
    host.append(field('How it runs', modes, 'select'), recruit);
  }
  if (handle === 'morning_brief') {
    renderMorningBriefTiming(host, state);
    const body = el('div'); renderAskRows(body, state, 'roles', 'role');
    host.append(section('What Grokbot looks at', 'edit', ...body.children));
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
  surface.content.className = `${surface.content.className || ''} sp-content`.trim();
  const notice = createNotice();
  const kinds = environment.kinds || createKindsPreference();
  const kindsHost = el('div', 'sws-intro');
  renderKindPills(kindsHost, kinds, { lead: t('setup.presets_kinds_lead', 'You use Ronin for') });
  let templates = [], runtime = { providers: [], roots: [] }, selected = -1;
  let detail = null;
  let slots = HOUSE_PRESETS.map((row) => ({ ...row }));
  const controls = new Map();

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
  // and change-preset hold. The All purpose exposes all seven without a second control.
  const restingIndexes = () => restingPresets(kinds.get()).map((handle) => HOUSE_PRESETS.findIndex((row) => row.handle === handle)).filter((index) => index >= 0);
  const visibleIndexes = () => restingIndexes();
  const stoneSurface = createStoneWorkSurface({
    className: 'sp-work-surface',
    renderDetail: (item, host) => { selected = Number(item.id); detail = host; paintDetail(); },
    onSelectionChange: (id) => { selected = id == null ? -1 : Number(id); },
  });
  stoneSurface.mount(surface.content, { before: [kindsHost], after: [notice.el] });
  // THE STONES START WHERE THE OTHER SURFACES' STONES START. The purpose row sits above
  // the shared rail, so its height is handed to the CSS, which takes it out of the
  // rail's top room; Presets and Model providers then rest at one elevation.
  if (typeof ResizeObserver === 'function') {
    const measure = () => surface.el.style?.setProperty?.('--sp-intro', `${Math.max(0, Math.round(stoneSurface.el.offsetTop - kindsHost.offsetTop))}px`);
    new ResizeObserver(measure).observe(kindsHost);
  }
  const paintGrid = () => {
    const visible = visibleIndexes();
    stoneSurface.setItems(slots.map((slot, index) => {
      const gate = presetReadiness(slot.handle, runtime);
      return { id: String(index), label: slot.label || slot.handle, glyph: presetGlyph(slot), hidden: !visible.includes(index), className: 'sp-preset-stone', attrs: { 'data-gated': String(!gate.ready), title: gate.ready ? '' : gate.reason } };
    }));
  };

  const paintDetail = () => {
    detail.replaceChildren(); const slot = current();
    if (!slot) return;
    const gate = presetReadiness(slot.handle, runtime);
    const heading = el('div', 'sp-heading');
    heading.append(el('h3', '', slot.label || slot.handle));
    const go = el('div', 'sp-go');
    const warning = el('p', 'sp-warning', gate.reason); warning.hidden = true;
    let warningTimer = null;
    const showHeld = () => {
      warning.hidden = false;
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
      const plan = seatingPlan(slot.handle, result.data || {}, controlState());
      const url = environment.launchUrl?.(result.data || {}, plan, tab) || result.data?.url;
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
    if (isCorePreset(slot.handle)) { const fixed = el('div', 'sp-controls'); renderSpecialControls(fixed, slot.handle, controlState(), runtime, environment); panel.append(fixed); }
    if (slot.handle !== 'bare_metal') panel.append(field('Initial message to agent', message));
    detail.append(panel);
  };

  kinds.subscribe(() => {
    const visible = visibleIndexes();
    if (!visible.includes(selected)) { selected = -1; stoneSurface.select(''); paintGrid(); }
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
    surface.setState('', ''); paintGrid();
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
