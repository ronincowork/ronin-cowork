/* part of the ronin-cowork client — see js/README.md */
import { request } from './request.js';
import { t } from './lexicon.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStoneWorkSurface } from './stone-work-surface.js';
import { loadProviderCatalog, providerCatalog, modelAvailabilityFact, modelLabel } from './form-steps.js';
import { ask } from './ask.js';

export { createStoneWorkSurface };

export const PRESETS_TYPE = 'setup.presets';
export const PRESET_STORAGE_KEY = 'ronin.setup.presets.v1';

export const HOUSE_PRESETS = Object.freeze([
  { handle: 'bare_metal', shelf: 'teams', label: 'Bare Metal', description: 'Choose a provider and model for each native session, or leave it at Default.', glyph: { rects: [[4, 9, 10, 14], [18, 9, 10, 14]] }, destination: 'Ronin Lab' },
  { handle: 'ronin_team', shelf: 'teams', label: 'Ronin Team', description: 'Launch a Team Lead and open Team Configuration beside the team.', glyph: { text: '人人' }, destination: 'Ronin Lab' },
  { handle: 'staff_my_codebase', shelf: 'teams', label: 'Code Stack Eval', description: 'Point a team at a codebase and get its read on the stack.', glyph: { path: 'M5 7h22 M5 13h22 M5 19h22 M5 25h14' }, destination: 'Project One' },
  { handle: 'develop_new_project', shelf: 'teams', label: 'Develop a New Project', description: 'A lead plus workstream agents, each in its own worktree.', glyph: { path: 'M8 28V4 M8 12h6c4 0 4-4 10-4h3 M8 20h6c4 0 4 4 10 4h3' }, destination: 'Project One' },
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
const knownKind = (id) => id === 'other' || PRESET_KINDS.some((kind) => kind.id === id);
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
// THE TEAM PAGE A BARE METAL OR RONIN TEAM OPENS ON: an agent in workspace 1, the team's
// configuration from the commons in workspace 2, the other agents in 3 and 4, with the
// centre selector kept narrow so the agents have the room.
export const NARROW_SELECTOR = Object.freeze({ order: Object.freeze(['workspace1', 'selector', 'workspace2']), hidden: Object.freeze([]), widths: Object.freeze({ workspace1: 43, selector: 14, workspace2: 43 }) });
// THE LEAD TAKES TILE 1. The loader births the marked lead last, so the receipt lists it
// last; seating reads the mark, not the order. A team with no lead (Bare Metal) is as born.
export const leadFirst = (sessions = []) => { const lead = sessions.find((row) => row?.team_lead === true); return lead ? [lead, ...sessions.filter((row) => row !== lead)] : sessions; };
const agentsAroundConfiguration = ({ sessions: born = [], team = '' }) => {
  const sessions = leadFirst(born);
  return {
    count: sessions.length >= 2 || team ? 4 : Math.max(1, sessions.length),
    arrangement: NARROW_SELECTOR,
    seats: [
      sessions[0] && { workspace: 'workspace1', type: 'session', key: sessions[0].name },
      team && { workspace: 'workspace2', type: 'team.commons', key: team, tab: 'team-configuration' },
      sessions[1] && { workspace: 'workspace3', type: 'session', key: sessions[1].name },
      sessions[2] && { workspace: 'workspace4', type: 'session', key: sessions[2].name },
    ].filter(Boolean),
  };
};
export const CORE_PRESET_TREATMENTS = Object.freeze({
  bare_metal: treatment(['sessions'], 'team', (receipt) => agentsAroundConfiguration(receipt)),
  ronin_team: treatment(['sessions'], 'team', (receipt) => agentsAroundConfiguration(receipt)),
  staff_my_codebase: treatment(['root'], 'team', () => ({ count: 2, seats: [] })),
  develop_new_project: treatment(['root', 'workstreams'], 'team', ({ sessions = [] }) => ({ count: sessions.length >= 3 ? 4 : 2, seats: sessions.map((session, index) => ({ workspace: `workspace${index + 1}`, type: 'session', key: session.name })) })),
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
  if (handle === 'personal_assistant' && runtime.gbrain?.active !== true) return { ready: false, reason: 'Personal Assistant requires gbrain to be active.', surface: 'setup.installations', detail: {} };
  if (handle === 'morning_brief' && runtime.services?.active !== true) return { ready: false, reason: 'Grokbot Morning Briefing requires Ronin Services to be active.', surface: 'setup.installations', detail: {} };
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

export function initialControls(handle) {
  switch (handle) {
    case 'bare_metal': return { tiles: 4, root: 'ronin_lab', sessions: [{ name: 'session_1' }, { name: 'session_2' }, { name: 'session_3' }] };
    case 'ronin_team': return { root: 'ronin_lab', sessions: [{ name: 'team_lead', team_lead: true }, { name: 'agent_1' }, { name: 'agent_2' }] };
    case 'staff_my_codebase': return { root: 'project_one', root_dir: '' };
    case 'develop_new_project': return { root: 'project_one', workstreams: ['frontend', 'backend'] };
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

/**
 * THE ONE LIST OF WORKSPACE FOLDERS. The Setup view hands Presets the client's project
 * catalog — every tracked folder, the list the Workspace folders surface reloads after a
 * keep — shown seeded pair first under the runtime's labels, then the rest by name, as the
 * Workspace folders surface and the New Team form name them. A host with no catalog (the
 * Cowork workbench's Presets card) falls back to the runtime's seeded pair.
 */
export function rootChoices(runtime = {}, environment = null) {
  const seeded = (Array.isArray(runtime?.roots) ? runtime.roots : []).map((root) => ({ name: root.name, label: root.label || root.name }));
  const tracked = typeof environment?.trackedRoots === 'function' ? environment.trackedRoots() : null;
  if (!Array.isArray(tracked) || !tracked.length) return seeded;
  const names = new Set(tracked.map((root) => root.name));
  return [...seeded.filter((root) => names.has(root.name)), ...tracked.filter((root) => !seeded.some((seed) => seed.name === root.name)).map((root) => ({ name: root.name, label: root.title || root.name }))];
}

function renderRootControls(host, state, roots, label = 'Which project', environment = null, manage = false, live = null) {
  let question = null;
  // Filled again in place when the catalog changes: the person's choice and the rest of
  // the open detail stay as they were.
  const fill = (choices) => {
    const rows = choices.map((root) => ({ v: root.name || root.id, l: root.label || root.name || root.id }));
    if (!rows.length) rows.push({ v: state.root || 'project_one', l: state.root || 'Project One' });
    const wanted = rows.some((root) => root.v === state.root) ? state.root : rows[0].v;
    state.root = wanted;
    if (question) { question.options('root', rows); question.set('root', wanted); }
    else question = ask([{ group: '', fields: [{ key: 'root', label, options: rows }] }], { value: { root: wanted }, onChange: (value) => { state.root = value.root; } });
  };
  fill(roots);
  live?.add(fill);
  const content = el('div', 'sp-root-choice'); content.append(question.el);
  if (manage) content.append(workspaceFoldersAction(environment));
  host.append(field(label, content, 'select'));
}

/**
 * CODE STACK EVAL'S FOLDERS. Two decisions, kept apart: which folders Ronin keeps as
 * workspace folders (tick any number, then Apply — they appear on the Workspace folders
 * surface beside this one), and which one this evaluation runs on (Evaluate). Choosing a
 * folder to evaluate ticks it too, because the evaluation needs a kept folder; nothing is
 * kept until Apply. A repository is kept with the profile Ronin measured, unchanged.
 */
const rootHandle = (folder) => slug(folder.name) || 'folder';
async function keepFolder(folder) {
  const inspected = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(folder.dir)}`, { cache: 'no-store' });
  if (!inspected.ok) return inspected;
  const profile = inspected.data.repo ? {
    mode: inspected.data.repo_profile?.mode || 'direct',
    working: inspected.data.repo_profile?.mode === 'reviewed' ? (inspected.data.repo_profile?.working || '') : '',
    stable: inspected.data.repo_profile?.stable || inspected.data.repo?.branch || 'main',
    worktrees: inspected.data.repo_profile?.worktrees || 'disabled',
  } : null;
  const absent = inspected.data.arrangement?.source === 'absent';
  const before = profile ? { mode: inspected.data.arrangement?.mode || profile.mode, working: absent ? '' : (inspected.data.arrangement?.working || ''), stable: absent ? '' : (inspected.data.arrangement?.stable || ''), worktrees: profile.worktrees } : null;
  for (const name of [rootHandle(folder), `${rootHandle(folder)}_2`, `${rootHandle(folder)}_3`]) {
    const made = await request('/api/project-roots', { method: 'POST', json: { name, dir: folder.dir, ...(profile ? { before, profile, confirmed: true } : {}) } });
    if (made.ok) return { ok: true, name };
    if (!/already in the catalog/i.test(made.message || '')) return made;
  }
  return { ok: false, message: `Could not find a free handle for ${folder.name}.` };
}
function renderCodebaseControls(host, state, environment) {
  state.pending ||= [];
  const browser = el('div', 'sp-codebase-browser');
  const place = el('div', 'sp-codebase-place');
  const listing = el('div', 'sp-codebase-list');
  const bar = el('div', 'sp-codebase-apply');
  const apply = el('button', 'fs-door sp-codebase-apply-action', 'Apply'); apply.type = 'button';
  const status = el('span', 'sp-codebase-status');
  bar.append(apply, status);
  let current = '';
  let parent = '';
  let folders = [];
  const paintStatus = () => {
    const count = state.pending.length;
    const chosen = folders.find((folder) => folder.dir === state.root_dir);
    const waiting = state.root_dir && !state.root;
    apply.disabled = !count;
    status.textContent = count
      ? `${count} ${count === 1 ? 'folder becomes a workspace folder' : 'folders become workspace folders'} on Apply${waiting ? '; the evaluation runs on the one you chose' : ''}.`
      : waiting ? `Apply keeps ${chosen?.name || 'the chosen folder'} before the evaluation can run on it.`
        : state.root ? `Evaluating ${chosen?.name || state.root}.` : 'Tick the folders to keep, choose one to evaluate, then Apply.';
  };
  const load = async (dir = current) => {
    listing.replaceChildren(el('p', 'setup-fine', 'Reading folders…'));
    const query = new URLSearchParams(); if (dir) query.set('dir', dir);
    const result = await request(`/api/folders?${query}`, { cache: 'no-store' });
    if (!result.ok) { listing.replaceChildren(el('p', 'setup-notice bad', result.message)); return; }
    current = result.data.dir || ''; parent = result.data.parent || ''; folders = result.data.folders || [];
    place.replaceChildren();
    const up = el('button', 'sp-workspace-link', '← Up'); up.type = 'button'; up.disabled = !parent; up.addEventListener('click', () => parent && load(parent));
    place.append(up, el('strong', '', current === result.data.home ? 'Home' : current));
    listing.replaceChildren();
    const evaluate = ask([{ group: '', fields: [{ key: 'folder', label: t('presets.evaluate', 'Evaluate'), blank: t('presets.evaluate_none', 'Choose a folder'), options: folders.map((folder) => ({ v: folder.dir, l: folder.name, word: folder.registered_root ? t('presets.workspace_folder', 'workspace folder') : folder.kind === 'repository' ? t('presets.repository', 'repository') : t('presets.folder', 'folder') })) }] }], {
      value: { folder: state.root_dir || '' },
      onChange: (value) => {
        const folder = folders.find((row) => row.dir === value.folder); if (!folder) return;
        state.root_dir = folder.dir; state.root = folder.registered_root?.name || '';
        if (!folder.registered_root) state.pending = [...new Set([...state.pending, folder.dir])];
        paintStatus();
      },
    });
    listing.append(evaluate.el);
    for (const folder of folders) {
      const row = el('div', 'sp-codebase-row');
      const open = el('button', 'sp-codebase-open', folder.name); open.type = 'button'; open.addEventListener('click', () => load(folder.dir));
      const kind = el('span', 'sp-codebase-kind', folder.registered_root ? 'workspace folder' : folder.kind === 'repository' ? 'repository' : 'folder');
      let keep;
      if (folder.registered_root) {
        keep = el('label', 'sp-codebase-keep'); const fact = el('input'); fact.type = 'checkbox'; fact.checked = true; fact.disabled = true;
        keep.append(fact, el('span', '', t('presets.kept', 'Kept')));
      } else {
        const keepAsk = ask([{ group: '', fields: [{ key: 'keep', label: folder.name, switch: [t('presets.keep', 'Keep'), t('presets.skip', 'Skip')] }] }], {
          value: { keep: state.pending.includes(folder.dir) }, density: 'tight',
          onChange: (value) => {
            state.pending = value.keep ? [...new Set([...state.pending, folder.dir])] : state.pending.filter((dir) => dir !== folder.dir);
            if (!value.keep && state.root_dir === folder.dir) { state.root_dir = ''; state.root = ''; evaluate.set('folder', ''); }
            paintStatus();
          },
        });
        keep = keepAsk.el;
      }
      row.append(open, kind, keep); listing.append(row);
    }
    if (!listing.children.length) listing.append(el('p', 'setup-fine', 'No folders here.'));
    paintStatus();
  };
  apply.addEventListener('click', async () => {
    apply.disabled = true; status.textContent = 'Keeping…';
    const kept = [];
    for (const dir of [...state.pending]) {
      const folder = folders.find((row) => row.dir === dir) || { dir, name: dir.split('/').pop() || 'folder' };
      const made = await keepFolder(folder);
      if (!made.ok) { status.textContent = made.message || `Could not keep ${folder.name}.`; apply.disabled = false; return; }
      kept.push(dir);
      if (state.root_dir === dir) state.root = made.name;
    }
    state.pending = state.pending.filter((dir) => !kept.includes(dir));
    await load(current);
    // The kept folders appear on the Workspace folders surface beside this one at once.
    environment?.navigateToSurface?.('setup.roots');
  });
  browser.append(place, listing, bar, workspaceFoldersAction(environment, 'Manage workspace folders'));
  host.append(field('Your own codebase', browser, 'select'));
  void load();
}

// A ROW IS ONE SESSION: its name, and its provider and model from the one picker
// (form-steps.js) — the same choices the New Agent form offers, sent as the launch's own
// keys. Default means the Configuration / Campaign defaults every launch takes.
function renderRows(host, state, key, addLabel) {
  const rows = el('div', 'sp-rows');
  const paint = () => {
    rows.replaceChildren();
    state[key].forEach((row, index) => {
      if (typeof row === 'string') row = state[key][index] = { name: row };
      const line = el('div', 'sp-row');
      const name = input(row.name); name.setAttribute('aria-label', `${addLabel} ${index + 1}`);
      name.addEventListener('input', () => { row.name = slug(name.value); });
      const catalog = providerCatalog().rows;
      const providers = catalog.filter((item, at) => catalog.findIndex((other) => other.provider === item.provider) === at);
      const reason = (item) => item.off
        ? t('forms.reason_turned_off', 'turned off')
        : item.listed === false && item.model_list_current
          ? t('forms.reason_not_listed', 'not listed by your {cli} {client_version}', { cli: item.cli_label || item.cli, client_version: item.model_list?.client_version || '' })
          : t('forms.reason_not_on_machine', 'not on this machine');
      const pair = ask([{ group: t('new_agent.model_package', 'Model'), fields: [
        { key: 'provider', label: t('forms.provider', 'Model provider'), blank: t('campaign_view.provider_default', 'Default provider'), options: providers.map((item) => ({ v: item.provider, l: item.provider_label, off: item.operational ? '' : reason(item) })) },
        { key: 'model', label: t('forms.model', 'Model'), blank: t('campaign_view.model_default', 'Default model'), after: 'provider', options: (value) => catalog.filter((item) => item.provider === value.provider).map((item) => ({ v: item.model, l: modelLabel(item), word: item.tier, sub: modelAvailabilityFact(item), off: item.selectable ? '' : (item.operational ? modelAvailabilityFact(item) : reason(item)) })) },
      ] }], { value: { provider: row.provider || '', model: row.model || '' }, density: 'tight', onChange: (value) => { row.provider = value.provider; row.model = value.model; } });
      const remove = el('button', 'sp-remove', '✕'); remove.type = 'button'; remove.title = `Remove ${addLabel}`;
      remove.addEventListener('click', () => { state[key].splice(index, 1); paint(); });
      const lead = el('span', 'sp-lead', row.team_lead ? 'Team Lead' : '');
      if (row.team_lead) remove.hidden = true;
      line.append(lead, name, pair.el, remove); rows.append(line);
    });
    const add = el('button', 'fs-door', `＋ Add ${addLabel}`); add.type = 'button';
    add.addEventListener('click', () => { state[key].push({ name: `${slug(addLabel)}_${state[key].length + 1}` }); paint(); });
    rows.append(add);
  };
  paint(); host.append(rows);
}

function renderTileChoices(host, state) {
  const choices = ask([{ group: '', fields: [{ key: 'tiles', label: t('presets.tile_view', 'Tile view'), options: [{ v: 2, l: t('presets.side_by_side', 'Side by side') }, { v: 4, l: t('presets.two_by_two', 'Two by two') }] }] }], { value: { tiles: state.tiles }, onChange: (value) => { state.tiles = Number(value.tiles); } });
  host.append(choices.el);
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

// THREE WAYS TO SAY WHEN, each asking only for what it needs: Every day wants a time;
// Day of the week wants the day and a time; One time wants the date and a time. The
// schedule string is the house grammar the Cron jobs route already reads.
function renderMorningBriefTiming(host, state) {
  const schedule = String(state.schedule || 'daily 08:00');
  const daily = schedule.match(/^daily (\d{2}:\d{2})$/);
  const weekly = schedule.match(/^weekly (sun|mon|tue|wed|thu|fri|sat) (\d{2}:\d{2})$/);
  const once = schedule.match(/^once (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
  let cadence = weekly ? 'weekly' : once ? 'once' : 'daily';
  const nextDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const timing = el('details', 'sp-timing');
  const summary = el('summary', 'sp-timing-summary');
  const editor = el('div', 'sp-timing-editor');
  let timingValue = { cadence, weekday: weekly?.[1] || 'mon' };
  const weekdayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
  const timingAsk = ask([{ group: '', fields: [
    { key: 'cadence', label: t('presets.repeats', 'Repeats'), options: [{ v: 'daily', l: t('presets.every_day', 'Every day') }, { v: 'weekly', l: t('presets.day_of_week', 'Day of the week') }, { v: 'once', l: t('presets.one_time', 'One time') }] },
    { key: 'weekday', label: t('presets.day', 'Day'), after: 'cadence', options: (value) => value.cadence === 'weekly' ? Object.entries(weekdayNames).map(([v, l]) => ({ v, l })) : [] },
  ] }], { value: timingValue, density: 'tight', onChange: (value) => { timingValue = value; paint(); } });
  const date = input(once?.[1] || nextDay, 'date');
  const time = input(daily?.[1] || weekly?.[2] || once?.[2] || '08:00', 'time');
  const dateField = el('label', 'sp-timing-field'); dateField.append(el('span', '', 'Date'), date);
  const timeField = el('label', 'sp-timing-field'); timeField.append(el('span', '', 'Time'), time);
  const paint = () => {
    cadence = timingValue.cadence;
    dateField.hidden = cadence !== 'once';
    state.schedule = cadence === 'once'
      ? `once ${date.value} ${time.value}`
      : cadence === 'weekly' ? `weekly ${timingValue.weekday} ${time.value}` : `daily ${time.value}`;
    summary.textContent = cadence === 'once'
      ? `Once · ${date.value} at ${time.value}`
      : cadence === 'weekly' ? `Every ${weekdayNames[timingValue.weekday] || 'Monday'} at ${time.value}` : `Every day at ${time.value}`;
  };
  date.addEventListener('input', paint); time.addEventListener('input', paint);
  editor.append(timingAsk.el, dateField, timeField); timing.append(summary, editor); paint();
  host.append(field('When', timing, 'select'));
}

function renderSpecialControls(host, handle, state, runtime, environment, live = null) {
  const roots = rootChoices(runtime, environment);
  if (handle === 'staff_my_codebase') renderCodebaseControls(host, state, environment);
  // WHERE: every workspace folder Ronin keeps, Ronin Lab first and by default, with the
  // door to keep another beside it (Glen, 2026-09-08).
  if (handle === 'develop_new_project') renderRootControls(host, state, roots, 'Where', environment, true, live);
  if (handle === 'agent_editable_doc') renderRootControls(host, state, roots, 'Where', environment, true, live);
  if (handle === 'ronin_team') renderRootControls(host, state, roots, 'Where', environment, true, live);
  if (handle === 'bare_metal') {
    renderRootControls(host, state, roots, 'Where', environment, true, live);
    const agents = el('div'); renderRows(agents, state, 'sessions', 'Session');
    const tiles = el('div'); renderTileChoices(tiles, state);
    host.append(section(t('presets.agents_side_by_side', 'Agents run side by side'), 'select', ...agents.children), section(t('presets.tile_view', 'Tile view'), 'select', ...tiles.children));
  }
  if (handle === 'ronin_team') { const body = el('div'); renderRows(body, state, 'sessions', 'Agent'); host.append(section('Team Lead and agents', 'select', ...body.children)); }
  if (handle === 'develop_new_project') { const body = el('div'); renderRows(body, state, 'workstreams', 'Workstream Agent'); host.append(section('Split the work · each workstream Agent gets its own worktree', '', ...body.children)); }
  if (handle === 'health_and_fitness') { const body = el('div'); renderAskRows(body, state, 'roles', 'role'); host.append(section("Each agent's kick-off message", 'edit', ...body.children)); }
  if (handle === 'personal_assistant') {
    const modes = ask([{ group: '', fields: [{ key: 'assistant_mode', label: t('presets.how_it_runs', 'How it runs'), options: [{ v: 'single', l: t('presets.single_assistant', 'Single assistant') }, { v: 'recruit', l: t('presets.chief_of_staff', 'Chief of Staff') }] }] }], { value: { assistant_mode: state.assistant_mode }, onChange: (value) => { state.assistant_mode = value.assistant_mode; recruit.hidden = state.assistant_mode !== 'recruit'; } });
    const specialists = input(state.specialists); specialists.placeholder = 'financial adviser, research, scheduling…'; specialists.addEventListener('input', () => { state.specialists = specialists.value; });
    const recruit = field('Recruit', specialists);
    recruit.hidden = state.assistant_mode !== 'recruit';
    host.append(modes.el, recruit);
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
  const presetEnvironment = {
    ...environment,
    navigateToSurface: (type, detail = {}) => environment.navigateToSurface?.(type, {
      ...detail,
      origin: { kind: 'preset', workspace, preset: current()?.handle || '' },
    }),
  };
  // The open detail's Where selects, refilled when the catalog of workspace folders changes.
  const liveRoots = new Set();
  environment.onTrackedRoots?.(() => { const choices = rootChoices(freshRuntime(), environment); for (const fill of liveRoots) fill(choices); });

  const available = () => templates.map((row) => ({ ...row, shelf: row.shelf || (row.agents ? 'teams' : 'agents'), handle: row.name }));
  const save = () => saveSlots(environment, slots.map(({ handle, shelf }) => ({ handle, shelf })));
  const current = () => selected >= 0 ? slots[selected] : null;
  const controlState = () => {
    const slot = current();
    if (!controls.has(slot.handle)) controls.set(slot.handle, initialControls(slot.handle));
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
  // The gate reads the runtime the Setup view keeps current when there is one.
  const freshRuntime = () => { const live = environment.runtime?.(); if (live && typeof live === 'object') runtime = live; return runtime; };
  const paintGrid = () => {
    freshRuntime();
    const visible = visibleIndexes();
    stoneSurface.setItems(slots.map((slot, index) => {
      const gate = presetReadiness(slot.handle, runtime);
      return { id: String(index), label: slot.label || slot.handle, glyph: presetGlyph(slot), hidden: !visible.includes(index), className: 'sp-preset-stone', attrs: { 'data-gated': String(!gate.ready), title: gate.ready ? '' : gate.reason } };
    }));
  };

  const paintDetail = () => {
    detail.replaceChildren(); liveRoots.clear(); const slot = current();
    if (!slot) return;
    const gate = presetReadiness(slot.handle, freshRuntime());
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
      warning.hidden = true;
      const result = await environment.launch(buildLaunchPlan(slot, message.value, controlState()));
      launch.setDisabled(false);
      if (!result?.ok) {
        tab?.close?.();
        // FAIL LOUDLY: the server's own sentence, beside Launch, until the next press.
        clearTimeout(warningTimer); warning.textContent = result?.message || 'Launch failed.'; warning.hidden = false;
        return notice.set('failed', result?.message || 'Launch failed.');
      }
      const plan = seatingPlan(slot.handle, result.data || {}, controlState());
      const url = environment.launchUrl?.(result.data || {}, plan, tab) || result.data?.url;
      if (tab && url) { tab.opener = null; tab.location.href = url; }
      else if (url) window.open(url, '_blank', 'noopener');
      const refused = Array.isArray(result.data?.refused) ? result.data.refused : [];
      if (refused.length) {
        // A PARTIAL LAUNCH STILL GOES: the team is open with who was born, and the missing
        // rows are named here with the server's sentence, until the next press.
        clearTimeout(warningTimer);
        warning.textContent = `Launched without ${refused.map((row) => row.name).join(', ')}: ${refused[0].message}`;
        warning.hidden = false;
      }
      notice.set('success', refused.length ? `Launched in a new tab without ${refused.length} of ${refused.length + (result.data?.sessions?.length || 0)}.` : 'Launched in a new tab.');
      environment.onSetupLaunched?.();
    };
    if (!gate.ready) { const mark = el('button', 'sp-warn', '!'); mark.type = 'button'; mark.title = 'Not launchable yet'; mark.addEventListener('click', showHeld); go.append(mark); }
    const launch = createAction({ label: 'Launch', kind: 'primary', action: gate.ready ? launchNow : showHeld });
    launch.el.className = `${launch.el.className || ''} sp-launch`.trim();
    if (!gate.ready) { launch.el.dataset.held = 'true'; launch.el.setAttribute('aria-disabled', 'true'); }
    go.append(launch.el); heading.append(go); detail.append(heading, warning, el('p', 'sp-description', slot.description || ''));
    const panel = el('div', 'sp-choice-panel');
    if (isCorePreset(slot.handle)) { const fixed = el('div', 'sp-controls'); renderSpecialControls(fixed, slot.handle, controlState(), runtime, presetEnvironment, liveRoots); panel.append(fixed); }
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
    // The rows' provider and model choices come from the one picker's catalog read.
    const [supplied] = await Promise.all([environment.presetData?.(), loadProviderCatalog()]);
    if (supplied) {
      templates = Array.isArray(supplied.templates) ? supplied.templates : [];
      runtime = supplied.runtime || runtime;
    }
    else {
      const shared = environment.runtime?.();
      const [teams, agents, setup] = await Promise.all([request('/api/templates/teams'), request('/api/templates/agents'), shared ? null : request('/api/setup/runtime')]);
      templates = [...(teams.ok ? teams.data : []).map((row) => ({ ...row, shelf: 'teams' })), ...(agents.ok ? agents.data : []).map((row) => ({ ...row, shelf: 'agents' }))];
      runtime = shared || (setup?.ok ? setup.data : runtime);
    }
    const remembered = await storedSlots(environment);
    if (Array.isArray(remembered) && remembered.length === HOUSE_PRESETS.length) slots = HOUSE_PRESETS.map((fallback, index) => {
      const saved = remembered[index] || {}; const row = available().find((item) => item.handle === saved.handle && item.shelf === saved.shelf);
      return row || fallback;
    });
    surface.setState('', ''); paintGrid();
  };
  const show = (detail = {}) => {
    enter();
    const index = slots.findIndex((slot) => slot.handle === detail?.preset);
    if (index >= 0) stoneSurface.select(String(index), { focus: true });
  };
  return { el: surface.el, enter, show, slots: () => slots.map((row) => ({ ...row })), workspace };
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
