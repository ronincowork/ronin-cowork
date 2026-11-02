/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACES WORKBENCH'S SURFACES (owner, 2026-11-02). Workspace 1 holds the Workspaces
 * (`createWorkspaceStones`): a pressed one's page is the whole Workspace — title, objective,
 * instructions, Mode and its Locations. Locations are folders on this machine, ticked in a
 * browser from the home folder; ticking pins the folder (a Workspace Folder, registered behind
 * the scenes) and adds it. Each ticked folder has a note, and a Git one says how Agents work in
 * it. Clone from GitHub asks the repository and puts it in the folder the browser is open on.
 * A folder link dragged in from Files (`/files/<path under home>`, KAN-146) adds that folder.
 * GitHub CLI (`createFolderGithub`) is the sign-in box github-workspace-setup.js draws for Setup.
 * One read of the pinned folders for the bench (`createRootsReading`, /api/project-roots/detail).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { el } from './form-steps.js';
import { createPhalanx } from './phalanx.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';

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

/** WS1: the stones of Workspaces (owner, 2026-11-01: a Workspace is a project, its brief). A stone
 * pressed opens its page beside the rail; "New Workspace" opens the same page empty. */
export function createWorkspaceStones({ reading, campaignId }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.title', 'Workspaces'), className: 'setup-surface workspaces-records' });
  const messages = status();
  const say = sayInto(messages);
  let workspaces = [];
  const NEW_ID = '__new_workspace';
  const query = () => (campaignId() ? `?campaign_id=${encodeURIComponent(campaignId())}` : '');
  const load = async () => {
    const answer = await request(`/api/workspaces${query()}`, { cache: 'no-store' });
    if (!answer.ok) { say(answer.message, true); return; }
    workspaces = answer.data?.workspaces || [];
    stones.setItems([
      ...workspaces.map((w) => ({ id: w.name, label: w.title || w.name, state: w.objective || t('workspaces.no_objective', 'no objective yet') })),
      { id: NEW_ID, label: t('workspaces.new', 'New Workspace'), state: t('workspaces.new_state', 'a project for your Teams'), className: 'add' },
    ]);
  };
  const editor = (w, host) => {
    const isNew = !w;
    const draft = w ? JSON.parse(JSON.stringify(w)) : { name: '', title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'configured' };
    const page = el('div', 'workspace-page');
    const field = (label, control) => { const row = el('label', 'workspace-field'); row.append(el('span', 'workspace-field-label', label), control); return row; };
    const input = (value, onInput, placeholder = '') => { const i = el('input', 'wk-field-control'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.addEventListener('input', () => onInput(i.value)); return i; };
    const area = (value, onInput) => { const a = el('textarea', 'wk-field-control'); a.rows = 4; a.value = value; a.addEventListener('input', () => onInput(a.value)); return a; };
    if (isNew) page.append(field(t('workspaces.name', 'Name'), input('', (v) => { draft.name = v.trim().toLowerCase(); }, t('new_team.name_placeholder', 'lowercase, digits, - _'))));
    page.append(
      field(t('workspaces.field_title', 'Title'), input(draft.title, (v) => { draft.title = v; })),
      field(t('workspaces.objective', 'Objective'), area(draft.objective, (v) => { draft.objective = v; })),
      field(t('workspaces.instructions', 'Instructions'), area(draft.instructions, (v) => { draft.instructions = v; })),
    );
    const mode = ask([{ fields: [
      { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
        { v: 'configured', l: t('launch_mode.configured', 'Native'), sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
        { v: 'live_dangerously', l: t('launch_mode.live', 'Dangerously'), sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
      ] },
    ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; } });
    page.append(mode.el);

    // LOCATIONS: the pinned folders this Workspace holds, by name, each with its note.
    const picked = new Map([...draft.repos, ...draft.folders].map((row) => [row.name, row.note]));
    const rootByName = (name) => reading.roots().find((root) => root.name === name);
    const rootByDir = (dir) => reading.roots().find((root) => root.dir === dir);
    const locations = el('div', 'workspace-locations');
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
    const paintLocations = () => {
      locations.replaceChildren(el('span', 'workspace-field-label', t('workspaces.locations', 'Locations')));
      if (!picked.size) locations.append(el('p', 'fs-step-help', t('workspaces.locations_none', 'Tick folders below, or drag one in from Files.')));
      for (const [name, note] of picked) {
        const root = rootByName(name);
        const row = el('div', 'workspace-location');
        const head = el('div', 'workspace-location-head');
        head.append(el('b', null, root?.title || name), el('small', 'folder-kind', root?.facts?.repo ? t('workspaces.git', 'Git') : t('workspaces.folder', 'Folder')), el('code', null, root?.dir || ''));
        const remove = el('button', 'wk-btn', t('workspaces.remove', 'Remove')); remove.type = 'button';
        remove.addEventListener('click', () => { picked.delete(name); paintLocations(); browser.paint(); keep(); });
        head.append(remove);
        const noteInput = input(note, (v) => { picked.set(name, v); }, t('workspaces.note', 'Note'));
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
        locations.append(row);
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
      paintLocations(); browser.paint(); keep();
    };
    const detach = (dir) => {
      const root = rootByDir(dir);
      if (root) picked.delete(root.name);
      paintLocations(); browser.paint(); keep();
    };
    const browser = folderBrowser({
      ticked: (dir) => { const root = rootByDir(dir); return !!root && picked.has(root.name); },
      onTick: (dir, on) => void (on ? attach(dir) : detach(dir)),
    });
    // Clone from GitHub: the repository, into the folder the browser is open on.
    const repository = input('', () => {}, t('workspace_add.repository_placeholder', 'owner/repo or a github.com link'));
    const clone = el('button', 'wk-btn', t('workspaces.clone_here', 'Clone here')); clone.type = 'button';
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
    const cloneRow = el('div', 'workspace-clone');
    cloneRow.append(el('span', 'workspace-field-label', t('workspaces.clone', 'Clone from GitHub')), repository, clone);
    // A folder dragged in from Files: /files/<path under home> is that folder.
    page.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('text/uri-list')) event.preventDefault(); });
    page.addEventListener('drop', (event) => {
      const link = event.dataTransfer?.getData('text/uri-list') || '';
      const at = /\/files\/(.*?)\/?$/.exec(new URL(link.split('\n')[0] || '/', location.href).pathname);
      if (!at || !browser.home()) return;
      event.preventDefault();
      void attach([browser.home(), ...decodeURIComponent(at[1]).split('/').filter(Boolean)].join('/'));
    });
    const create = el('button', 'wk-btn primary', isNew ? t('workspaces.create', 'Create Workspace') : t('workspaces.save', 'Save')); create.type = 'button';
    create.addEventListener('click', async () => {
      create.disabled = true;
      const saved = await save();
      create.disabled = false;
      if (saved) { await load(); stones.select(saved.name); }
    });
    page.append(locations, browser.el, cloneRow, create);
    host.append(page);
    paintLocations();
    if (!reading.roots().length) void reading.read().then(() => { paintLocations(); browser.paint(); });
  };
  const stones = createPhalanx({
    className: 'workspace-record-stones',
    renderDetail: (item, host) => {
      host.scrollTop = 0;
      editor(item.id === NEW_ID ? null : workspaces.find((w) => w.name === item.id) || null, host);
    },
  });
  stones.mount(out.content, { before: [messages] });
  return {
    el: out.el,
    show: () => { void load(); },
    destroy: () => stones.destroy(),
  };
}
