/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACES WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-728; KAN-784). The Workspace is the organizing
 * principle: Ronin keeps no folder list of its own, and a folder or repository is a row of its
 * Workspace record (src/workspaces.ts). Tilespace 1 holds the Workspaces (`createWorkspaceStones`), each
 * stone in the Epic and Team stones' grammar (KAN-801). A pressed one opens beside them as one Workspace
 * (`workspaceSurface`), in the opened Team's bar: a toggle, Work (its Teams or Epics, to drill into, beside
 * its document) or Config (`workspacePage`: its folders, Integrations, Agent info and Behaviors; Archive
 * under ⋯), and Launch to its own page, `#/workspace/<name>` (`createWorkspaceRoute`), in a new tab. A stone dragged or a card placed opens it whole in
 * a tilespace (`createWorkspaceRecord`); New Workspace is a dotted card (`createWorkspaceNew`). A folder
 * link dragged in from Files (`/files/<path under home>`, KAN-146) adds that folder. GitHub CLI
 * (`createFolderGithub`) is the sign-in box github-workspace-setup.js draws.
 */
import { openCanvas } from './canvas-view.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { createBriefSettingsPanel, layerLinks } from './brief-step.js';
import { createPhalanx } from './phalanx.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { createFolderPicker } from './folder-picker.js';
import { createMenuButton } from './menu.js';
import { renderMarkdownDocument } from './markdown-reader.js';
import { subscribe as subscribeTeams, teamsFromState } from './team-controller.js';
import { createEpicStones, createEpicsRead } from './epics-surface.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { teamEpicIds } from './team-epics.js';
import { listedTeam } from './roster-groups.js';
import { openWorkspaceTab } from './workspace.js';
import { S } from './state.js';
import { createLifecycle, createStoneMarks, statusKey } from './item-lifecycle.js';
import { createWorkspacesRead } from './workspaces-read.js';
import { SURFACE_DRAG } from './workbench.js';

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

const pinName = (title, taken) => {
  const base = String(title).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60) || 'workspace';
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

/** The folders on this machine from the home folder: crumbs, then a row per folder; it walks to the
 * folder a clone goes into. */
