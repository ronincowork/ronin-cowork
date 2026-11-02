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
function folderBrowser({ ticked, onTick }) {
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
      if (folder.repository) open.append(el('small', 'folder-kind', t('workspaces.git', 'Git')));
      row.append(tick, open);
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
  };
  void load('');
  return { el: shell, current: () => current, home: () => home, paint, load };
}

/** A Workspace's page in the launch forms' format (owner, 2026-11-02): 1 Name & objective, 2 Instructions
 * and 3 Mode folded to their answer, 4 Locations with Add folders and Clone from GitHub folded under it.
 * `null` is a new Workspace. Returns the page and its Save (Create) action for the surface head. */
export function workspacePage(w, { reading, campaignId, say, onSaved = () => {} }) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const isNew = !w;
  const draft = w ? JSON.parse(JSON.stringify(w)) : { name: '', title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'configured' };
  const page = el('div', 'ntf-form fs-steps workspace-form');
  const text = (value, onInput, placeholder = '') => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.addEventListener('input', () => onInput(i.value)); return i; };
  const area = (value, onInput) => { const a = el('textarea'); a.rows = 4; a.value = value; a.addEventListener('input', () => onInput(a.value)); return a; };
  const open = { instructions: false, mode: false, add: false, clone: false };
  const MODES = { configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously') };

  /* ---- 1 · Name & objective ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('workspaces.step_top', 'Name & objective') });
  stepTop.body.append(createField({ label: t('workspaces.field_title', 'Title'), control: text(draft.title, (v) => { draft.title = v; }) }).el);
  if (isNew) stepTop.body.append(createField({ label: t('workspaces.name', 'Name'), control: text('', (v) => { draft.name = v.trim().toLowerCase(); }, t('new_team.name_placeholder', 'lowercase, digits, - _')) }).el);
  stepTop.body.append(createField({ label: t('workspaces.objective', 'Objective'), control: area(draft.objective, (v) => { draft.objective = v; }) }).el);

  /* ---- 2 · Instructions, folded to its first line ---- */
  const stepInstructions = createStep({ n: 2, key: 'instructions', title: t('workspaces.instructions', 'Instructions'), onToggle: () => { open.instructions = !open.instructions; paint(); } });
  stepInstructions.body.append(area(draft.instructions, (v) => { draft.instructions = v; }));

  /* ---- 3 · Mode, folded to its answer ---- */
  const stepMode = createStep({ n: 3, key: 'mode', title: t('launch_mode.mode', 'Mode'), onToggle: () => { open.mode = !open.mode; paint(); } });
  const mode = ask([{ fields: [
    { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
      { v: 'configured', l: MODES.configured, sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      { v: 'live_dangerously', l: MODES.live_dangerously, sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
    ] },
  ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; paint(); } });
  stepMode.body.append(mode.el);

  /* ---- 4 · Locations: a row per folder; Add folders and Clone from GitHub folded under them ---- */
  const stepLocations = createStep({ n: 4, key: 'locations', title: t('workspaces.locations', 'Locations') });
  const picked = new Map([...draft.repos, ...draft.folders].map((row) => [row.name, row.note]));
  const rootByName = (name) => reading.roots().find((root) => root.name === name);
  const rootByDir = (dir) => reading.roots().find((root) => root.dir === dir);
  const rows = el('div', 'workspace-locations');
  const stepAdd = createStep({ key: 'add', title: t('workspaces.add_folders', 'Add folders'), onToggle: () => { open.add = !open.add; paint(); } });
  const stepClone = createStep({ key: 'clone', title: t('workspaces.clone', 'Clone from GitHub'), onToggle: () => { open.clone = !open.clone; paint(); } });
  stepLocations.body.append(rows, stepAdd.el, stepClone.el);

  const save = async () => {
    const git = (name) => !!rootByName(name)?.facts?.repo;
    const row = (name) => ({ name, note: picked.get(name) || '' });
    draft.repos = [...picked.keys()].filter(git).map(row);
    draft.folders = [...picked.keys()].filter((name) => !git(name)).map(row);
    const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}`, { method: 'PUT', json: { ...draft, campaign_id: campaignId() || undefined } });
    if (!answer.ok) { say(answer.message, true); return false; }
    say(t('workspaces.saved', 'Saved {name}.', { name: answer.data.workspace.title || answer.data.workspace.name }));
    return answer.data.workspace;
  };
  const keep = () => { if (!isNew) void save(); };
  const paintRows = () => {
    rows.replaceChildren();
    if (!picked.size) rows.append(el('p', 'fs-step-help', t('workspaces.locations_none', 'No folders yet. Add folders below, or drag one in from Files.')));
    for (const [name, note] of picked) {
      const root = rootByName(name);
      const row = el('div', 'workspace-location');
      const head = el('div', 'workspace-location-head');
      const remove = el('button', 'workspace-location-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', t('workspaces.remove_named', 'Remove {name}', { name }));
      remove.addEventListener('click', () => { picked.delete(name); paint(); browser.paint(); keep(); });
      head.append(el('b', null, root?.title || name), el('small', 'folder-kind', root?.facts?.repo ? t('workspaces.git', 'Git') : t('workspaces.folder', 'Folder')), el('code', null, root?.dir || ''), remove);
      const noteInput = text(note, (v) => { picked.set(name, v); }, t('workspaces.note', 'Note'));
      noteInput.addEventListener('change', keep);
      row.append(head, noteInput);
      if (root?.facts?.repo) {
        const how = ask([{ fields: [{ key: 'how', label: t('workspace_add.agents', 'How Agents work here'), options: [
          { v: 'desks', l: t('workspace_add.how_desks', 'Own desks'), sub: t('workspace_add.how_desks_sub', 'Each Agent in its own desk; work is reviewed before it lands: hand-ins on dev, the lead promotes to master.') },
          { v: 'folder', l: t('workspace_add.how_folder', 'One folder'), sub: t('workspace_add.how_folder_sub', 'Everyone works in this one folder on its branch; no review.') },
        ] }] }], { value: { how: howOf(root.repo_profile) }, density: 'tight', onChange: async (value) => {
          const profile = { ...HOW[value.how], stable: value.how === 'folder' ? (root.repo_profile?.stable || 'main') : HOW.desks.stable };
          const answer = await request(`/api/project-roots/${encodeURIComponent(name)}/repo-profile`, { method: 'PUT', json: { profile } });
          if (!answer.ok) say(answer.message, true); else void reading.read();
        } });
        row.append(how.el);
      }
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
    if (!picked.has(root.name)) picked.set(root.name, '');
    paint(); browser.paint(); keep();
  };
  const detach = (dir) => {
    const root = rootByDir(dir);
    if (root) picked.delete(root.name);
    paint(); browser.paint(); keep();
  };
  const browser = folderBrowser({
    ticked: (dir) => { const root = rootByDir(dir); return !!root && picked.has(root.name); },
    onTick: (dir, on) => void (on ? attach(dir) : detach(dir)),
  });
  stepAdd.body.append(el('p', 'fs-step-help', t('workspaces.add_help', 'Open folders and tick the ones this Workspace uses.')), browser.el);
  // Clone from GitHub: the repository, into the folder the browser is open on.
  const repository = text('', () => {}, t('workspace_add.repository_placeholder', 'owner/repo or a github.com link'));
  const clone = el('button', 'wk-btn', t('workspaces.clone_here', 'Clone')); clone.type = 'button';
  const cloneWhere = el('p', 'fs-step-help');
  clone.addEventListener('click', async () => {
    if (!repository.value.trim()) return;
    clone.disabled = true;
    say(t('workspaces.cloning', 'Cloning into {dir}…', { dir: browser.current() }));
    const answer = await request('/api/setup/github/clone', { method: 'POST', json: { repository: repository.value.trim(), parent: browser.current() } });
    clone.disabled = false;
    if (!answer.ok) { say(answer.message, true); return; }
    repository.value = '';
    await reading.read();
    await browser.load();
    await attach(answer.data.workspace.dir);
  });
  stepClone.body.append(createField({ label: t('workspace_add.repository_label', 'GitHub repository'), control: repository }).el, cloneWhere, clone);
  // A folder dragged in from Files: /files/<path under home> is that folder.
  page.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('text/uri-list')) event.preventDefault(); });
  page.addEventListener('drop', (event) => {
    const link = event.dataTransfer?.getData('text/uri-list') || '';
    const at = /\/files\/(.*?)\/?$/.exec(new URL(link.split('\n')[0] || '/', location.href).pathname);
    if (!at || !browser.home()) return;
    event.preventDefault();
    void attach([browser.home(), ...decodeURIComponent(at[1]).split('/').filter(Boolean)].join('/'));
  });

  const action = createAction({ label: isNew ? t('workspaces.create', 'Create') : t('workspaces.save', 'Save'), launch: true, size: 'compact', action: async () => {
    action.setDisabled(true);
    const saved = await save();
    action.setDisabled(false);
    if (saved) onSaved(saved);
  } });

  function paint() {
    const first = draft.instructions.trim().split('\n')[0];
    stepInstructions.setCollapsed(!open.instructions, first || t('workspaces.none_yet', 'None'), true);
    stepMode.setCollapsed(!open.mode, MODES[draft.launch_mode], true);
    stepLocations.setCollapsed(false, '', false);
    stepAdd.setCollapsed(!open.add, '', true);
    stepClone.setCollapsed(!open.clone, '', true);
    cloneWhere.textContent = t('workspaces.clone_where', 'Cloned into {dir}: open another folder under Add folders to change it.', { dir: browser.current() || '~' });
    paintRows();
  }
  page.append(stepTop.el, stepInstructions.el, stepMode.el, stepLocations.el);
  paint();
  if (!reading.roots().length) void reading.read().then(() => { paint(); browser.paint(); });
  return { el: page, action };
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

/** The stones of Workspaces, each its name only (owner, 2026-11-02); a pressed one's page beside the
 * rail; a stone dragged into a tilespace opens that Workspace there whole. */
export function createWorkspaceStones({ reading, workspacesRead, campaignId, workbench }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.title', 'Workspaces'), className: 'setup-surface workspaces-records' });
  const messages = status();
  const say = sayInto(messages);
  const stones = createPhalanx({
    className: 'workspace-record-stones',
    renderDetail: (item, host) => {
      host.scrollTop = 0;
      const w = workspacesRead.list().find((row) => row.name === item.id);
      if (!w) return;
      const page = workspacePage(w, { reading, campaignId, say, onSaved: () => void workspacesRead.read() });
      const head = el('div', 'workspace-page-head');
      head.append(el('span', 'wk-surface-header-title', w.title || w.name), page.action.el);
      host.append(head, page.el);
    },
  });
  stones.mount(out.content, { before: [messages] });
  const paint = (answer) => {
    if (answer && !answer.ok) { say(answer.message, true); return; }
    if (!workspacesRead.list().length) say(t('workspaces.none', 'No Workspaces yet. Place New Workspace from the selector.'));
    stones.setItems(workspacesRead.list().map((w) => dragWorkspace({ id: w.name, label: w.title || w.name })));
    workbench?.refreshSelector?.();
  };
  const stop = workspacesRead.subscribe(paint);
  return {
    el: out.el,
    show: () => { void workspacesRead.read(); },
    destroy: () => { stop(); stones.destroy(); },
  };
}

/** One Workspace whole in a tilespace: its page, no rail. */
export function createWorkspaceRecord(key, { reading, workspacesRead, campaignId }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface workspaces-record' });
  const messages = status();
  const say = sayInto(messages);
  const paint = () => {
    const w = workspacesRead.list().find((row) => row.name === key);
    out.content.replaceChildren(messages);
    if (!w) { setSurfaceState(out.el, 'empty', t('workspaces.gone', 'This Workspace is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = w.title || w.name;
    const page = workspacePage(w, { reading, campaignId, say, onSaved: () => void workspacesRead.read() });
    out.header.actions.replaceChildren(page.action.el);
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
  const messages = status();
  const say = sayInto(messages);
  const paint = () => {
    const page = workspacePage(null, { reading, campaignId, say, onSaved: async (saved) => {
      await workspacesRead.read();
      place(saved.name);
    } });
    out.header.actions.replaceChildren(page.action.el);
    out.content.replaceChildren(messages, page.el);
  };
  return { el: out.el, show: paint, destroy: () => {} };
}
