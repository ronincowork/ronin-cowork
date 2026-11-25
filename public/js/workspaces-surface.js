/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACES WORKBENCH'S SURFACES (owner, 2026-11-02; KAN-728; KAN-784). The Workspace is the organizing
 * principle: Ronin keeps no folder list of its own, and a folder or repository is a row of its
 * Workspace record (src/workspaces.ts). Tilespace 1 holds the Workspaces (`createWorkspaceStones`), each
 * stone in the Epic and Team stones' grammar (KAN-801). A pressed one opens beside them as one Workspace
 * (`workspaceSurface`), in the opened Team's bar: a toggle, Work (its Teams or Epics, to drill into) or
 * Config (`workspacePage`: Describe, Where it lives, and More, folded; Archive
 * under ⋯), and Launch to its own page, `#/workspace/<name>` (`createWorkspaceRoute`), in a new tab. A stone dragged or a card placed opens it whole in
 * a tilespace (`createWorkspaceRecord`); New Workspace is a dotted card (`createWorkspaceNew`). A folder
 * link dragged in from Files (`/files/<path under home>`, KAN-146) adds that folder.
 */
import { openCanvas } from './canvas-view.js';
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { createBriefSettingsPanel, layerLinks } from './brief-step.js';
import { createPhalanx } from './phalanx.js';
import { request } from './request.js';
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { KINDS, kindWord, ruledRows } from './glyphs.js';
import { createMenuButton } from './menu.js';
import { subscribe as subscribeTeams, teamsFromState } from './team-controller.js';
import { createEpicStones, createEpicsRead } from './epics-surface.js';
import { createTeamRosterSurface } from './team-roster-surface.js';
import { createTeamOne } from './team-one.js';
import { teamEpicIds } from './team-epics.js';
import { isOpenEpic } from './epic-stage.js';
import { listedTeam } from './roster-groups.js';
import { openWorkspaceTab } from './workspace.js';
import { S } from './state.js';
import { createLifecycle, createStoneMarks, statusKey } from './item-lifecycle.js';
import { createWorkspacesRead } from './workspaces-read.js';
import { SURFACE_DRAG } from './workbench.js';

const status = () => { const line = el('div', 'pr-status'); line.setAttribute('role', 'status'); return line; };
const sayInto = (line) => (message, bad) => { line.replaceChildren(); if (!message) return; const p = el('div', `pr-empty${bad ? ' bad' : ''}`, message); line.append(p); };


const pinName = (title, taken) => {
  const base = String(title).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 60) || 'workspace';
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
  return name;
};

/** A Workspace's page in the launch forms' format, made plain for someone new (KAN-728); a made one's is
 * its Config (KAN-784). In the order the owner set (2026-11-24; w926): 1 Describe, its objective (and a
 * new one's Name); 2 Where it lives, each folder a name and its path, a repository's remote in a line
 * under it and how Agents work in it (Desks or Direct), with Add a repository (into its repos/; KAN-809);
 * 3 More, folded: instructions, Mode, plans, canvases, Integrations and Behaviors. Then Create. The folders are the record's rows, saved with it.
 * `null` is a new Workspace. Returns the page, its Save (Create) action and, made, its ⋯ for the head. */