function folderBrowser({ onLoad = () => {} }) {
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

/** A Workspace's page in the launch forms' format, made plain for someone new (KAN-728); a made one's is
 * its Config (KAN-784; its document is in Work): new, 1 Name; then Folders, each a name
 * and its path, a repository's remote in a line under it and how Agents work in it, with Add a folder and
 * Clone from GitHub; then, folded, Integrations, Agent info (objective, instructions, Mode, plans) and
 * Behaviors. A New Workspace is Name + Folders, Create. The folders are the record's rows, saved with it.
 * `null` is a new Workspace. Returns the page, its Save (Create) action and, made, its ⋯ for the head. */
export function workspacePage(w, { taken = () => [], onSaved = () => {}, onDiscard = () => {} }) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const isNew = !w;
  const draft = w ? JSON.parse(JSON.stringify(w)) : { name: '', title: '', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'live_dangerously', integrations: [] };
  if (!Array.isArray(draft.integrations)) draft.integrations = [];
  const page = el('div', 'ntf-form fs-steps workspace-form');
  // The page's own status line, first under its head: what Save, a tick or Clone answered.
  const line = status();
  line.classList.add('workspace-status');
  const say = sayInto(line);
  const text = (value, onInput, placeholder = '') => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.addEventListener('input', () => onInput(i.value)); return i; };
  const area = (value, onInput) => { const a = el('textarea'); a.rows = 4; a.value = value; a.addEventListener('input', () => onInput(a.value)); return a; };
  const open = { top: true, agents: false, locations: true, integrations: false, brief: false, adding: '' }; // adding: '' | 'folder' | 'clone'
  // EVERY EDIT WAITS FOR SAVE (owner, 2026-11-02): a change lights Save (kaki, what needs you) and
  // the − beside it, which throws the changes away back to the saved Workspace.
  let dirty = false;
  const changed = () => { dirty = true; action.el.dataset.attention = 'true'; discard.setDisabled(false); };
  const settled = () => { dirty = false; delete action.el.dataset.attention; discard.setDisabled(true); };
  const MODES = { configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously') };

  /* ---- 1 · New: its Name, one field; the handle Teams use is made from it (KAN-728). A made
     Workspace has no step 1 here: its document is in Work (workspaceDoc, KAN-784) ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('workspaces.name', 'Name') });
  if (isNew) stepTop.body.append(text('', (v) => { draft.title = v.trim(); draft.name = draft.title ? pinName(draft.title, new Set(taken())) : ''; changed(); }, t('workspaces.name_placeholder', 'Such as Website or Accounts')));
  stepTop.el.hidden = !isNew;
  const n = (step) => (isNew ? step : step - 1); // Config numbers from 1

  /* ---- 4 · Agent info: what every Agent in it is told (objective, instructions), the Mode they launch
     in, and where its plans live; the extra, so it comes after the folders ---- */
  const stepAgents = createStep({ n: n(4), key: 'agents', title: t('workspaces.agent_info', 'Agent info'), onToggle: () => { open.agents = !open.agents; paint(); } });
  stepAgents.body.append(createField({ label: t('workspaces.objective', 'Objective'), control: area(draft.objective, (v) => { draft.objective = v; changed(); }) }).el);
  stepAgents.body.append(createField({ label: t('workspaces.instructions', 'Instructions'), control: area(draft.instructions, (v) => { draft.instructions = v; changed(); }) }).el);

  const mode = ask([{ fields: [
    { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
      { v: 'configured', l: MODES.configured, sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      { v: 'live_dangerously', l: MODES.live_dangerously, sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
    ] },
  ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; changed(); paint(); } });
  stepAgents.body.append(mode.el);

  /* ---- 5 · Behaviors (docs/architecture/brief.md, Where it is set in the UI): what every Agent in this Workspace is told — its add, block
     and only lists and project management; its integrations are step 3. A created Workspace only. ---- */
  const stepBrief = createStep({ n: n(5), key: 'brief', title: t('behaviours', 'Behaviors'), onToggle: () => { open.brief = !open.brief; paint(); } });
  const brief = isNew ? null : createBriefSettingsPanel({ layer: 'workspace', id: draft.name, ownSave: false, showIntegrations: false, onChange: () => changed(),
    preview: { workspace: draft.name }, linkFor: layerLinks() });
  if (brief) { stepBrief.body.append(el('p', 'fs-step-help', t('workspaces.brief_help', 'What every Agent in this Workspace is told. Agents already working are sent the change.')), brief.el); void brief.enter(); }

  /* ---- 3 · Integrations (KAN-338): the outside services this Workspace uses, from the integrations
     list (the bridges); each row a provider, with a field for each fact its bridge names (`facts: site`), saved
     into the row as {provider, site}; any other fact is kept as it is. Agents read them
     on the Team's Workspace line, and ask for its keys with `secret ask`. ---- */
  const stepIntegrations = createStep({ n: n(3), key: 'integrations', title: t('workspaces.integrations', 'Integrations'), onToggle: () => { open.integrations = !open.integrations; paint(); } });
  const integrationRows = el('div', 'workspace-locations workspace-integrations');
  const addIntegration = el('select', 'workspace-integration-add');
  stepIntegrations.body.append(integrationRows, addIntegration,
    el('p', 'fs-step-help', t('workspaces.integrations_help', 'Agents in this Workspace use these; they ask for a key with secret ask, and Settings › Integrations shows what is saved.')));
  let index = [];
  addIntegration.addEventListener('change', () => {
    const provider = addIntegration.value;
    if (!provider) return;
    draft.integrations.push({ provider });
    changed(); paint();
  });
  const paintIntegrations = () => {
    integrationRows.replaceChildren();
    if (!draft.integrations.length) integrationRows.append(el('p', 'fs-step-help', t('workspaces.integrations_none', 'None yet.')));
    for (const entry of draft.integrations) {
      const record = index.find((one) => one.name === entry.provider);
      const row = el('div', 'workspace-location');
      const remove = el('button', 'workspace-location-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', t('workspaces.remove_named', 'Remove {name}', { name: record?.label || entry.provider }));
      remove.addEventListener('click', () => { draft.integrations = draft.integrations.filter((one) => one !== entry); changed(); paint(); });
      const where = el('div', 'workspace-location-where');
      // The facts its bridge names (its `facts:` line) are fields; any other fact is kept and shown as it is.
      const named = record?.facts || [];
      const facts = Object.entries(entry).filter(([k]) => k !== 'provider' && !named.includes(k)).map(([k, v]) => `${k} ${v}`).join(' · ');
      where.append(el('b', null, record?.label || entry.provider), el('code', null, facts || (named.length ? '' : record?.blurb || '')));
      const state = record?.secrets.length ? t('integrations.keys_n', '{n} saved', { n: record.secrets.length }) : t('integrations.no_keys', 'No keys');
      row.append(el('small', 'folder-kind', ''), where, el('small', 'folder-kind', state), el('span'), remove);
      for (const fact of named) {
        const field = createField({ label: fact, control: text(entry[fact] ?? '', (v) => {
          if (v.trim()) entry[fact] = v.trim(); else delete entry[fact];
          changed();
        }) });
        field.el.classList.add('workspace-integration-fact');
        row.append(field.el);
      }
      integrationRows.append(row);
    }
    const chosen = new Set(draft.integrations.map((one) => one.provider));
    addIntegration.replaceChildren(Object.assign(el('option', null, t('workspaces.add_integration', '+ Add an integration')), { value: '' }),
      ...index.filter((one) => one.available !== false && !chosen.has(one.name)).map((one) => Object.assign(el('option', null, one.label), { value: one.name })));
    addIntegration.hidden = addIntegration.options.length < 2;
  };
  void request('/api/integrations', { cache: 'no-store' })
    .then((answer) => { if (answer.ok) { index = answer.data.integrations || []; paint(); } });

  /* ---- 2 · Folders: what matters most, so second (owner, 2026-11-03). Add a folder (the kit's folder
     picker: walk, find, or make a new one; or paste a path) and Clone from GitHub at the top, each
     opening its own panel; then one row per folder, its note under it ---- */
  const stepLocations = createStep({ n: n(2), key: 'locations', title: t('workspaces.folders', 'Folders'), onToggle: () => { open.locations = !open.locations; paint(); } });
  // The record's rows, by dir: a repository row carries how Agents work in it (mode, working, stable,
  // desks); `remote` is read for the row's line under it. Names are Ronin's, made on Save.
  const picked = new Map([...draft.repos.map((row) => ({ ...row, repo: true })), ...draft.folders.map((row) => ({ ...row, repo: false }))].map((row) => [row.dir, row]));
  const facts = new Map(); // dir → { repo: { remote, branch } | null }, read once
  const learn = async (dir) => {
    if (facts.has(dir)) return facts.get(dir);
    const answer = await request(`/api/folders/inspect?${new URLSearchParams({ dir })}`, { cache: 'no-store' });
    const known = answer.ok ? answer.data : { repo: null };
    facts.set(dir, known);
    return known;
  };
  for (const dir of picked.keys()) void learn(dir).then(() => paint());
  const short = (dir) => (into.home() && (dir === into.home() || dir.startsWith(`${into.home()}/`)) ? `~${dir.slice(into.home().length)}` : dir);
  const rows = el('div', 'workspace-locations');
  const tools = el('div', 'workspace-location-tools');
  const choose = (which) => { open.adding = open.adding === which ? '' : which; paint(); };
  const addButton = createAction({ label: t('workspaces.add_folder', 'Add a folder'), kind: 'primary', size: 'compact', action: () => choose('folder') });
  const cloneButton = createAction({ label: t('workspaces.clone_github', 'Clone from GitHub'), size: 'compact', action: () => choose('clone') });
  tools.append(addButton.el, cloneButton.el);
  const folderPanel = el('div', 'workspace-browser');
  const clonePanel = el('div', 'workspace-browser');
  const plansBox = el('div', 'workspace-plans'); // PLANS (KAN-256), in Agent info; declared before it is placed
  stepLocations.body.append(tools, folderPanel, clonePanel, rows);
  stepAgents.body.append(plansBox);

  const save = async () => {
    if (isNew && !draft.name) { say(t('workspaces.name_needed', 'Give the Workspace a name.'), true); return false; }
    const rowOf = ({ repo: _repo, ...row }) => row;
    draft.repos = [...picked.values()].filter((row) => row.repo).map(rowOf);
    draft.folders = [...picked.values()].filter((row) => !row.repo).map(({ name, dir, note }) => ({ name, dir, note }));
    // Behaviors save first; the Workspace's own save then carries the same values.
    if (brief) { const told = await brief.save(); if (!told.ok) { say(told.message, true); return false; } }
    const briefKeys = brief ? { brief: brief.value().brief, pm: brief.value().pm } : {};
    const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}`, { method: 'PUT', json: { ...draft, ...briefKeys, plans: draft.plans?.location ? draft.plans : null, plans_place: undefined, canvases: undefined } });
    if (!answer.ok) { say(answer.message, true); return false; }
    // The rows come back named; a page kept open saves them by those names.
    for (const row of [...answer.data.workspace.repos, ...answer.data.workspace.folders]) if (picked.has(row.dir)) picked.get(row.dir).name = row.name;
    const moved = answer.data.moved?.length ? ` ${t('workspaces.plans_moved', 'Moved {n} plans.', { n: answer.data.moved.length })}` : '';
    say(`${t('workspaces.saved', 'Saved {name}.', { name: answer.data.workspace.title || answer.data.workspace.name })}${moved}`);
    settled();
    return answer.data.workspace;
  };
  // A repository's Mode lives on its row here (KAN-728), saved with the Workspace. Asked with ERABI
  // (ask.js), as every question is; it flips a one-of-two question (owner, 2026-10-03), so the chosen
  // Mode's line reads under it.
  const MODE_SUBS = {
    reviewed: t('workspaces.mode_reviewed_sub', 'Each Agent works in its own worktree and hands its work in to the Team lead, who checks it and promotes it to the repository’s dev.'),
    direct: t('workspaces.mode_direct_sub', 'Every Agent works in the repository’s one checkout and commits straight to it; no hand-in, no check.'),
  };
  const repoMode = (row) => {
    const question = ask([{ fields: [{ key: 'mode', label: t('workspaces.repo_mode', 'Mode'), options: [
      { v: 'reviewed', l: t('workspaces.mode_reviewed', 'Reviewed'), sub: MODE_SUBS.reviewed },
      { v: 'direct', l: t('workspaces.mode_direct', 'Direct'), sub: MODE_SUBS.direct },
    ] }] }], { value: { mode: row.mode === 'reviewed' ? 'reviewed' : 'direct' }, density: 'tight', onChange: (value) => {
      row.mode = value.mode;
      row.desks = value.mode === 'reviewed' ? 'managed' : 'none';
      row.working = value.mode === 'reviewed' ? (row.working || 'dev') : '';
      changed();
    } });
    return question.el;
  };
  /* ---- PLANS (KAN-256): where this Workspace keeps its plans, a row under the Locations. The default
     is Ronin Lab's <campaign>/<workspace>/plans, said "recommended"; pressed, it picks any of the
     Workspace's Locations and a subfolder. On Save the plans move there; a plan of the same name already
     there stops the Save, so one file never overwrites another. ---- */
  const LAB = 'ronin_lab';
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
    // CANVASES (KAN-329, KAN-626): the Workspace's canvases by name; pressing one opens it, read
    // fresh, over this surface (canvas-view.js).
    const canvasNames = Array.isArray(w?.canvases) ? w.canvases : [];
    const canvases = el('p', 'workspace-canvases-row');
    const nameList = el('span');
    if (!canvasNames.length) nameList.textContent = t('workspaces.canvases_none', 'none yet');
    for (const name of canvasNames) {
      const open = el('button', 'workspace-canvas-open', name); open.type = 'button';
      open.title = t('workspaces.canvas_open', 'Open the canvas {name}, read now', { name });
      open.addEventListener('click', () => { void openCanvas(open, w.name, name); });
      nameList.append(open);
    }
    canvases.append(el('b', null, t('workspaces.canvases', 'Canvases')), nameList);
    plansBox.append(canvases);
    if (!plansOpen) return;
    const names = [...new Set([LAB, ...[...picked.values()].map((row) => row.name).filter(Boolean)])];
    const options = names.map((name) => ({ v: name, l: name }));
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
    if (!picked.size) rows.append(el('p', 'fs-step-help', t('workspaces.folders_none', 'No folders yet. Add a folder the Agents work in, or clone one from GitHub.')));
    for (const [dir, folder] of picked) {
      const { note } = folder;
      const name = folder.name || dir.split('/').filter(Boolean).pop() || dir;
      const repo = facts.get(dir)?.repo;
      // ONE ROW per folder (KAN-728): name · path, a repository's remote in a line under it · its Mode ·
      // + note · ×; a written note for Agents reads under it (2026-11-03: an empty note is a link, not a line).
      const row = el('div', 'workspace-location');
      const remove = el('button', 'workspace-location-remove', '×'); remove.type = 'button';
      remove.setAttribute('aria-label', t('workspaces.remove_named', 'Remove {name}', { name }));
      remove.addEventListener('click', () => { picked.delete(dir); changed(); paint(); });
      const where = el('div', 'workspace-location-where');
      where.append(el('b', null, name), el('code', null, short(dir)));
      if (repo) where.append(el('small', 'workspace-location-repo', repo.remote ? repo.remote.replace(/^(https?:\/\/|git@)/, '').replace(/\.git$/, '').replace(/^([^/:]+):/, '$1/') : t('workspaces.repo_no_remote', 'Git repository, no remote')));
      const writing = !!note || noting.has(dir);
      const addNote = el('button', 'workspace-location-add-note', t('workspaces.add_note', '+ note')); addNote.type = 'button';
      addNote.title = t('workspaces.add_note_title', 'A note for Agents: what this folder is for. It goes into their brief.');
      addNote.hidden = writing;
      row.append(where, folder.repo ? repoMode(folder) : el('span'), addNote, remove);
      const noteInput = text(note, (v) => { folder.note = v; changed(); }, t('workspaces.note_for_agents', 'Note for Agents: what this folder is for…'));
      noteInput.className = 'workspace-location-note';
      noteInput.hidden = !writing;
      noteInput.addEventListener('blur', () => { if (!noteInput.value.trim()) { noting.delete(dir); noteInput.hidden = true; addNote.hidden = false; } });
      addNote.addEventListener('click', () => { noting.add(dir); addNote.hidden = true; noteInput.hidden = false; noteInput.focus(); });
      row.append(noteInput);
      rows.append(row);
    }
  };
  // Add a folder: a row of this Workspace, saved with it. One another Workspace holds keeps its name and
  // settings; a new repository starts Direct on the branch it is on.
  const attach = async (dir) => {
    open.adding = '';
    say('');
    const known = await learn(dir);
    if (!picked.has(known.dir || dir)) {
      const fresh = known.repo ? { mode: 'direct', working: '', stable: known.repo.branch || 'main', desks: 'none' } : {};
      const { name = '', ...settings } = known.held || {};
      picked.set(known.dir || dir, { name, dir: known.dir || dir, note: '', repo: !!known.repo, ...(known.repo ? { ...fresh, ...settings } : {}) });
      changed();
    }
    paint();
  };
  const done = (help) => {
    const button = el('button', 'wk-btn', t('workspaces.done', 'Done')); button.type = 'button';
    button.addEventListener('click', () => { open.adding = ''; paint(); });
    const head = el('div', 'workspace-browser-head');
    head.append(el('span', 'fs-step-help', help), button);
    return head;
  };
  // The kit's folder picker: walk or find a folder and press Add, or make a new one here (it is added
  // as made); or paste a path. Each adds the folder in one step.
  const picker = createFolderPicker({ onChange: (dir) => void attach(dir), take: t('workspaces.add', 'Add') });
  const pasted = text('', () => {}, t('workspaces.paste_path', 'Or paste a path, such as ~/projects/site'));
  const addPasted = el('button', 'wk-btn', t('workspaces.add', 'Add')); addPasted.type = 'button';
  const takePasted = async () => {
    const typed = pasted.value.trim();
    if (!typed) return;
    const dir = typed.startsWith('~') && into.home() ? into.home() + typed.slice(1) : typed;
    const found = await request(`/api/folders?${new URLSearchParams({ dir })}`, { cache: 'no-store' });
    if (!found.ok) { say(found.message, true); return; }
    pasted.value = '';
    await attach(found.data.dir);
  };
  addPasted.addEventListener('click', () => void takePasted());
  pasted.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void takePasted(); } });
  const pasteLine = el('div', 'workspace-clone');
  pasteLine.append(pasted, addPasted);
  folderPanel.append(done(t('workspaces.add_help', 'Choose the folder the Agents work in.')), picker.el, pasteLine);
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
    if (!at || !into.home()) return;
    event.preventDefault();
    void attach([into.home(), ...decodeURIComponent(at[1]).split('/').filter(Boolean)].join('/'));
  });

  // Save answers at the button too: Saving…, then Saved for a moment, or back to Save with the error above.
  const label = isNew ? t('workspaces.create', 'Create') : t('workspaces.save', 'Save');
  const action = createAction({ label, launch: true, size: 'compact', endsEdit: true, action: async () => {
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
    if (isNew) stepTop.setCollapsed(false, '', false);
    stepIntegrations.setCollapsed(!open.integrations, draft.integrations.map((one) => index.find((r) => r.name === one.provider)?.label || one.provider).join(', ') || t('workspaces.none_yet', 'None'), true);
    paintIntegrations();
    stepBrief.el.hidden = isNew;
    stepBrief.setCollapsed(!open.brief, '', true);
    stepLocations.setCollapsed(!open.locations, picked.size === 1 ? t('workspaces.one_folder', '1 folder') : t('workspaces.folders_n', '{n} folders', { n: picked.size }), true);
    folderPanel.hidden = open.adding !== 'folder';
    clonePanel.hidden = open.adding !== 'clone';
    addButton.el.setAttribute('aria-pressed', String(open.adding === 'folder'));
    cloneButton.el.setAttribute('aria-pressed', String(open.adding === 'clone'));
    const at = short(into.current()) || '~';
    const named = repoName(repository.value);
    cloneWhere.textContent = named ? t('workspaces.clone_lands', 'Lands in {dir}', { dir: `${at}/${named}` }) : t('workspaces.clone_into', 'Into {dir}', { dir: at });
    clone.disabled = !named;
    paintRows();
    paintPlans();
  }
  // A New Workspace is its Name and its folders, then Create (KAN-728); the rest waits for the made one.
  stepIntegrations.el.hidden = isNew;
  stepAgents.el.hidden = isNew;
  page.append(line, stepTop.el, stepLocations.el, stepIntegrations.el, stepAgents.el, stepBrief.el);
  paint();
  // ⋯ (a made Workspace): Archive takes it off the Workspace pickers, kept; Restore brings it back.
  const more = isNew ? null : createMenuButton({ glyph: '⋯', title: t('workspaces.more', 'More'), host: () => page, groups: () => [{ items: [{
    label: draft.archived ? t('workspaces.restore', 'Restore') : t('workspaces.archive', 'Archive'),
    hint: draft.archived ? t('workspaces.restore_hint', 'Offer it again when starting Teams.') : t('workspaces.archive_hint', 'Stop offering it when starting Teams. Nothing is deleted.'),
    run: async () => {
      const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}`, { method: 'PUT', json: { ...w, archived: !draft.archived, plans_place: undefined, canvases: undefined } });
      if (!answer.ok) { say(answer.message, true); return; }
      onSaved(answer.data.workspace);
    },
  }] }] });
  return { el: page, action, discard, more };
}

