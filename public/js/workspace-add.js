/* part of the ronin-cowork client — see js/README.md */
/**
 * ADD A WORKSPACE (owner, 2026-10-21; Lab wip/buildouts/ADD_A_WORKSPACE.md). One surface in the
 * launch forms' sections (createStep), never a walk-through: four sections, the same in every path
 * (owner, 2026-10-22: "package all the git and github options intelligently into 1 section").
 *   1 How   · three cards — New folder · A folder on this machine · From GitHub
 *   2 Name  · prefilled from the folder or repository once there is one
 *   3 Where · location only: where the new folder goes, the folder you choose, or the
 *             repository and where it lands. Nothing about Git here.
 *   4 Git   · a folder that already has Git (a chosen repository, a GitHub clone) is read in
 *             one line — "Git · on this machine", "Git · GitHub owner/repo" — and nothing is
 *             asked. Otherwise one question: None · On this machine · On this machine and
 *             GitHub (default: On this machine); the answer decides whether Git starts. When
 *             Git is on: How Agents work here, folded with its default and a line per option.
 *             Only for "and GitHub": Private/Public and the sign-in line. None is an ordinary
 *             folder: nothing more is asked, Git is not started.
 * Own desks need Git, not GitHub; GitHub only adds the remote copy. Add sits in the tile head
 * like Launch. It opens under a Workspace's Locations as Add a location (workspaces-surface.js);
 * the folder it adds is registered and picked in that Workspace (owner, 2026-11-02).
 */
import { WorkspaceKit } from './workspace-kit.js';
import { createStep, el } from './form-steps.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { status } from './ui.js';
import { loadProjects } from './home.js';
import { finalizeTeamName, sanitizeTeamName } from './new-team-draft.js';
import { t } from './lexicon.js';

const HOW = {
  desks: { mode: 'reviewed', worktrees: 'enabled', working: 'dev', stable: 'master' },
  folder: { mode: 'direct', worktrees: 'disabled', working: '', stable: 'main' },
};
const howOf = (profile) => (profile?.worktrees === 'enabled' || profile?.mode === 'reviewed' ? 'desks' : 'folder');
const howWord = (key, stable) => key === 'desks'
  ? t('workspace_add.how_desks_read', 'Each Agent in its own desk, reviewed · dev → master')
  : t('workspace_add.how_folder_read', 'Everyone in this one folder · {branch}', { branch: stable || 'main' });
/** `owner/repo` out of what a person typed or what origin says; anything else reads as typed. */
const repoWord = (text) => {
  const hit = /github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(String(text || '').trim());
  return hit ? hit[1] : String(text || '').trim().replace(/\.git$/, '');
};
const nameOf = (dir) => finalizeTeamName(sanitizeTeamName(String(dir || '').split('/').filter(Boolean).pop() || '')).slice(0, 32);

/** The folders on this machine from the home folder: crumbs and one list; `choose` adds the verb.
 *  A folder that is already a workspace is left out, and so is everything inside it, until Show all. */
