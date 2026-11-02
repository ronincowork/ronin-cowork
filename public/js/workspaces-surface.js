/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACES WORKBENCH'S SURFACES (owner, 2026-11-02). Tilespace 1 holds the Workspaces
 * (`createWorkspaceStones`), each stone its name only. A pressed one's page (`workspacePage`) is
 * the whole Workspace — title, objective, instructions, Mode and its Locations. Every Workspace is
 * also a selector card, and a stone dragged or a card placed opens it whole in a tilespace
 * (`createWorkspaceRecord`); New Workspace is a dotted card (`createWorkspaceNew`). Locations are folders on this machine, ticked in a
 * browser from the home folder; ticking pins the folder (a Workspace Folder, registered behind
 * the scenes) and adds it. Each ticked folder has a note, and a Git one says how Agents work in
 * it. Clone from GitHub asks the repository and puts it in the folder the browser is open on.
 * A folder link dragged in from Files (`/files/<path under home>`, KAN-146) adds that folder.
 * GitHub CLI (`createFolderGithub`) is the sign-in box github-workspace-setup.js draws for Setup.
 * One read of the pinned folders for the bench (`createRootsReading`, /api/project-roots/detail).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { createPhalanx } from './phalanx.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { subscribe as subscribeTeams, teamsFromState } from './team-controller.js';
import { SURFACE_DRAG } from './workbench.js';
import { WORKBENCH_TYPES } from './workbench-catalog.js';

/** The one read of the pinned folders for a workbench: every surface on it paints from this. */
export function createRootsReading() {
  let roots = [];
  let problem = '';
  const listeners = new Set();
  return {
    roots: () => roots,
    problem: () => problem,
    read: async () => {
      const result = await request('/api/project-roots/detail', { cache: 'no-store' });
      problem = result.ok ? '' : t('roots.read_failed', 'could not read the catalog — {message}', { message: result.message });
      if (result.ok) roots = Array.isArray(result.data?.roots) ? result.data.roots : [];
      for (const listener of listeners) listener();
      return result;
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const status = () => { const line = el('div', 'pr-status'); line.setAttribute('role', 'status'); return line; };
const sayInto = (line) => (message, bad) => { line.replaceChildren(); if (!message) return; const p = el('div', `pr-empty${bad ? ' bad' : ''}`, message); line.append(p); };

/** GitHub CLI: Setup's sign-in box, a workspace of its own. */
export function createFolderGithub(github) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('roots.github_auth_stone', 'GitHub CLI'), className: 'setup-surface workspaces-github' });
  let dispose = null;
  return {
    el: out.el,
    show: () => { dispose?.(); dispose = github.items[0].renderDetail(out.content) || null; },
    destroy: () => { dispose?.(); dispose = null; },
  };
}

/** How Agents work in a Git folder: each in its own worktree, reviewed, or all in one checkout. */
const HOW = {
  desks: { mode: 'reviewed', worktrees: 'enabled', working: 'dev', stable: 'master' },
  folder: { mode: 'direct', worktrees: 'disabled', working: '', stable: 'main' },
};
const howOf = (profile) => (profile?.worktrees === 'enabled' || profile?.mode === 'reviewed' ? 'desks' : 'folder');
const pinName = (dir, taken) => {
  const base = (String(dir).split('/').filter(Boolean).pop() || 'folder').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60) || 'folder';
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

