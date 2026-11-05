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

/** The folders on this machine from the home folder: crumbs, then a row per folder, with its tick when
 * the browser picks folders (without `onTick` it only walks to a folder). */
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
      if (onTick) {
        const tick = el('input', 'folder-tick');
        tick.type = 'checkbox';
        tick.checked = ticked(folder.dir);
        tick.setAttribute('aria-label', t('workspaces.tick', 'In this Workspace: {name}', { name: folder.name }));
        tick.addEventListener('change', () => onTick(folder.dir, tick.checked));
        row.append(tick);
      }
      const open = el('button', 'folder-open', folder.name); open.type = 'button';
      open.addEventListener('click', () => void load(folder.dir));
      row.append(open, el('small', 'folder-kind', folder.repository ? t('workspaces.git', 'Git') : ''));
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

/** A Workspace's page in the launch forms' format (owner, 2026-11-02/03): 1 Name & objective, 2 Locations
 * (Add a folder or Clone a repo at its top, then one row per folder), 3 Agent info (instructions and
 * Mode), the extra; every section folds to its answer. Lines inside one item sit tight; items are spaced as paragraphs.
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
  const open = { top: true, agents: false, locations: true, adding: '' }; // adding: '' | 'folder' | 'clone'
  // EVERY EDIT WAITS FOR SAVE (owner, 2026-11-02): a change lights Save (kaki, what needs you) and
  // the − beside it, which throws the changes away back to the saved Workspace.
  let dirty = false;
  const changed = () => { dirty = true; action.el.dataset.attention = 'true'; discard.setDisabled(false); };
  const settled = () => { dirty = false; delete action.el.dataset.attention; discard.setDisabled(true); };
  const MODES = { configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously') };

  /* ---- 1 · Name & objective; once created, Objective alone ---- */
  // Title and name are chosen once (owner, 2026-11-02): Teams and their Agents refer to them. A created
  // Workspace's title is the page head already, so the section asks only what can still change (2026-11-03).
  const stepTop = createStep({ n: 1, key: 'top', title: isNew ? t('workspaces.step_top', 'Name & objective') : t('workspaces.objective', 'Objective'), onToggle: () => { open.top = !open.top; paint(); } });
  if (isNew) {
    stepTop.body.append(createField({ label: t('workspaces.field_title', 'Title'), control: text('', (v) => { draft.title = v; changed(); }) }).el);
    stepTop.body.append(createField({ label: t('workspaces.name', 'Name'), control: text('', (v) => { draft.name = v.trim().toLowerCase(); changed(); }, t('new_team.name_placeholder', 'lowercase, digits, - _')) }).el);
    stepTop.body.append(createField({ label: t('workspaces.objective', 'Objective'), control: area(draft.objective, (v) => { draft.objective = v; changed(); }) }).el);
  } else {
    stepTop.body.append(createField({ label: t('workspaces.objective_what', 'What this Workspace is for'), control: area(draft.objective, (v) => { draft.objective = v; changed(); }) }).el);
  }

  /* ---- 3 · Agent info: what every Agent in it is told, and the Mode they launch in (owner, 2026-11-03:
     the extra, so it comes last) ---- */
  const stepAgents = createStep({ n: 3, key: 'agents', title: t('workspaces.agent_info', 'Agent info'), onToggle: () => { open.agents = !open.agents; paint(); } });
  stepAgents.body.append(createField({ label: t('workspaces.instructions', 'Instructions'), control: area(draft.instructions, (v) => { draft.instructions = v; changed(); }) }).el);

  const mode = ask([{ fields: [
    { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
      { v: 'configured', l: MODES.configured, sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      { v: 'live_dangerously', l: MODES.live_dangerously, sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
    ] },
  ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; changed(); paint(); } });
  stepAgents.body.append(mode.el);

  /* ---- 2 · Locations: what matters most, so second (owner, 2026-11-03). Add a folder or Clone a repo at
     the top, each opening its own panel; then one row per folder, its note under it ---- */
  const stepLocations = createStep({ n: 2, key: 'locations', title: t('workspaces.locations', 'Locations'), onToggle: () => { open.locations = !open.locations; paint(); } });
  const picked = new Map([...draft.repos, ...draft.folders].map((row) => [row.name, row.note]));
  const rootByName = (name) => reading.roots().find((root) => root.name === name);
  const rootByDir = (dir) => reading.roots().find((root) => root.dir === dir);
  const short = (dir) => (browser.home() && (dir === browser.home() || dir.startsWith(`${browser.home()}/`)) ? `~${dir.slice(browser.home().length)}` : dir);
  const rows = el('div', 'workspace-locations');
  const tools = el('div', 'workspace-location-tools');
  const addButton = el('button', 'wk-btn', t('workspaces.add_folder', '+ Add a folder')); addButton.type = 'button';
  const cloneButton = el('button', 'wk-btn', t('workspaces.clone_repo', '+ Clone a repo')); cloneButton.type = 'button';
  const choose = (which) => { open.adding = open.adding === which ? '' : which; paint(); };
  addButton.addEventListener('click', () => choose('folder'));
  cloneButton.addEventListener('click', () => choose('clone'));
  tools.append(addButton, cloneButton);
  const folderPanel = el('div', 'workspace-browser');
  const clonePanel = el('div', 'workspace-browser');
  stepLocations.body.append(tools, folderPanel, clonePanel, rows, plansBox);

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
    const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}`, { method: 'PUT', json: { ...draft, plans: draft.plans?.location ? draft.plans : null, plans_place: undefined, campaign_id: campaignId() || undefined } });
    if (!answer.ok) { say(answer.message, true); return false; }
    const moved = answer.data.moved?.length ? ` ${t('workspaces.plans_moved', 'Moved {n} plans.', { n: answer.data.moved.length })}` : '';
    say(`${t('workspaces.saved', 'Saved {name}.', { name: answer.data.workspace.title || answer.data.workspace.name })}${moved}`);
    settled();
    return answer.data.workspace;
  };
  // A repository's Mode (owner, 2026-11-02): the repository owns it, a Workspace only points at it. Asked
  // with ERABI (ask.js), as every question is; written to the repository on Save.
  // ERABI flips a one-of-two question (owner, 2026-10-03), so the chosen Mode's line reads under it.
  const MODE_SUBS = {
    desks: t('workspaces.mode_reviewed_sub', 'Each Agent works in its own worktree and hands its work in to the Team lead, who checks it and promotes it to the repository’s dev.'),
    folder: t('workspaces.mode_direct_sub', 'Every Agent works in the repository’s one checkout and commits straight to it; no hand-in, no check.'),
  };
  const repoMode = (name, root) => {
    const now = pending.get(name) ?? howOf(root.repo_profile);
    const question = ask([{ fields: [{ key: 'mode', label: t('workspaces.repo_mode', 'Mode'), options: [
      { v: 'desks', l: t('workspaces.mode_reviewed', 'Reviewed'), sub: MODE_SUBS.desks },
      { v: 'folder', l: t('workspaces.mode_direct', 'Direct'), sub: MODE_SUBS.folder },
    ] }] }], { value: { mode: now }, density: 'tight', onChange: (value) => {
      pending.set(name, value.mode); changed();
    } });
    return question.el;
  };
  // The two Modes are said once, above the rows (owner, 2026-11-03); a row carries its Mode word only.
  const legend = el('p', 'workspace-location-legend');
  for (const [key, word] of [['desks', t('workspaces.mode_reviewed', 'Reviewed')], ['folder', t('workspaces.mode_direct', 'Direct')]]) {
    const line = el('span');
    line.append(el('b', null, word), document.createTextNode(` ${MODE_SUBS[key]}`));
    legend.append(line);
  }
  /* ---- PLANS (KAN-256): where this Workspace keeps its plans, a row under the Locations. The default
     is Ronin Lab's <campaign>/<workspace>/plans, said "recommended"; pressed, it picks any of the
     Workspace's Locations and a subfolder. On Save the plans move there; a plan of the same name already
     there stops the Save, so one file never overwrites another. ---- */
  const LAB = 'ronin_lab';
  const plansBox = el('div', 'workspace-plans');
  let plansOpen = false;
  const placeWords = () => {
    if (draft.plans?.location) return { where: `${draft.plans.location}/${draft.plans.path}`.replace(/\/$/, ''), recommended: false };
    const place = w?.plans_place?.recommended ? w.plans_place : null;
    return { where: place ? `${place.location}/${place.path}` : `${LAB}/…/${draft.name || '<workspace>'}/plans`, recommended: true };
  };
  const paintPlans = () => {
    plansBox.replaceChildren();
    const { where, recommended } = placeWords();
    const row = el('button', 'workspace-plans-row'); row.type = 'button';
    row.setAttribute('aria-expanded', String(plansOpen));
    row.append(el('b', null, t('workspaces.plans', 'Plans')), el('code', null, where), el('small', 'folder-kind', recommended ? t('workspaces.plans_recommended', 'recommended') : ''));
    row.addEventListener('click', () => { plansOpen = !plansOpen; paintPlans(); });
    plansBox.append(row);
    if (!plansOpen) return;
    const names = [...new Set([LAB, ...picked.keys()])];
    const options = names.map((name) => ({ v: name, l: rootByName(name)?.title || name }));
    const chosen = draft.plans?.location || LAB;
    const question = ask([{ fields: [{ key: 'location', label: t('workspaces.plans_location', 'Location'), options }] }], {
      value: { location: chosen }, density: 'tight',
      onChange: (value) => {
        const location = value.location;
        // Ronin Lab is the recommended place itself; another Location starts at its plans folder.
        draft.plans = location === LAB ? undefined : { location, path: location === draft.plans?.location ? draft.plans.path : 'plans' };
        changed(); paintPlans();
      },
    });
    const sub = text(draft.plans?.path ?? '', (v) => { if (draft.plans) { draft.plans.path = v.trim(); changed(); } }, t('workspaces.plans_subfolder_hint', 'a folder inside it, such as plans'));
    sub.hidden = !draft.plans;
    plansBox.append(question.el, ...(draft.plans ? [createField({ label: t('workspaces.plans_subfolder', 'Subfolder'), control: sub }).el] : []),
      el('p', 'fs-step-help', t('workspaces.plans_help', 'On Save, this Workspace’s plans move to the new place; a plan of the same name already there stops the Save.')));
  };
  const noting = new Set(); // rows whose empty note was opened for writing
  const paintRows = () => {
    rows.replaceChildren();
    if (!picked.size) rows.append(el('p', 'fs-step-help', t('workspaces.locations_none', 'No folders yet. Add a folder or clone a repo, or drag one in from Explorer.')));
    if ([...picked.keys()].some((name) => rootByName(name)?.facts?.repo)) rows.append(legend);
    for (const [name, note] of picked) {
      const root = rootByName(name);
      const git = !!root?.facts?.repo;
      // ONE ROW per location (owner, 2026-11-02): kind · name · path · Mode word · + note · ×; a written
      // note for Agents reads under it (2026-11-03: an empty note is a link, not a line).
      const row = el('div', 'workspace-location');
      const remove = el('button', 'workspace-location-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', t('workspaces.remove_named', 'Remove {name}', { name }));
      remove.addEventListener('click', () => { picked.delete(name); changed(); paint(); browser.paint(); });
      const where = el('div', 'workspace-location-where');
      where.append(el('b', null, root?.title || name), el('code', null, short(root?.dir || '')));
      const writing = !!note || noting.has(name);
      const addNote = el('button', 'workspace-location-add-note', t('workspaces.add_note', '+ note')); addNote.type = 'button';
      addNote.title = t('workspaces.add_note_title', 'A note for Agents: what this folder is for. It goes into their brief.');
      addNote.hidden = writing;
      row.append(el('small', 'folder-kind', git ? t('workspaces.git', 'Git') : t('workspaces.dir', 'Dir')), where, git ? repoMode(name, root) : el('span'), addNote, remove);
      const noteInput = text(note, (v) => { picked.set(name, v); changed(); }, t('workspaces.note_for_agents', 'Note for Agents: what this folder is for…'));
      noteInput.className = 'workspace-location-note';
      noteInput.hidden = !writing;
      noteInput.addEventListener('blur', () => { if (!noteInput.value.trim()) { noting.delete(name); noteInput.hidden = true; addNote.hidden = false; } });
      addNote.addEventListener('click', () => { noting.add(name); addNote.hidden = true; noteInput.hidden = false; noteInput.focus(); });
      row.append(noteInput);
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
  const done = (help) => {
    const button = el('button', 'wk-btn', t('workspaces.done', 'Done')); button.type = 'button';
    button.addEventListener('click', () => { open.adding = ''; paint(); });
    const head = el('div', 'workspace-browser-head');
    head.append(el('span', 'fs-step-help', help), button);
    return head;
  };
  folderPanel.append(done(t('workspaces.add_help', 'Open folders; tick the ones this Workspace uses.')), browser.el);
  // Clone a repo: the repository first, then where it goes, walked to in its own browser.
  const repoName = (value) => (value.trim().replace(/\.git$/, '').replace(/\/+$/, '').split(/[/:]/).pop() || '');
  const repository = text('', () => paint(), t('workspace_add.repository_placeholder', 'owner/repo or a github.com link'));
  const into = folderBrowser({ onLoad: () => paint() });
  const cloneWhere = el('span', 'fs-step-help');
  const clone = el('button', 'wk-btn', t('workspaces.clone_here', 'Clone')); clone.type = 'button';
  clone.addEventListener('click', async () => {
    if (!repository.value.trim()) return;
    clone.disabled = true;
    say(t('workspaces.cloning', 'Cloning into {dir}…', { dir: short(into.current()) }));
    const answer = await request('/api/setup/github/clone', { method: 'POST', json: { repository: repository.value.trim(), parent: into.current() } });
    clone.disabled = false;
    if (!answer.ok) { say(answer.message, true); return; }
    repository.value = '';
    await reading.read();
    await into.load();
    await attach(answer.data.workspace.dir);
  });
  const cloneLine = el('div', 'workspace-clone');
  cloneLine.append(cloneWhere, clone);
  clonePanel.append(done(t('workspaces.clone_help', 'Clone a GitHub repository into a folder on this machine.')),
    createField({ label: t('workspaces.repository', 'Repository'), control: repository }).el,
    createField({ label: t('workspaces.clone_where', 'Where to put it'), control: into.el }).el,
    cloneLine);
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
    stepTop.setCollapsed(!open.top, (isNew ? draft.title || draft.name : draft.objective.trim().split('\n')[0]) || t('workspaces.none_yet', 'None'), true);
    stepLocations.setCollapsed(!open.locations, picked.size === 1 ? t('workspaces.one_folder', '1 folder') : t('workspaces.folders_n', '{n} folders', { n: picked.size }), true);
    folderPanel.hidden = open.adding !== 'folder';
    clonePanel.hidden = open.adding !== 'clone';
    addButton.setAttribute('aria-pressed', String(open.adding === 'folder'));
    cloneButton.setAttribute('aria-pressed', String(open.adding === 'clone'));
    const at = short(into.current()) || '~';
    const named = repoName(repository.value);
    cloneWhere.textContent = named ? t('workspaces.clone_lands', 'Lands in {dir}', { dir: `${at}/${named}` }) : t('workspaces.clone_into', 'Into {dir}', { dir: at });
    clone.disabled = !named;
    paintRows();
    paintPlans();
  }
  page.append(line, stepTop.el, stepLocations.el, stepAgents.el);
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
  ] }], { value: { show }, density: 'tight', onChange: ({ show: next }) => { show = (next || []).map(String); out.el.dataset.bare = String(!show.length); paint(); } });
  // With nothing to show under them, the stones are the name alone (owner, 2026-11-03).
  out.el.dataset.bare = 'true';
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