export function workspacePage(w, { taken = () => [], onSaved = () => {}, onDiscard = () => {} }) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const isNew = !w;
  const draft = w ? JSON.parse(JSON.stringify(w)) : { name: '', title: '', kind: 'open', objective: '', instructions: '', repos: [], folders: [], launch_mode: 'live_dangerously', integrations: [] };
  if (!Array.isArray(draft.integrations)) draft.integrations = [];
  const page = el('div', 'ntf-form fs-steps workspace-form');
  // The page's own status line, first under its head: what Save, a tick or Clone answered.
  const line = status();
  line.classList.add('workspace-status');
  const say = sayInto(line);
  const text = (value, onInput, placeholder = '') => { const i = el('input'); i.type = 'text'; i.value = value; i.placeholder = placeholder; i.addEventListener('input', () => onInput(i.value)); return i; };
  const area = (value, onInput) => { const a = el('textarea'); a.rows = 4; a.value = value; a.addEventListener('input', () => onInput(a.value)); return a; };
  const open = { top: true, agents: false, locations: true, adding: '' }; // adding: '' | 'repo'
  // EVERY EDIT WAITS FOR SAVE (owner, 2026-11-02): a change lights Save (kaki, what needs you) and
  // the − beside it, which throws the changes away back to the saved Workspace.
  let dirty = false;
  const changed = () => { dirty = true; action.el.dataset.attention = 'true'; discard.setDisabled(false); };
  const settled = () => { dirty = false; delete action.el.dataset.attention; discard.setDisabled(true); };
  const MODES = { configured: t('launch_mode.configured', 'Native'), live_dangerously: t('launch_mode.live', 'Dangerously') };

  /* ---- 1 · Describe (owner, 2026-11-24; w926; SETUP_SWEEP.md §7): what the project is, its objective,
     the one place that says so; a new one's Name follows it until the Name is typed (the handle Teams
     use is made from the Name, KAN-728) ---- */
  const stepTop = createStep({ n: 1, key: 'top', title: t('workspaces.describe', 'Describe') });
  let nameTyped = false;
  const nameFrom = (objective) => objective.trim().split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, '');
  const nameInput = isNew ? text('', (v) => { nameTyped = !!v.trim(); draft.title = v.trim(); draft.name = draft.title ? pinName(draft.title, new Set(taken())) : ''; changed(); }, t('workspaces.name_placeholder', 'Such as Website or Accounts')) : null;
  stepTop.body.append(createField({ label: t('workspaces.objective_ask', 'What are you working on?'), control: area(draft.objective, (v) => {
    draft.objective = v;
    if (nameInput && !nameTyped) { draft.title = nameFrom(v); nameInput.value = draft.title; draft.name = draft.title ? pinName(draft.title, new Set(taken())) : ''; }
    changed();
  }) }).el);
  if (nameInput) stepTop.body.append(createField({ label: t('workspaces.name', 'Name'), control: nameInput }).el);
  // ITS KIND (owner, 25 Nov): asked on Setup's Workspace step; a made one changes it here.
  if (!isNew) stepTop.body.append(ask([{ fields: [{ key: 'kind', label: t('workspaces.kind', 'Kind'), shape: 'square', options: ruledRows('kind', KINDS, kindWord) }] }],
    { value: { kind: draft.kind || 'open' }, density: 'tight', onChange: (value) => { draft.kind = value.kind; changed(); paint(); } }).el);

  /* ---- 3 · More, folded: what every Agent in it is told (instructions), the Mode they launch in,
     where its plans live, its integrations and Behaviors ---- */
  const stepAgents = createStep({ n: 3, key: 'agents', title: t('workspaces.more_settings', 'More'), onToggle: () => { open.agents = !open.agents; paint(); } });
  stepAgents.body.append(createField({ label: t('workspaces.instructions', 'Instructions'), control: area(draft.instructions, (v) => { draft.instructions = v; changed(); }) }).el);

  const mode = ask([{ fields: [
    { key: 'launch_mode', label: t('launch_mode.mode', 'Mode'), options: [
      { v: 'configured', l: MODES.configured, sub: t('launch_mode.configured_sub', 'Do not override the provider CLI’s approval behavior. Model selection is separate.') },
      { v: 'live_dangerously', l: MODES.live_dangerously, sub: t('workspaces.live_sub', 'Each provider’s own approval-bypass launch; Native where a provider has none.') },
    ] },
  ] }], { value: { launch_mode: draft.launch_mode }, density: 'tight', onChange: (value) => { draft.launch_mode = value.launch_mode; changed(); paint(); } });
  stepAgents.body.append(mode.el);

  /* ---- 5 · Behaviors (docs/architecture/brief.md, Where it is set in the UI): what every Agent in this Workspace is told — its add, block
     and only lists and project management; its integrations are step 3. A created Workspace only (above). ---- */
  const brief = isNew ? null : createBriefSettingsPanel({ layer: 'workspace', id: draft.name, ownSave: false, showIntegrations: false, onChange: () => changed(),
    preview: { workspace: draft.name }, linkFor: layerLinks() });

  /* ---- 3 · Integrations (KAN-338): the outside services this Workspace uses, from the integrations
     list (the bridges); each row a provider, with a field for each fact its bridge names (`facts: site`), saved
     into the row as {provider, site}; any other fact is kept as it is. Agents read them
     on the Team's Workspace line, and ask for its keys with `secret ask`. ---- */
  const integrationRows = el('div', 'workspace-locations workspace-integrations');
  const addIntegration = el('select', 'workspace-integration-add');
  const integrationsBox = el('div', 'workspace-more-integrations');
  integrationsBox.append(el('b', null, t('workspaces.integrations', 'Integrations')), integrationRows, addIntegration,
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

  /* ---- 2 · Where it lives (owner, 25 Nov; KAN-809): its folder and its repositories, a row each. Add a
     repository clones one into its repos/ (a Git URL, or one of theirs once GitHub is signed in). Folders
     are Explorer's: nothing here walks, finds or makes one. ---- */
  const stepLocations = createStep({ n: 2, key: 'locations', title: t('workspaces.where_it_lives', 'Where it lives'), onToggle: () => { open.locations = !open.locations; paint(); } });
  // The record's rows, by dir: a repository row carries how Agents work in it (mode, working, stable,
  // desks) and its remote (GET /api/workspaces) for the line under it. Names are Ronin's, made on Save.
  const picked = new Map([...draft.repos.map((row) => ({ ...row, repo: true })), ...draft.folders.map((row) => ({ ...row, repo: false }))].map((row) => [row.dir, row]));
  const short = (dir) => dir.replace(/^\/(?:home\/[^/]+|root)(?=\/|$)/, '~');
  const rows = el('div', 'workspace-locations');
  const tools = el('div', 'workspace-location-tools');
  const addRepo = createAction({ label: t('workspaces.add_repository', 'Add a repository'), kind: 'primary', size: 'compact', action: () => {
    open.adding = open.adding ? '' : 'repo'; paint(); if (open.adding) void listMine();
  } });
  tools.append(addRepo.el);
  tools.hidden = isNew;
  const repoPanel = el('div', 'workspace-browser');
  const plansBox = el('div', 'workspace-plans'); // PLANS (KAN-256), in Agent info; declared before it is placed
  stepLocations.body.append(tools, repoPanel, rows);
  if (isNew) stepLocations.body.append(el('p', 'fs-step-help', t('workspaces.repos_after', 'Create makes its folder, ~/ronin/<name>, with plans, files and repos in it; then add its repositories here.')));
  stepAgents.body.append(plansBox, integrationsBox);
  if (brief) { stepAgents.body.append(el('b', null, t('behaviours', 'Behaviors')), el('p', 'fs-step-help', t('workspaces.brief_help', 'What every Agent in this Workspace is told. Agents already working are sent the change.')), brief.el); void brief.enter(); }

  const save = async () => {
    if (isNew && !draft.name) { say(t('workspaces.describe_needed', 'Say what you are working on, or give it a name.'), true); return false; }
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
    reviewed: t('workspaces.mode_desks_sub', 'Each Agent works on its own desk and hands its work in to the Team lead, who checks it and promotes it to the repository’s dev.'),
    direct: t('workspaces.mode_direct_sub', 'Every Agent works in the repository’s one checkout and commits straight to it; no hand-in, no check.'),
  };
  const repoMode = (row) => {
    const question = ask([{ fields: [{ key: 'mode', label: t('workspaces.repo_mode', 'Mode'), options: [
      { v: 'reviewed', l: t('workspaces.mode_desks', 'Desks'), sub: MODE_SUBS.reviewed },
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
     is its own folder, <workspace>/plans (~/ronin/<workspace>/plans; w926), said "recommended";
     pressed, it picks that or any of the Workspace's Locations and a subfolder. On Save the plans move there; a plan of the same name already
     there stops the Save, so one file never overwrites another. ---- */
  const OWN = '~own'; // the Workspace's own folder: no plans setting (a held folder's name never starts with ~)
  let plansOpen = false;
  const placeWords = () => {
    if (draft.plans?.location) return { where: `${draft.plans.location}/${draft.plans.path}`.replace(/\/$/, ''), recommended: false };
    const place = w?.plans_place?.recommended ? w.plans_place : null;
    return { where: place ? `${place.location}/${place.path}` : `${draft.name || '<workspace>'}/plans`, recommended: true };
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
    const names = [...new Set([...picked.values()].map((row) => row.name).filter(Boolean))];
    const options = [{ v: OWN, l: t('workspaces.plans_own', 'Its own folder') }, ...names.map((name) => ({ v: name, l: name }))];
    const chosen = draft.plans?.location || OWN;
    const question = ask([{ fields: [{ key: 'location', label: t('workspaces.plans_location', 'Location'), options }] }], {
      value: { location: chosen }, density: 'tight',
      onChange: (value) => {
        const location = value.location;
        // Its own folder is the recommended place itself; another Location starts at its plans folder.
        draft.plans = location === OWN ? undefined : { location, path: location === draft.plans?.location ? draft.plans.path : 'plans' };
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
    if (!picked.size) rows.append(el('p', 'fs-step-help', t('workspaces.folders_none', 'Nothing yet.')));
    for (const [dir, folder] of picked) {
      const { note } = folder;
      const name = folder.name || dir.split('/').filter(Boolean).pop() || dir;
      const repo = folder.repo ? { remote: folder.remote || '' } : null;
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
  // ADD A REPOSITORY: cloned into this Workspace's repos/ and on its record at once, on Desks
  // (POST /api/workspaces/<name>/repos); its row joins the page without touching unsaved edits.
  const repoName = (value) => (value.trim().replace(/\.git$/, '').replace(/\/+$/, '').split(/[/:]/).pop() || '');
  const addOne = async (url, button) => {
    button.disabled = true;
    say(t('workspaces.cloning_named', 'Cloning {name} into repos/…', { name: repoName(url) }));
    const answer = await request(`/api/workspaces/${encodeURIComponent(draft.name)}/repos`, { method: 'POST', json: { repository: url } });
    button.disabled = false;
    if (!answer.ok) { say(answer.message, true); return; }
    const row = answer.data.workspace.repos.find((one) => one.dir === answer.data.dir);
    if (row) picked.set(row.dir, { ...row, repo: true });
    say(t('workspaces.cloned', 'Cloned {name}.', { name: repoName(url) }));
    open.adding = ''; repository.value = '';
    paint();
    onSaved(answer.data.workspace);
  };
  const repository = text('', () => {}, t('workspace_add.repository_placeholder', 'https://… or git@… ; owner/repo for GitHub'));
  const clone = el('button', 'wk-btn', t('workspaces.clone_here', 'Clone')); clone.type = 'button';
  clone.addEventListener('click', () => { if (repository.value.trim()) void addOne(repository.value.trim(), clone); });
  const cloneLine = el('div', 'workspace-clone');
  cloneLine.append(repository, clone);
  // Theirs on GitHub, once it is signed in here (GET /api/setup/github/repos), each with Use.
  const mineList = el('div', 'workspace-mine-list');
  const listMine = async () => {
    mineList.replaceChildren();
    const answer = await request('/api/setup/github/repos', { cache: 'no-store' });
    if (!answer.ok) return;
    mineList.replaceChildren(...(answer.data.repos || []).map((repo) => {
      const line = el('div', 'workspace-location');
      const use = el('button', 'wk-btn', t('workspaces.use', 'Use')); use.type = 'button';
      use.addEventListener('click', () => void addOne(repo.url, use));
      const where = el('div', 'workspace-location-where');
      where.append(el('b', null, repo.name), el('small', 'workspace-location-repo', repo.private ? t('workspaces.private', 'private') : ''));
      line.append(where, use);
      return line;
    }));
  };
  const doneButton = el('button', 'wk-btn', t('workspaces.done', 'Done')); doneButton.type = 'button';
  doneButton.addEventListener('click', () => { open.adding = ''; paint(); });
  const panelHead = el('div', 'workspace-browser-head');
  panelHead.append(el('span', 'fs-step-help', t('workspaces.add_repository_help', 'A Git URL from any host; a public one needs no sign-in. Signed in to GitHub, yours are listed under it.')), doneButton);
  repoPanel.append(panelHead, cloneLine, mineList);

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
    stepTop.setCollapsed(false, '', false);
    paintIntegrations();
    stepLocations.setCollapsed(!open.locations, picked.size === 1 ? t('workspaces.one_folder', '1 folder') : t('workspaces.folders_n', '{n} folders', { n: picked.size }), true);
    repoPanel.hidden = open.adding !== 'repo';
    addRepo.el.setAttribute('aria-pressed', String(open.adding === 'repo'));
    paintRows();
    paintPlans();
  }
  // A NEW WORKSPACE (owner, 2026-11-23: not just a name) is the made one's page with its Name first:
  // Folders, Integrations and Agent info, then Create. Behaviors are read and written against a saved
  // Workspace (/api/brief/settings/workspace/<name>), so they wait: Create opens the made Workspace
  // with its Configuration open, Behaviors in it.
  page.append(line, stepTop.el, stepLocations.el, stepAgents.el);
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
 * THE TEAMS OF A WORKSPACE (KAN-801): the Teams stones themselves, bare and fixed to this Workspace
 * (team-roster-surface.js), as workspaceEpics takes the Epic stones. Pressed, a Team opens under them
 * as the Teams page opens it (team-one.js createTeamOne): its bar with Launch, its Agents and Epics.
 * One open at a time: the last one shown is let go when another opens or this goes.
 */
function workspaceTeams(w) {
  const host = el('div', 'workspace-teams');
  const empty = el('p', 'fs-step-help', t('workspaces.no_teams', 'No Team works in this Workspace yet.'));
  let shown = null;
  const teamDetail = (name) => { shown?.destroy?.(); shown = createTeamOne(name); return shown; };
  const stones = createTeamRosterSurface({ bare: true, roots: [w.name], teamDetail });
  host.append(empty, stones.el);
  const paint = () => { empty.hidden = Boolean(teamsIn(w).length); };
  const stop = subscribeTeams(paint);
  paint();
  stones.render();
  return { el: host, destroy: () => { stop?.(); shown?.destroy?.(); shown = null; stones.destroy(); } };
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

// What a Workspace surface showed open, kept while the page is open (`${name}\0${fold}` -> open).
const foldsOpen = new Map();

/**
 * ONE WORKSPACE (owner, 2026-11-23; KAN-784; KAN-801): an opened Team's grammar (cowork-view.js
 * leagueTeamBody). Its bar: the name with Launch, its objective in full, the shared lifecycle line
 * along its foot over what its Teams and their Agents hold. Pressing the bar opens its Configuration
 * under it (workspacePage: Folders, Integrations, Agent info, Behaviors, its Save, − and ⋯); pressing
 * again closes it. Below, lines that expand and collapse, each with its count: Teams (the Teams
 * stones), Epics (the Epic stones) and Document (its one doc, never under Configuration). The same
 * surface on the Workspaces stones, in a tilespace and on its own route; `launch` adds Launch,
 * `title` its name (a tilespace's header has it).
 */
function workspaceSurface(w, { workspacesRead, onDiscard = () => {}, launch = false, title = true }) {
  const main = el('div', 'league-team-edit-content workspace-one');
  const top = el('div', 'epic-detail team-detail');
  const actions = el('span', 'item-bar-state team-bar-actions');
  if (launch) actions.append(workspaceLaunch(w.name).el);
  const head = el('span', 'item-bar-head team-bar-head');
  head.append(...(title ? [el('span', 'item-bar-title team-bar-title', w.title || w.name)] : []), actions);
  const objective = el('span', 'item-bar-objective team-bar-objective', String(w.objective || '').trim());
  objective.hidden = !objective.textContent;
  const line = createLifecycle('line');
  const bar = el('div', 'item-bar item-bar-lean team-bar team-bar-pressable workspace-bar');
  bar.append(head, objective, line.el);
  // ITS CONFIGURATION, under the bar (owner, 2026-11-23: as the Team's and the Epic's).
  const config = el('div', 'league-team-view team-config-open workspace-config');
  let page = null;
  const openConfig = (open) => {
    config.hidden = !open;
    foldsOpen.set(`${w.name}\0config`, open);
    bar.setAttribute('aria-expanded', String(open));
    if (open && !page) {
      page = workspacePage(w, { onSaved: () => void workspacesRead.read(), onDiscard });
      const tools = el('div', 'workspace-page-actions workspace-config-actions');
      tools.append(page.action.el, page.discard.el, page.more.el);
      config.append(tools, page.el);
    }
  };
  bar.setAttribute('role', 'button');
  bar.tabIndex = 0;
  bar.title = t('workspaces.config_toggle', 'Open or close this Workspace\'s configuration');
  bar.addEventListener('click', (event) => { if (!event.target.closest('button, a, .lifecycle')) openConfig(config.hidden); });
  bar.addEventListener('keydown', (event) => { if (event.target === bar && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openConfig(config.hidden); } });
  openConfig(foldsOpen.get(`${w.name}\0config`) === true);
  top.append(bar, config);
  // A FOLD (the Team's): a line naming what is under it, its count in brackets; built when first opened.
  const built = [];
  const fold = (key, label, build, openFirst) => {
    const node = el('details', `team-fold team-fold-${key}`);
    const summary = el('summary', 'team-fold-line', label);
    const body = el('div', `team-fold-body league-team-view league-team-view-epics workspace-fold-${key}`);
    node.append(summary, body);
    let made = null;
    const make = () => { if (made) return; made = build(); built.push(made); body.append(made.el); };
    node.open = foldsOpen.get(`${w.name}\0${key}`) ?? openFirst;
    node.addEventListener('toggle', () => { foldsOpen.set(`${w.name}\0${key}`, node.open); if (node.open) make(); });
    if (node.open) make();
    return { node, count: (n) => { const words = `${label} (${n})`; if (summary.textContent !== words) summary.textContent = words; } };
  };
  const teams = fold('teams', t('campaign.coworks', 'Teams'), () => workspaceTeams(w), true);
  const epics = fold('epics', t('workspaces.epics', 'Epics'), () => workspaceEpics(w), true);
  const every = createEpicsRead(() => '');
  const recount = () => {
    line.update(itemsIn(w));
    teams.count(teamsIn(w).length);
    const mine = new Set(teamsIn(w).flatMap((team) => [...teamEpicIds(team)]));
    epics.count(every.list().filter((epic) => mine.has(epic.id) && isOpenEpic(epic)).length);
  };
  const stopTeams = subscribeTeams(recount);
  const stopEpics = every.subscribe(recount);
  recount();
  main.append(top, teams.node, epics.node);
  return { el: main, destroy: () => { stopTeams?.(); stopEpics?.(); for (const one of built) one.destroy?.(); page?.destroy?.(); } };
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
        const page = workspacePage(null, { taken: () => workspacesRead.list().map((w) => w.name), onSaved: async (saved) => { await workspacesRead.read(); foldsOpen.set(`${saved.name}\0config`, true); stones.select(saved.name); }, onDiscard: () => stones.refreshDetail() });
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
        const marker = one.marks.update(items, { size: teamsIn(w).length });
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
      foldsOpen.set(`${saved.name}\0config`, true); // its Configuration open, Behaviors in it
      place(saved.name);
    }, onDiscard: () => paint() });
    out.header.actions.replaceChildren(page.action.el, page.discard.el);
    out.content.replaceChildren(page.el);
  };
  return { el: out.el, show: paint, destroy: () => {} };
}