/** The selector's cards: one per Workspace, its name. */
export const workspaceOffers = (workspacesRead) => workspacesRead.list().map((w) => ({ key: w.name, label: w.title || w.name }));

const NEW_STONE = '\0new-workspace';

// `type` is the bench's Workspace record surface (the Workspaces door's); a bench without one drags nothing.
const dragWorkspace = (stone, type) => (!type ? stone : {
  ...stone,
  draggable: true,
  events: { dragstart: (event) => {
    event.dataTransfer.setData(SURFACE_DRAG, JSON.stringify({ type, detail: { key: stone.id } }));
    event.dataTransfer.setData('text/plain', stone.label);
    event.dataTransfer.effectAllowed = 'copy';
  } },
});

/** The Teams working in a Workspace: its listed Teams, by name. */
const teamsIn = (w) => teamsFromState().filter((team) => team.durable && team.workspace === w.name && listedTeam(team))
  .sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name)));

/** What a Workspace holds: every item its Teams and their Agents hold (each Team row's `items`), once each. */
const itemsIn = (w) => [...new Map(teamsIn(w).flatMap((team) => team.items || []).map((item) => [item.id, item])).values()];
const flaggedIn = (w) => itemsIn(w).some((item) => item.flagged && statusKey(item.status) !== 'done');