function browser({ choose, onChoose, onMove }) {
  const shell = el('div', 'wa-browser');
  const crumbs = el('div', 'folder-crumbs');
  const list = el('div', 'folder-list');
  const more = el('button', 'wa-link folder-all'); more.type = 'button';
  shell.append(crumbs, list, more);
  let current = '';
  let home = '';
  let all = false;
  more.addEventListener('click', () => { all = !all; void load(); });
  const load = async (dir = current) => {
    const result = await request(`/api/folders?${new URLSearchParams(dir ? { dir } : {})}`, { cache: 'no-store' });
    if (!result.ok) { list.replaceChildren(el('span', 'bad', result.message)); return; }
    current = result.data.dir; home = result.data.home;
    onMove?.(current);
    crumbs.replaceChildren();
    const crumb = (label, at) => { const b = el('button', null, label); b.type = 'button'; b.addEventListener('click', () => load(at)); crumbs.append(b); };
    crumb(t('folders.home', 'Home'), home);
    let at = home;
    for (const part of current === home ? [] : current.slice(home.length + 1).split('/')) { crumbs.append(document.createTextNode('/')); at += '/' + part; crumb(part, at); }
    list.replaceChildren();
    const folders = result.data.folders.filter((folder) => all || !folder.registered_root);
    for (const folder of folders) {
      const row = el('div', 'folder-row');
      const open = el('button', 'folder-open', folder.name); open.type = 'button'; open.addEventListener('click', () => load(folder.dir));
      const note = [folder.repository ? t('workspace_add.git', 'Git') : '', folder.registered_root ? t('workspace_add.already', 'already a workspace') : ''].filter(Boolean).join(' · ');
      if (note) open.append(el('small', 'folder-kind', note));
      row.append(open);
      if (choose && !folder.registered_root) {
        const pick = el('button', 'folder-choose', t('workspace_add.choose', 'Choose')); pick.type = 'button';
        pick.addEventListener('click', () => onChoose(folder.dir));
        row.append(pick);
      }
      list.append(row);
    }
    if (!folders.length) list.append(el('span', 'folder-empty', t('folders.empty', 'No matching folders here.')));
    const hidden = result.data.folders.length - folders.length;
    more.hidden = !hidden && !all;
    more.textContent = all ? t('workspace_add.show_fewer', 'Show fewer') : t('workspace_add.show_all', 'Show all · {n} already a workspace', { n: hidden });
  };
  void load('');
  return { el: shell, current: () => current };
}