/** The folders on this machine from the home folder: crumbs, then a row per folder with its tick. */
function folderBrowser({ ticked, onTick, onLoad = () => {} }) {
  const shell = el('div', 'wa-browser');
  const crumbs = el('div', 'folder-crumbs');
  const list = el('div', 'folder-list');
  shell.append(crumbs, list);
  let current = '';
  let home = '';
  let folders = [];
  const paint = () => {
    list.replaceChildren();
    for (const folder of folders) {
      const row = el('div', 'folder-row');
      const tick = el('input', 'folder-tick');
      tick.type = 'checkbox';
      tick.checked = ticked(folder.dir);
      tick.setAttribute('aria-label', t('workspaces.tick', 'In this Workspace: {name}', { name: folder.name }));
      tick.addEventListener('change', () => onTick(folder.dir, tick.checked));
      const open = el('button', 'folder-open', folder.name); open.type = 'button';
      open.addEventListener('click', () => void load(folder.dir));
      row.append(tick, open, el('small', 'folder-kind', folder.repository ? t('workspaces.git', 'Git') : ''));
      list.append(row);
    }
    if (!folders.length) list.append(el('span', 'folder-empty', t('folders.empty', 'No matching folders here.')));
  };
  const load = async (dir = current) => {
    const result = await request(`/api/folders?${new URLSearchParams(dir ? { dir } : {})}`, { cache: 'no-store' });
    if (!result.ok) { list.replaceChildren(el('span', 'bad', result.message)); return; }
    current = result.data.dir; home = result.data.home; folders = result.data.folders;
    crumbs.replaceChildren();
    const crumb = (label, at) => { const b = el('button', null, label); b.type = 'button'; b.addEventListener('click', () => void load(at)); crumbs.append(b); };
    crumb(t('folders.home', 'Home'), home);
    let at = home;
    for (const part of current === home ? [] : current.slice(home.length + 1).split('/')) { crumbs.append(document.createTextNode('/')); at += '/' + part; crumb(part, at); }
    paint();
    onLoad();
  };
  void load('');
  return { el: shell, current: () => current, home: () => home, paint, load };
}

/** A Workspace's page in the launch forms' format (owner, 2026-11-02): 1 Name & objective, 2 Agent info
 * (instructions and Mode), 3 Locations, one line per folder, with Add folders and Clone from GitHub; every
 * section folds to its answer. Lines inside one item sit tight; items are spaced as paragraphs.
 * `null` is a new Workspace. Returns the page and its Save (Create) action for the surface head. */