/** Launch (owner, 2026-11-23): the kit's Launch, the Ronin mark; it opens the Workspace's own page in a new tab. */
const workspaceLaunch = (name) => WorkspaceKit.primitives.createAction({ label: t('workspaces.launch', 'Launch'), launch: true, size: 'compact',
  action: () => openWorkspaceTab('workspace', name) });

/**
 * THE WORKSPACE'S DOCUMENT (KAN-713; KAN-784): its one doc, `~/ronin/office/workspaces/<name>.md`, the
 * project's knowledge of itself, read and improved where the Workspace is worked in, never under
 * Config. Rendered; Edit turns it to its text with Save and Cancel; Save writes the same file
 * `workspace-doc` and `office read` use.
 */
function workspaceDoc(w) {
  const { createAction } = WorkspaceKit.primitives;
  const box = el('section', 'workspace-doc-pane');
  const said = status();
  const say = sayInto(said);
  const view = el('div', 'workspace-doc');
  const actions = el('div', 'workspace-page-actions');
  let doc = null;
  let draft = null;
  const url = `/api/workspaces/${encodeURIComponent(w.name)}/doc`;
  const show = () => {
    draft = null;
    view.replaceChildren(doc === null ? el('p', 'fs-step-help', t('workspaces.reading', 'Reading…')) : renderMarkdownDocument(doc));
    actions.replaceChildren(edit.el);
  };
  const edit = createAction({ label: t('workspaces.edit_summary', 'Edit'), size: 'compact', action: () => {
    draft = doc ?? '';
    const text = el('textarea', 'workspace-doc-text');
    text.rows = 16;
    text.value = draft;
    text.setAttribute('aria-label', t('workspaces.doc_text', 'The Workspace document'));
    text.addEventListener('input', () => { draft = text.value; });
    view.replaceChildren(text);
    actions.replaceChildren(save.el, cancel.el);
    text.focus();
  } });
  const save = createAction({ label: t('workspaces.save', 'Save'), kind: 'primary', size: 'compact', action: async () => {
    const told = await request(url, { method: 'PUT', json: { text: draft ?? '' } });
    if (!told.ok) { say(told.message, true); return; }
    doc = draft ?? ''; say(''); show();
  } });
  const cancel = createAction({ label: t('workspaces.cancel', 'Cancel'), size: 'compact', action: () => { say(''); show(); } });
  const head = el('div', 'workspace-page-head');
  head.append(el('span', 'wk-surface-header-title', t('workspaces.document', 'Document')), actions);
  box.append(head, said, view);
  show();
  void request(url, { cache: 'no-store' }).then((answer) => {
    if (!answer.ok) { say(answer.message, true); return; }
    doc = answer.data.text || '';
    if (draft === null) show();
  });
  return { el: box };
}