export function createWorkspaceAdd({ campaignId, placeFolder, signIn }) {
  const { createAction, createField, createSurface } = WorkspaceKit.primitives;
  const draft = { method: 'new', dir: '', repository: '', name: '', nameTouched: false, repo: null, profile: null, git: 'local', how: 'desks', where: '', visibility: 'private' };

  const add = createAction({ label: t('roots.add_save', 'Add'), launch: true, size: 'compact', disabled: true, action: () => void doAdd() });
  const surface = createSurface({ label: t('workspaces.add_location', 'Add a location'), className: 'setup-surface wa-surface', actions: [add] });
  surface.header?.el.classList.add('launch-form-head');
  surface.content.classList.add('wa-content');
  const form = el('div', 'fs-steps wa-form');
  const word = status('wa-status');
  surface.content.append(form, word.el);

  /* ---- 1 · How: the method, three cards ---- */
  const stepHow = createStep({ n: 1, key: 'how', title: t('workspace_add.method', 'How') });
  const cards = el('div', 'fs-pair');
  const METHODS = () => [
    { key: 'new', label: t('workspace_add.method_new', 'New folder'), sub: t('workspace_add.method_new_sub', 'A new idea: a folder made for it on this machine.') },
    { key: 'here', label: t('workspace_add.method_here', 'A folder on this machine'), sub: t('workspace_add.method_here_sub', 'A folder that is already here.') },
    { key: 'github', label: t('workspace_add.method_github', 'From GitHub'), sub: t('workspace_add.method_github_sub', 'A repository, cloned onto this machine.') },
  ];
  const paintCards = () => {
    cards.replaceChildren();
    for (const method of METHODS()) {
      const box = el('button', 'fs-way');
      box.type = 'button';
      box.setAttribute('aria-pressed', String(draft.method === method.key));
      box.append(el('b', null, method.label), el('small', null, method.sub));
      box.addEventListener('click', () => { draft.method = method.key; reset(); paint(); });
      cards.append(box);
    }
  };
  stepHow.body.append(cards);

  /* ---- 2 · Name ---- */
  const stepName = createStep({ n: 2, key: 'name', title: t('workspace_add.name', 'Name') });
  const nameInput = el('input');
  nameInput.type = 'text'; nameInput.maxLength = 32; nameInput.autocomplete = 'off'; nameInput.spellcheck = false; nameInput.autocapitalize = 'off';
  nameInput.addEventListener('input', () => {
    const caret = nameInput.selectionStart;
    nameInput.value = sanitizeTeamName(nameInput.value).slice(0, 32);
    nameInput.setSelectionRange(caret, caret);
    draft.name = nameInput.value; draft.nameTouched = true; paintAdd();
  });
  nameInput.addEventListener('blur', () => { nameInput.value = finalizeTeamName(nameInput.value).slice(0, 32); draft.name = nameInput.value; paintAdd(); });
  stepName.body.append(createField({ label: t('workspace_add.name_label', 'Name · required'), control: nameInput }).el, el('p', 'fs-step-help', t('workspace_add.name_help', 'Letters, digits, - and _. How Teams and Agents refer to it.')));

  /* ---- 3 · Where: the location only. The body is the method's: the browser without Choose (new),
     the browser with Choose (here), or the repository and where it lands (GitHub). ---- */
  const stepWhere = createStep({ n: 3, key: 'where', title: t('workspace_add.where', 'Where') });
  const reading = el('p', 'fs-step-help wa-reading');
  const whereReading = el('p', 'fs-step-help');
  let picker = null;
  let placer = null;
  const repoInput = el('input');
  repoInput.type = 'text'; repoInput.placeholder = t('workspace_add.repository_placeholder', 'owner/repo or a github.com link'); repoInput.autocomplete = 'off'; repoInput.spellcheck = false;
  repoInput.addEventListener('input', () => { draft.repository = repoInput.value.trim(); if (!draft.nameTouched) draft.name = nameOf(draft.repository.replace(/\.git$/, '')); paint(); });
  const repoField = createField({ label: t('workspace_add.repository_label', 'GitHub repository'), control: repoInput }).el;
  const cloneLine = el('p', 'fs-step-help', t('workspace_add.clone_where', 'It will be cloned into ~/ronin/<repo> on this machine.'));
  const signin = el('p', 'fs-step-help wa-signin');
  let github = null;
  const readGithub = async () => {
    const result = await request('/api/setup/github', { cache: 'no-store' });
    github = result.ok ? result.data : null;
    paintSignin();
  };
  const paintSigninInto = (target, needs) => {
    target.replaceChildren();
    if (!github) return;
    if (github.authenticated) { target.textContent = t('workspace_add.signed_in', 'Signed in to GitHub as {account}.', { account: github.account }); return; }
    target.append(document.createTextNode(needs));
    const link = el('button', 'wa-link', github.installed ? t('workspace_add.sign_in', 'Sign in to GitHub') : t('workspace_add.install_sign_in', 'Install GitHub CLI and sign in'));
    link.type = 'button';
    link.addEventListener('click', () => signIn());
    target.append(link);
  };
  const paintSignin = () => {
    paintSigninInto(signin, t('workspace_add.private_needs', 'Private repositories need a sign-in · '));
    paintSigninInto(gitSignin, t('workspace_add.publish_needs', 'Creating it on GitHub needs a sign-in · '));
  };

  /* ---- 4 · Git: the reading when there is nothing to ask, else the one question; inside it
     How Agents work here (folded) when Git is on, Visibility and the sign-in line for GitHub. ---- */
  const stepGit = createStep({ n: 4, key: 'git', title: t('workspace_add.git', 'Git') });
  const gitReading = el('p', 'fs-step-help wa-reading');
  const gitQuestion = ask([{ fields: [
    { key: 'git', label: t('workspace_add.git', 'Git'), options: [
      { v: 'none', l: t('workspace_add.git_none', 'None'), sub: t('workspace_add.git_none_sub', 'An ordinary folder; nothing more is asked.') },
      { v: 'local', l: t('workspace_add.git_local', 'On this machine'), sub: t('workspace_add.git_local_sub', 'Git in the folder: history, branches, and desks for Agents.') },
      { v: 'github', l: t('workspace_add.git_github', 'On this machine and GitHub'), sub: t('workspace_add.git_github_sub', 'The same, plus a repository under your GitHub account: origin set, the first commit pushed.') },
    ] },
    { key: 'visibility', label: t('workspace_add.visibility', 'Visibility'), options: [
      { v: 'private', l: t('workspace_add.private', 'Private'), sub: t('workspace_add.private_sub', 'Only you and the people you invite can see it.') },
      { v: 'public', l: t('workspace_add.public', 'Public'), sub: t('workspace_add.public_sub', 'Anyone can see it.') },
    ] },
  ] }], { value: { git: draft.git, visibility: draft.visibility }, density: 'tight', onChange: (value) => { draft.git = value.git || 'local'; draft.visibility = value.visibility || 'private'; paint(); } });
  const gitSignin = el('p', 'fs-step-help wa-signin');
  let howOpen = false;
  const stepAgents = createStep({ key: 'agents', title: t('workspace_add.agents', 'How Agents work here'), onToggle: () => { howOpen = !howOpen; paint(); } });
  const HOW_OPTIONS = [
    { v: 'desks', l: t('workspace_add.how_desks', 'Own desks'), sub: t('workspace_add.how_desks_sub', 'Each Agent in its own desk; work is reviewed before it lands: hand-ins on dev, the lead promotes to master.') },
    { v: 'folder', l: t('workspace_add.how_folder', 'One folder'), sub: t('workspace_add.how_folder_sub', 'Everyone works in this one folder on its branch; no review.') },
  ];
  const howQuestion = ask([{ fields: [{ key: 'how', label: t('workspace_add.agents_label', 'Agents work'), options: HOW_OPTIONS }] }],
    { value: { how: draft.how }, density: 'tight', onChange: (value) => { draft.how = value.how; paint(); } });
  // The stone carries the name; the line under it says what each option is, so the open section reads without opening the tray.
  const howHelp = el('p', 'fs-step-help');
  HOW_OPTIONS.forEach((option, i) => { if (i) howHelp.append(el('br')); howHelp.append(el('b', null, `${option.l} · `), option.sub); });
  stepAgents.body.append(howQuestion.el, howHelp);
  stepGit.body.append(gitReading, gitQuestion.el, gitSignin, stepAgents.el);

  form.append(stepHow.el, stepName.el, stepWhere.el, stepGit.el);

  const reset = () => {
    Object.assign(draft, { dir: '', repository: '', name: '', nameTouched: false, repo: null, profile: null, git: 'local', how: 'desks', where: '', visibility: 'private' });
    repoInput.value = ''; nameInput.value = ''; reading.textContent = '';
    howQuestion.set('how', 'desks'); gitQuestion.set({ git: 'local', visibility: 'private' });
    picker = null; placer = null;
    stepWhere.body.replaceChildren();
  };

  const chosen = async (dir) => {
    draft.dir = dir;
    if (!draft.nameTouched) draft.name = nameOf(dir);
    reading.textContent = t('workspace_add.inspecting', 'Reading the folder…');
    paint();
    const inspected = await request(`/api/project-roots/inspect?dir=${encodeURIComponent(dir)}`, { cache: 'no-store' });
    if (draft.dir !== dir) return;
    if (!inspected.ok) { reading.textContent = inspected.message; draft.repo = null; paint(); return; }
    draft.repo = inspected.data.repo || null;
    draft.profile = inspected.data.arrangement?.source === 'absent' ? null : (inspected.data.repo_profile || null);
    draft.how = draft.profile ? howOf(draft.profile) : 'desks';
    howQuestion.set('how', draft.how);
    const bits = [dir];
    if (inspected.data.project_context?.length) bits.push(t('workspace_add.instructions', 'instructions found ({files})', { files: inspected.data.project_context.join(', ') }));
    reading.textContent = bits.join(' · ');
    paint();
  };

  // The Git section reads when there is nothing to ask: a folder that has Git already, or a GitHub clone.
  const reads = () => draft.method === 'github' || !!draft.repo;
  const hasGit = () => reads() || draft.git !== 'none';
  const wantsGithub = () => !reads() && draft.git === 'github'; // created there after the folder is a workspace
  const gitWord = () => {
    const remote = draft.method === 'github' ? draft.repository : (draft.repo?.remote || '');
    return /github\.com/.test(remote) || draft.method === 'github'
      ? [t('workspace_add.read_github', 'Git · GitHub'), repoWord(remote)].filter(Boolean).join(' ')
      : t('workspace_add.read_local', 'Git · on this machine');
  };
  const ready = () => !!draft.name && (draft.method === 'new' ? !!draft.where : draft.method === 'here' ? !!draft.dir : !!draft.repository);
  const paintAdd = () => add.setDisabled(!ready());

  function paint() {
    paintCards();
    if (!stepWhere.body.childElementCount) {
      if (draft.method === 'new') {
        placer = browser({ choose: false, onMove: (dir) => { draft.where = dir; whereReading.textContent = t('workspace_add.where_read', 'The new folder goes in {dir}', { dir }); paintAdd(); } });
        stepWhere.body.append(el('p', 'fs-step-help', t('workspace_add.where_help', 'Open a folder to put it there; Home is fine.')), placer.el, whereReading);
      } else if (draft.method === 'here') {
        picker = browser({ choose: true, onChoose: (dir) => void chosen(dir) });
        stepWhere.body.append(el('p', 'fs-step-help', t('workspace_add.folders_here', 'Folders on this machine')), picker.el, reading);
      } else {
        stepWhere.body.append(repoField, cloneLine, signin);
      }
    }
    gitReading.hidden = !reads();
    gitReading.textContent = reads() ? gitWord() : '';
    gitQuestion.show(reads() ? [] : draft.git === 'github' ? null : ['git']); // read: no stones at all
    gitSignin.hidden = !wantsGithub();
    stepAgents.el.hidden = !hasGit();
    if ((draft.method === 'github' || wantsGithub()) && !github) void readGithub();
    if (nameInput.value !== draft.name) nameInput.value = draft.name;
    const stable = draft.profile?.stable || draft.repo?.branch || 'main';
    stepAgents.setCollapsed(!howOpen, howWord(draft.how, stable));
    paintAdd();
  }

  async function doAdd() {
    if (!ready()) return;
    add.setDisabled(true);
    word.say(t('workspace_add.adding', 'Adding…'), 'busy');
    let name = draft.name;
    let result;
    if (draft.method === 'github') {
      result = await request('/api/setup/github/clone', { method: 'POST', json: { repository: draft.repository } });
      if (result.ok) {
        name = result.data.workspace.name;
        const profile = { ...HOW[draft.how], stable: draft.how === 'folder' ? 'main' : HOW.desks.stable };
        result = await request(`/api/project-roots/${encodeURIComponent(name)}/repo-profile`, { method: 'PUT', json: { profile, before: HOW.folder } });
      }
    } else {
      let dir = draft.dir;
      if (draft.method === 'new') {
        result = await request('/api/folders', { method: 'POST', json: { parent: draft.where, name: draft.name } });
        if (!result.ok) { word.say(result.message, 'bad'); paintAdd(); return; }
        dir = result.data.dir;
      }
      // The Git answer decides: Git starts in the folder (init_git) and the Agents profile goes with it; None registers the folder as it is.
      const profile = hasGit() ? { ...HOW[draft.how], stable: draft.how === 'folder' ? (draft.repo?.branch || 'main') : HOW.desks.stable } : null;
      result = await request('/api/project-roots', { method: 'POST', json: { name, dir, campaign_id: campaignId(), ...(profile ? { init_git: true, profile, before: draft.profile || HOW.folder } : {}) } });
      if (result.ok && wantsGithub()) {
        // The folder is a workspace already; if GitHub refuses, the line says so and the folder stays.
        const created = await request('/api/setup/github/create', { method: 'POST', json: { dir, visibility: draft.visibility } });
        if (!created.ok) { word.say(created.message, 'bad'); await loadProjects(); paintAdd(); return; }
      }
    }
    if (!result.ok) { word.say(result.message, 'bad'); paintAdd(); return; }
    word.say(t('workspace_add.added', 'Added.'), '');
    await loadProjects(); // the launcher's picker reads the same catalog
    placeFolder(name);
  }

  paint();
  return { el: surface.el, show: () => {}, destroy: () => { howQuestion.destroy?.(); gitQuestion.destroy?.(); } };
}