export function workspacePage(w, { reading, campaignId, onSaved = () => {}, onDiscard = () => {} }) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const isNew = !w;
  const draft = w ? JSON.parse(JSON.stringify(w)) : { name: '', title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'configured' };
  const page = el('div', 'ntf-form fs-steps workspace-form');
  // The page's own status line, first under its head: what Save, a tick or Clone answered.
  const line = status();
  line.classList.add('workspace-status');
  const say = sayInto(line);
  const text = (value, onInput, placeholder = '') => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.addEventListener('input', () => onInput(i.value)); return i; };
  const area = (value, onInput) => { const a = el('textarea'); a.rows = 4; a.value = value; a.addEventListener('input', () => onInput(a.value)); return a; };
  const open = { top: true, agents: false, locations: true, add: false, clone: false };
  // EVERY EDIT WAITS FOR SAVE (owner, 2026-11-02): a change lights Save (kaki, what needs you) and
  // the − beside it, which throws the changes away back to the saved Workspace.
  let dirty = false;
  const changed = () => { dirty = true; action.el.dataset.attention = 'true'; discard.setDisabled(false); };
  const settled = () => { dirty = false; delete action.el.dataset.attention; discard.setDisabled(true); };
  const MODES = { configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously') };

  /* ---- 1 · Name & objective ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('workspaces.step_top', 'Name & objective'), onToggle: () => { open.top = !open.top; paint(); } });
  // Title and name are chosen once (owner, 2026-11-02): Teams and their Agents refer to them, so a created
  // Workspace shows both and never changes them.
  const fixed = (label, value) => createField({ label, control: el('span', 'workspace-fixed', value) }).el;
  stepTop.body.append(isNew
    ? createField({ label: t('workspaces.field_title', 'Title'), control: text('', (v) => { draft.title = v; changed(); }) }).el
    : fixed(t('workspaces.field_title', 'Title'), draft.title || draft.name));
  stepTop.body.append(isNew
    ? createField({ label: t('workspaces.name', 'Name'), control: text('', (v) => { draft.name = v.trim().toLowerCase(); changed(); }, t('new_team.name_placeholder', 'lowercase, digits, - _')) }).el
    : fixed(t('workspaces.name', 'Name'), draft.name));
  stepTop.body.append(createField({ label: t('workspaces.objective', 'Objective'), control: area(draft.objective, (v) => { draft.objective = v; changed(); }) }).el);

  /* ---- 2 · Agent info: what every Agent in it is told, and the Mode they launch in ---- */
  const stepAgents = createStep({ n: 2, key: 'agents', title: t('workspaces.agent_info', 'Agent info'), onToggle: () => { open.agents = !open.agents; paint(); } });
  stepAgents.body.append(createField({ label: t('workspaces.instructions', 'Instructions'), control: area(draft.instructions, (v) => { draft.instructions = v; changed(); }) }).el);

  const mode = ask([{ fields: [
    { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
      { v: 'configured', l: MODES.configured, sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      { v: 'live_dangerously', l: MODES.live_dangerously, sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
    ] },
  ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; changed(); paint(); } });
  stepAgents.body.append(mode.el);

  /* ---- 3 · Locations: one line per folder, its note under it; Add folders and Clone from GitHub as buttons ---- */
  const stepLocations = createStep({ n: 3, key: 'locations', title: t('workspaces.locations', 'Locations'), onToggle: () => { open.locations = !open.locations; paint(); } });
  const picked = new Map([...draft.repos, ...draft.folders].map((row) => [row.name, row.note]));
  const rootByName = (name) => reading.roots().find((root) => root.name === name);
  const rootByDir = (dir) => reading.roots().find((root) => root.dir === dir);
  const short = (dir) => (browser.home() && (dir === browser.home() || dir.startsWith(`${browser.home()}/`)) ? `~${dir.slice(browser.home().length)}` : dir);
  const rows = el('div', 'workspace-locations');
  const tools = el('div', 'workspace-location-tools');
  const addButton = el('button', 'wk-btn', t('workspaces.add_folders', '+ Add folders')); addButton.type = 'button';
  const cloneButton = el('button', 'wk-btn', t('workspaces.clone', '+ Clone from GitHub')); cloneButton.type = 'button';
  addButton.addEventListener('click', () => { open.add = !open.add; paint(); });
  cloneButton.addEventListener('click', () => { open.clone = !open.clone; open.add = open.add || open.clone; paint(); });
  tools.append(addButton, cloneButton);
  const panel = el('div', 'workspace-browser');
  stepLocations.body.append(rows, tools, panel);

  const pending = new Map(); // a Git folder's worktree switch, written on Save
  const profileOf = (key, root) => ({ ...HOW[key], stable: key === 'folder' ? (root.repo_profile?.stable || 'main') : HOW.desks.stable });
  const save = async () => {
    for (const [name, key] of pending) {
      const root = rootByName(name);
      if (!root || howOf(root.repo_profile) === key) continue;
      const answer = await request(`/api/project-roots/${encodeURIComponent(name)}/repo-profile`, { method: 'PUT', json: { profile: profileOf(key, root) } });
      if (!answer.ok) { say(answer.message, true); return false; }
    }
    if (pending.size) { pending.clear(); await reading.read(); }
    const git = (name) => !!rootByName(name)?.facts?.repo;
    const row = (name) => ({ name, note: picked.get(name) || '' });
    draft.repos = [...picked.keys()].filter(git).map(row);
    draft.folders = [...picked.keys()].filter((name) => !git(name)).map(row);
    const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}`, { method: 'PUT', json: { ...draft, campaign_id: campaignId() || undefined } });
    if (!answer.ok) { say(answer.message, true); return false; }
    say(t('workspaces.saved', 'Saved {name}.', { name: answer.data.workspace.title || answer.data.workspace.name }));
    settled();
    return answer.data.workspace;
  };
  // How Agents work in a Git folder: two small switches, the chosen one filled.
  const howSwitch = (name, root) => {
    const box = el('div', 'workspace-how');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('workspaces.how', 'How Agents work in this repository'));
    const now = pending.get(name) ?? howOf(root.repo_profile);
    for (const [key, label, sub] of [
      ['desks', t('workspaces.how_worktrees', 'Worktrees'), t('workspaces.how_worktrees_sub', 'Each Agent opens its own worktree and hands in; the lead reviews and promotes.')],
      ['folder', t('workspaces.how_checkout', 'Shared checkout'), t('workspaces.how_checkout_sub', 'Every Agent works in this one checkout; no hand-ins, no review.')],
    ]) {
      const b = el('button', null, label); b.type = 'button'; b.title = sub;
      b.setAttribute('aria-pressed', String(now === key));
      b.addEventListener('click', () => {
        if (now === key) return;
        pending.set(name, key); changed(); paint();
      });
      box.append(b);
    }
    return box;
  };
  const paintRows = () => {
    rows.replaceChildren();
    if (!picked.size) rows.append(el('p', 'fs-step-help', t('workspaces.locations_none', 'No folders yet. Add folders, or drag one in from Files.')));
    for (const [name, note] of picked) {
      const root = rootByName(name);
      const git = !!root?.facts?.repo;
      const row = el('div', 'workspace-location');
      const line = el('div', 'workspace-location-line');
      const remove = el('button', 'workspace-location-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', t('workspaces.remove_named', 'Remove {name}', { name }));
      remove.addEventListener('click', () => { picked.delete(name); changed(); paint(); browser.paint(); });
      line.append(el('small', 'folder-kind', git ? t('workspaces.git', 'Git') : t('workspaces.dir', 'Dir')), el('b', null, root?.title || name), el('code', null, short(root?.dir || '')));
      if (git) line.append(howSwitch(name, root));
      line.append(remove);
      const noteInput = text(note, (v) => { picked.set(name, v); changed(); }, t('workspaces.add_note', 'Add a note…'));
      noteInput.className = 'workspace-location-note';
      row.append(line, noteInput);
      rows.append(row);
    }
  };
  // Tick a folder: pin it when it is not pinned yet, then hold it here.
  const attach = async (dir) => {
    let root = rootByDir(dir);
    if (!root) {
      const name = pinName(dir, new Set(reading.roots().map((entry) => entry.name)));
      const made = await request('/api/project-roots', { method: 'POST', json: { name, dir, campaign_id: campaignId() || undefined } });
      if (!made.ok) { say(made.message, true); browser.paint(); return; }
      await reading.read();
      root = rootByDir(dir);
    }
    if (!root) return;
    if (!picked.has(root.name)) { picked.set(root.name, ''); changed(); }
    paint(); browser.paint();
  };
  const detach = (dir) => {
    const root = rootByDir(dir);
    if (root && picked.delete(root.name)) changed();
    paint(); browser.paint();
  };
  const browser = folderBrowser({
    ticked: (dir) => { const root = rootByDir(dir); return !!root && picked.has(root.name); },
    onTick: (dir, on) => void (on ? attach(dir) : detach(dir)),
    onLoad: () => paint(),
  });
  const done = el('button', 'wk-btn', t('workspaces.done', 'Done')); done.type = 'button';
  done.addEventListener('click', () => { open.add = false; open.clone = false; paint(); });
  const panelHead = el('div', 'workspace-browser-head');
  panelHead.append(el('span', 'fs-step-help', t('workspaces.add_help', 'Open folders; tick the ones this Workspace uses.')), done);
  // Clone from GitHub: one line, into the folder the browser is open on.
  const repository = text('', () => {}, t('workspace_add.repository_placeholder', 'owner/repo or a github.com link'));
  const cloneWhere = el('span', 'fs-step-help');
  const clone = el('button', 'wk-btn', t('workspaces.clone_here', 'Clone')); clone.type = 'button';
  clone.addEventListener('click', async () => {
    if (!repository.value.trim()) return;
    clone.disabled = true;
    say(t('workspaces.cloning', 'Cloning into {dir}…', { dir: short(browser.current()) }));
    const answer = await request('/api/setup/github/clone', { method: 'POST', json: { repository: repository.value.trim(), parent: browser.current() } });
    clone.disabled = false;
    if (!answer.ok) { say(answer.message, true); return; }
    repository.value = '';
    await reading.read();
    await browser.load();
    await attach(answer.data.workspace.dir);
  });
  const cloneLine = el('div', 'workspace-clone');
  cloneLine.append(repository, cloneWhere, clone);
  panel.append(panelHead, browser.el, cloneLine);
  // A folder dragged in from Files: /files/<path under home> is that folder.
  page.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('text/uri-list')) event.preventDefault(); });
  page.addEventListener('drop', (event) => {
    const link = event.dataTransfer?.getData('text/uri-list') || '';
    const at = /\/files\/(.*?)\/?$/.exec(new URL(link.split('\n')[0] || '/', location.href).pathname);
    if (!at || !browser.home()) return;
    event.preventDefault();
    void attach([browser.home(), ...decodeURIComponent(at[1]).split('/').filter(Boolean)].join('/'));
  });

  // Save answers at the button too: Saving…, then Saved for a moment, or back to Save with the error above.
  const label = isNew ? t('workspaces.create', 'Create') : t('workspaces.save', 'Save');
  const action = createAction({ label, launch: true, size: 'compact', action: async () => {
    const word = action.el.querySelector('span') || action.el;
    action.setDisabled(true);
    word.textContent = t('workspaces.saving', 'Saving…');
    const saved = await save();
    action.setDisabled(false);
    word.textContent = saved ? t('workspaces.saved_short', 'Saved') : label;
    if (saved) { setTimeout(() => { word.textContent = label; }, 2000); onSaved(saved); }
  } });
  const discard = createAction({ label: '−', title: t('workspaces.discard', 'Discard changes'), size: 'compact', disabled: true, action: () => { if (dirty) onDiscard(); } });

  function paint() {
    const first = draft.instructions.trim().split('\n')[0];
    stepAgents.setCollapsed(!open.agents, [MODES[draft.launch_mode], first].filter(Boolean).join(' · '), true);
    stepTop.setCollapsed(!open.top, draft.title || draft.name || t('workspaces.none_yet', 'None'), true);
    stepLocations.setCollapsed(!open.locations, picked.size === 1 ? t('workspaces.one_folder', '1 folder') : t('workspaces.folders_n', '{n} folders', { n: picked.size }), true);
    panel.hidden = !open.add;
    cloneLine.hidden = !open.clone;
    addButton.setAttribute('aria-pressed', String(open.add));
    cloneButton.setAttribute('aria-pressed', String(open.clone));
    cloneWhere.textContent = t('workspaces.clone_into', 'into {dir}', { dir: short(browser.current()) || '~' });
    paintRows();
  }
  page.append(line, stepTop.el, stepAgents.el, stepLocations.el);
  paint();
  if (!reading.roots().length) void reading.read().then(() => { paint(); browser.paint(); });
  return { el: page, action, discard };
}

/** The Workspaces of the Campaign a bench looks at: one read, every surface on the bench hears it. */
export function createWorkspacesRead(campaignId) {
  let workspaces = [];
  const listeners = new Set();
  return {
    list: () => workspaces,
    read: async () => {
      const query = campaignId() ? `?campaign_id=${encodeURIComponent(campaignId())}` : '';
      const answer = await request(`/api/workspaces${query}`, { cache: 'no-store' });
      if (answer.ok) workspaces = answer.data?.workspaces || [];
      for (const listener of listeners) listener(answer);
      return answer;
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

/** The selector's cards: one per Workspace, its name. */
export const workspaceOffers = (workspacesRead) => workspacesRead.list().map((w) => ({ key: w.name, label: w.title || w.name }));

const dragWorkspace = (stone) => ({
  ...stone,
  draggable: true,
  events: { dragstart: (event) => {
    event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type: WORKBENCH_TYPES.workspaceRecord, detail: { key: stone.id } }));
    event.dataTransfer.setData('text/plain', stone.label);
    event.dataTransfer.effectAllowed = 'copy';
  } },
});

/** The stones of Workspaces, each its name only (owner, 2026-11-02), under a Show question as the Teams
 * stones have: Teams (those launched in it) and Epics (each Team's epic, the pushed rosters' `board`)
 * hang under each stone as branch rows when picked; a pressed stone or row opens the Workspace's page beside the rail; a stone
 * dragged into a tilespace opens that Workspace there whole. */
export function createWorkspaceStones({ reading, workspacesRead, campaignId, workbench }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.title', 'Workspaces'), className: 'setup-surface workspaces-records' });
  const messages = status();
  const say = sayInto(messages);
  const stones = createPhalanx({
    className: 'workspace-record-stones',
    branches: 'column',
    renderDetail: (item, host) => {
      host.scrollTop = 0;
      const w = workspacesRead.list().find((row) => row.name === (item.workspace || item.id));
      if (!w) return;
      const page = workspacePage(w, { reading, campaignId, onSaved: () => void workspacesRead.read(), onDiscard: () => stones.refreshDetail() });
      const head = el('div', 'workspace-page-head');
      const actions = el('div', 'workspace-page-actions');
      actions.append(page.action.el, page.discard.el);
      head.append(el('span', 'wk-surface-header-title', w.title || w.name), actions);
      host.append(head, page.el);
    },
  });
  // SHOW (owner, 2026-11-02; the Teams stones' own question, team-roster-surface.js): many-of, blank to
  // start, says what hangs under each stone as branch rows, a cell per picked topic in this order.
  const SHOW = ['teams', 'epics'];
  let show = [];
  const filter = ask([{ fields: [
    { key: 'show', label: t('teams_surface.show', 'Show'), many: true, options: [
      { v: 'teams', l: t('campaign.coworks', 'Teams') },
      { v: 'epics', l: t('workspaces.epics', 'Epics') },
    ] },
  ] }], { value: { show }, density: 'tight', onChange: ({ show: next }) => { show = (next || []).map(String); paint(); } });
  stones.mount(out.content, { before: [messages, filter.el] });
  const paint = (answer) => {
    if (answer && !answer.ok) { say(answer.message, true); return; }
    if (answer) say(workspacesRead.list().length ? '' : t('workspaces.none', 'No Workspaces yet. Place New Workspace from the selector.'));
    const teams = teamsFromState().filter((team) => team.durable);
    const next = workspacesRead.list().map((w) => {
      const own = teams.filter((team) => team.workspace === w.name);
      const epics = [...new Map(own.filter((team) => team.board?.title).map((team) => [team.board.title, team.board])).values()];
      const cell = {
        teams: () => own.map((team, n) => ({ id: `${w.name}:team:${n}`, label: team.title || team.name, state: t('workspaces.team', 'Team'), workspace: w.name })),
        epics: () => epics.map((epic, n) => ({ id: `${w.name}:epic:${n}`, label: epic.title, state: epic.status || t('workspaces.epic', 'Epic'), workspace: w.name })),
      };
      const under = SHOW.filter((kind) => show.includes(kind)).map((kind) => cell[kind]());
      return dragWorkspace({ id: w.name, label: w.title || w.name, ...(show.length ? { under } : {}) });
    });
    // A Teams push that moves nothing a stone shows leaves the stones and an open page alone.
    const signature = JSON.stringify(next.map(({ id, label, under }) => [id, label, under]));
    if (signature !== shown) { shown = signature; stones.setItems(next); }
    workbench?.refreshSelector?.();
  };
  let shown = null;
  const stop = workspacesRead.subscribe(paint);
  const stopTeams = subscribeTeams(() => paint());
  return {
    el: out.el,
    show: () => { void workspacesRead.read(); },
    destroy: () => { stop(); stopTeams?.(); filter.destroy(); stones.destroy(); },
  };
}

/** One Workspace whole in a tilespace: its page, no rail. */
export function createWorkspaceRecord(key, { reading, workspacesRead, campaignId }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface workspaces-record' });
  const paint = () => {
    const w = workspacesRead.list().find((row) => row.name === key);
    out.content.replaceChildren();
    if (!w) { setSurfaceState(out.el, 'empty', t('workspaces.gone', 'This Workspace is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = w.title || w.name;
    const page = workspacePage(w, { reading, campaignId, onSaved: () => void workspacesRead.read(), onDiscard: () => paint() });
    out.header.actions.replaceChildren(page.action.el, page.discard.el);
    out.content.append(page.el);
  };
  return {
    el: out.el,
    show: () => { if (workspacesRead.list().length) paint(); else void workspacesRead.read().then(paint); },
    destroy: () => {},
  };
}

/** New Workspace: the empty page in a tilespace; once created, that tilespace holds the new Workspace. */
export function createWorkspaceNew({ reading, workspacesRead, campaignId, place }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.new', 'New Workspace'), className: 'setup-surface workspaces-new' });
  const paint = () => {
    const page = workspacePage(null, { reading, campaignId, onSaved: async (saved) => {
      await workspacesRead.read();
      place(saved.name);
    }, onDiscard: () => paint() });
    out.header.actions.replaceChildren(page.action.el, page.discard.el);
    out.content.replaceChildren(page.el);
  };
  return { el: out.el, show: paint, destroy: () => {} };
}