/**
 * THE TEAMS OF A WORKSPACE (KAN-801): the Teams stones themselves, bare and fixed to this Workspace
 * (team-roster-surface.js), as workspaceEpics takes the Epic stones. Pressed, a Team opens in its bar's
 * grammar (cowork-view.js leagueTeamBody): its name with Launch, its concept in full, the lifecycle
 * line along its foot. The whole one-Team view joins when team_mindset exports it.
 */
function teamOpened(name) {
  const team = teamsFromState().find((one) => one.name === name);
  const root = el('div', 'epic-detail team-detail');
  const launch = WorkspaceKit.primitives.createAction({ label: t('league.launch_team', 'Launch'), launch: true, size: 'compact', action: () => openWorkspaceTab('team', name) });
  const actions = el('span', 'item-bar-state team-bar-actions');
  actions.append(launch.el);
  const head = el('span', 'item-bar-head team-bar-head');
  head.append(el('span', 'item-bar-title team-bar-title', String(team?.title || '').trim() || name), actions);
  const objective = el('span', 'item-bar-objective team-bar-objective', String(team?.objective || '').trim());
  objective.hidden = !objective.textContent;
  const line = createLifecycle('line');
  line.update(team?.items || []);
  const bar = el('div', 'item-bar item-bar-lean team-bar');
  bar.append(head, objective, line.el);
  root.append(bar);
  return { el: root };
}
function workspaceTeams(w) {
  const host = el('div', 'workspace-teams');
  const empty = el('p', 'fs-step-help', t('workspaces.no_teams', 'No Team works in this Workspace yet.'));
  const stones = createTeamRosterSurface({ bare: true, roots: [w.name], teamDetail: teamOpened });
  host.append(empty, stones.el);
  const paint = () => { empty.hidden = Boolean(teamsIn(w).length); };
  const stop = subscribeTeams(paint);
  paint();
  stones.render();
  return { el: host, destroy: () => { stop?.(); stones.destroy(); } };
}

/** The Epics of a Workspace: the Epics its Teams or their Agents hold (each Team roster's `epics`),
 * drawn by the Epics stones themselves (createEpicStones, bare, as a Team's Epics view takes them). */
function workspaceEpics(w) {
  const every = createEpicsRead(() => '');
  const mine = () => new Set(teamsIn(w).flatMap((team) => [...teamEpicIds(team)]));
  const stones = createEpicStones({ bare: true, emptyWords: t('workspaces.no_epics', 'No open Epic in this Workspace.'), epicsRead: {
    list: () => every.list().filter((epic) => mine().has(epic.id)),
    items: (id) => every.items(id),
    subscribe: (listener) => { const a = every.subscribe(listener); const b = subscribeTeams(listener); return () => { a(); b?.(); }; },
  } });
  stones.show();
  return stones;
}

/**
 * WORK (owner, 2026-11-22; KAN-784): the Workspace as it is lived in. Its life, one ERABI picking Teams
 * or Epics, each opening to drill into; beside it, its document. A narrow screen stacks them.
 */
function workspaceWork(w) {
  const host = el('div', 'workspace-work');
  const life = el('section', 'workspace-life');
  let kind = 'teams';
  let shown = null;
  const pick = ask([{ fields: [{ key: 'kind', label: t('workspaces.see', 'See'), options: [
    { v: 'teams', l: t('campaign.coworks', 'Teams') },
    { v: 'epics', l: t('workspaces.epics', 'Epics') },
  ] }] }], { value: { kind }, density: 'tight', exposed: true, onChange: ({ kind: next }) => { kind = String(next || 'teams'); paint(); } });
  const paint = () => {
    shown?.destroy?.();
    shown = kind === 'epics' ? workspaceEpics(w) : workspaceTeams(w);
    life.replaceChildren(pick.el, shown.el);
  };
  paint();
  host.append(life, workspaceDoc(w).el);
  return { el: host, destroy: () => { shown?.destroy?.(); pick.destroy(); } };
}

// The view a Workspace surface last showed, kept while the page is open: a repaint after Save stays in Config.
let lastView = 'work';

/**
 * ONE WORKSPACE (owner, 2026-11-22; KAN-784; KAN-801): the opened Team's bar (cowork-view.js
 * leagueTeamBody: the item bar's classes), its name with the Work/Config toggle and Launch in the head,
 * its objective in full under them, the shared lifecycle line along its foot over what its Teams and
 * their Agents hold; then the view the toggle picks. Work is what is being done in it and its document
 * (workspaceWork); Config is its page (workspacePage: Folders, Integrations, Agent info, Behaviors),
 * its Save, − and ⋯ in the head only there. The same surface on the Workspaces stones, in a tilespace
 * and on its own route; `launch` adds Launch to it, `title` its name (a tilespace's header has it).
 */
function workspaceSurface(w, { workspacesRead, onDiscard = () => {}, launch = false, title = true }) {
  const { createAction } = WorkspaceKit.primitives;
  const root = el('div', 'epic-detail team-detail workspace-one');
  const actions = el('span', 'item-bar-state team-bar-actions workspace-bar-actions');
  const head = el('span', 'item-bar-head team-bar-head');
  const objective = el('span', 'item-bar-objective team-bar-objective', String(w.objective || '').trim());
  objective.hidden = !objective.textContent;
  const line = createLifecycle('line');
  const bar = el('div', 'item-bar item-bar-lean team-bar workspace-bar');
  const body = el('div', 'workspace-one-body');
  let view = lastView;
  let current = null;
  // The toggle: two kit actions, the one showing pressed.
  const toggle = el('span', 'workspace-toggle');
  toggle.setAttribute('role', 'group');
  const views = [['work', t('workspaces.work', 'Work')], ['config', t('workspaces.config', 'Config')]].map(([key, label]) => {
    const one = createAction({ label, size: 'compact', action: () => { if (view === key) return; view = lastView = key; paint(); } });
    toggle.append(one.el);
    return [key, one.el];
  });
  const launched = launch ? workspaceLaunch(w.name) : null;
  const paint = () => {
    current?.destroy?.();
    for (const [key, node] of views) node.setAttribute('aria-pressed', String(key === view));
    if (view === 'config') {
      const page = workspacePage(w, { onSaved: () => void workspacesRead.read(), onDiscard });
      current = page;
      actions.replaceChildren(toggle, ...(launched ? [launched.el] : []), page.action.el, page.discard.el, page.more.el);
      body.replaceChildren(page.el);
    } else {
      current = workspaceWork(w);
      actions.replaceChildren(toggle, ...(launched ? [launched.el] : []));
      body.replaceChildren(current.el);
    }
  };
  head.append(...(title ? [el('span', 'item-bar-title team-bar-title', w.title || w.name)] : []), actions);
  bar.append(head, objective, line.el);
  const reline = () => line.update(itemsIn(w));
  reline();
  const stop = subscribeTeams(reline);
  root.append(bar, body);
  paint();
  return { el: root, destroy: () => { stop?.(); current?.destroy?.(); } };
}

/** The stones of Workspaces (owner, 2026-11-22; KAN-784; KAN-801): Layer 1, every Workspace a stone as
 * an Epic's or a Team's: its name and the shared marks, the number bottom right its Teams. A pressed stone
 * opens that Workspace beside the rail, Work or Config, with Launch to its own page; a stone dragged
 * into a tilespace opens it whole there. The last stone, New Workspace, is its Name and Folders. */
export function createWorkspaceStones({ workspacesRead, workbench, recordType = '', withNew = false, onShow = () => {} }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.title', 'Workspaces'), className: 'setup-surface workspaces-records' });
  const messages = status();
  const say = sayInto(messages);
  // One set of marks per Workspace, kept: phalanx counts a Node by its identity (KAN-413).
  const marks = new Map();
  const marksOf = (key) => {
    if (!marks.has(key)) { const line = createLifecycle('line'); marks.set(key, { line, marks: createStoneMarks(line) }); }
    return marks.get(key);
  };
  const stones = createPhalanx({
    className: 'workspace-record-stones',
    renderDetail: (item, host) => {
      host.scrollTop = 0;
      // Setup has no selector: its New Workspace is a stone, and the made Workspace opens in its place.
      if (item.id === NEW_STONE) {
        const page = workspacePage(null, { taken: () => workspacesRead.list().map((w) => w.name), onSaved: async (saved) => { await workspacesRead.read(); lastView = 'config'; stones.select(saved.name); }, onDiscard: () => stones.refreshDetail() });
        const head = el('div', 'workspace-page-head');
        const actions = el('div', 'workspace-page-actions');
        actions.append(page.action.el, page.discard.el);
        head.append(el('span', 'wk-surface-header-title', t('workspaces.new', 'New Workspace')), actions);
        host.append(head, page.el);
        return undefined;
      }
      const w = workspacesRead.list().find((row) => row.name === item.id);
      if (!w) return undefined;
      const one = workspaceSurface(w, { workspacesRead, launch: true, onDiscard: () => stones.refreshDetail() });
      host.append(one.el);
      return () => one.destroy();
    },
  });
  stones.mount(out.content, { before: [messages] });
  const paint = (answer) => {
    if (answer && !answer.ok) { say(answer.message, true); return; }
    if (answer) say(workspacesRead.list().length ? '' : t('workspaces.none', 'No Workspaces yet. Place New Workspace from the selector.'));
    // The Epic and Team stones' grammar (owner, 2026-11-23; KAN-801): the name, the shared marks over
    // what its Teams and their Agents hold, but the small number bottom right is how many Teams work in
    // it, a Workspace's size (owner, 2026-11-23); no line of words under the name, Archived aside.
    // Flagged first, then by name.
    const name = (w) => String(w.title || '').trim() || w.name;
    const next = workspacesRead.list().slice()
      .sort((a, b) => Number(flaggedIn(b)) - Number(flaggedIn(a)) || name(a).localeCompare(name(b)))
      .map((w) => {
        const items = itemsIn(w);
        const one = marksOf(w.name);
        one.line.update(items);
        const marker = one.marks.update(items);
        const size = marker.querySelector('.stone-size');
        const teams = String(teamsIn(w).length);
        if (size && size.textContent !== teams) size.textContent = teams;
        return dragWorkspace({ id: w.name, label: name(w), ...(w.archived ? { state: t('workspaces.archived', 'Archived') } : {}),
          marker, className: `workspace-stone${w.archived ? ' archived' : ''}` }, recordType);
      });
    // ONE WORKSPACE MOVES, ONE STONE REPAINTS (KAN-413): the phalanx's keyed list leaves every
    // stone a Teams push did not move, and an open page, alone.
    stones.setItems(withNew ? [...next, { id: NEW_STONE, glyph: '+', label: t('workspaces.new', 'New Workspace') }] : next);
    workbench?.refreshSelector?.();
  };
  const stop = workspacesRead.subscribe(paint);
  const stopTeams = subscribeTeams(() => paint());
  return {
    el: out.el,
    show: () => { void workspacesRead.read(); onShow(); },
    destroy: () => { stop(); stopTeams?.(); stones.destroy(); },
  };
}

/** One Workspace whole in a tilespace: the same surface, Work or Config, with Launch to its own page. */
export function createWorkspaceRecord(key, { workspacesRead }) {
  const { createSurface, setSurfaceState } = WorkspaceKit.primitives;
  const out = createSurface({ label: key, className: 'setup-surface workspaces-record' });
  let one = null;
  const paint = () => {
    const w = workspacesRead.list().find((row) => row.name === key);
    one?.destroy(); one = null;
    out.content.replaceChildren();
    if (!w) { setSurfaceState(out.el, 'empty', t('workspaces.gone', 'This Workspace is no longer here.')); return; }
    setSurfaceState(out.el, null, '');
    out.header.title.textContent = w.title || w.name;
    one = workspaceSurface(w, { workspacesRead, launch: true, title: false, onDiscard: () => paint() });
    out.content.append(one.el);
  };
  return {
    el: out.el,
    show: () => { if (workspacesRead.list().length) paint(); else void workspacesRead.read().then(paint); },
    destroy: () => { one?.destroy(); one = null; },
  };
}

/** One Workspace on its own page (owner, 2026-11-22; KAN-784): `#/workspace/<name>`, Layer 2, the same
 * surface with the whole page's room; not a tilespace workbench. */
export function createWorkspaceRoute() {
  const host = el('div', 'workspace-route');
  const workspacesRead = createWorkspacesRead();
  let name = '';
  let one = null;
  const paint = () => {
    const w = workspacesRead.list().find((row) => row.name === name);
    one?.destroy(); one = null;
    if (!w) { host.replaceChildren(el('p', 'fs-step-help', workspacesRead.list().length ? t('workspaces.gone', 'This Workspace is no longer here.') : t('workspaces.reading', 'Reading…'))); return; }
    one = workspaceSurface(w, { workspacesRead, onDiscard: () => paint() });
    host.replaceChildren(one.el);
    S.refreshWorkspaceHeader?.();
    S.workspace?.refreshTitle?.();
  };
  const title = () => workspacesRead.list().find((row) => row.name === name)?.title || name;
  return {
    el: host,
    title, place: title,
    enter: (context) => {
      if (context.param !== name || !one) { name = context.param; void workspacesRead.read().then(paint); paint(); }
    },
    leave: () => {},
    destroy: () => { one?.destroy(); one = null; },
  };
}

/** New Workspace: the empty page in a tilespace; once created, that tilespace holds the new Workspace. */
export function createWorkspaceNew({ workspacesRead, place }) {
  const { createSurface } = WorkspaceKit.primitives;
  const out = createSurface({ label: t('workspaces.new', 'New Workspace'), className: 'setup-surface workspaces-new' });
  const paint = () => {
    const page = workspacePage(null, { taken: () => workspacesRead.list().map((w) => w.name), onSaved: async (saved) => {
      await workspacesRead.read();
      place(saved.name);
    }, onDiscard: () => paint() });
    out.header.actions.replaceChildren(page.action.el, page.discard.el);
    out.content.replaceChildren(page.el);
  };
  return { el: out.el, show: paint, destroy: () => {} };
}
