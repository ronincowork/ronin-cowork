/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACE STEP (owner, 25 Nov; KAN-809; samurai_lab wip/SETUP_WORKSPACE.md §2): it defines what
 * a Workspace is, so any Agent that picks it up knows. One question, "How are you starting?", four
 * doors; a door pressed opens only its blanks under it, then Create. Nothing asks where things go:
 * every Workspace's folder is laid out by the rule (src/workspaces.ts layOut), its repositories in repos/.
 *
 * 1. From a Git repository: theirs on GitHub (signed in), many-of, and Git URLs pasted; each cloned.
 * 2. An existing project, not in Git: where it is coming from, many-of; each an integration row with its
 *    folder files/<source>, for the Team step's Epic to bring in. Nothing is pulled in here.
 * 3. From scratch: a new Git repository in repos/<name>; on GitHub too once signed in.
 * 4. Not sure yet: Ronin Lab, what it is and its folder, then Create (two presses).
 * Doors 1–3 ask, in order: the kind, the name, what you are working on; the door's own question; what
 * every Agent in it should follow; while there is none, Also add Ronin Lab; then Create. Every answer is
 * on the Workspace record. With no door chosen, or the chosen one pressed again: what a Workspace is.
 *
 * The Helpful Assistant hears two things from here: Connect (its stone names her) asks her to sign in
 * to GitHub; Create tells her what was made (tellHer). Nothing else messages her. Every press answers at
 * once: a pressed Create reads what it is doing until it is done.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { subscribe } from './store.js';
import { WorkspaceKit } from './workspace-kit.js';
import { KINDS, kindWord, ruledRows } from './glyphs.js';
import { openWorkspaceTab } from './workspace.js';
import { workspaceHandle } from './workspaces-surface.js';
import { sendComposerMessage } from './composer-rules.js';
import { sendPress } from './press.js';
import { IRASSHAI, IRASSHAI_NAME, askIrasshai, irasshaiLive } from './setup-irasshai.js';

/** WHAT THE PERSON MAKES REACHES HER (owner, 25 Nov; w979): at Create, one line to the Helpful
 *  Assistant, while she runs, as the person's [Button] line (press.js): the Workspace's handle and
 *  where its record is. The record says what it is; the line adds only what it cannot (a failure). */
const tellHer = (name, failed = '') => {
  if (irasshaiLive()) void sendPress(IRASSHAI, `Workspace · Created ${name}. Its record: workspace read ${name}.${failed ? ` Then: ${failed}` : ''}`);
};

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

const LAB = { name: 'ronin_lab', title: 'Ronin Lab' };
/** Its objective: one seed, which the Helpful Assistant's `workspace starter` reads too (w926). */
const STARTERS = '/content/starter-workspaces.json';
/** Door 2's sources: each an integration row on the record, its folder files/<provider>. */
const SOURCES = [
  { v: 'google_drive', l: 'Google Drive' }, { v: 'wordpress', l: 'WordPress' }, { v: 'shopify', l: 'Shopify' },
  { v: 'netlify', l: 'Netlify' }, { v: 'computer', l: t('setup_workspace.source_computer', 'Files from my computer') },
];
const repoBase = (url) => url.trim().replace(/\.git$/, '').replace(/\/+$/, '').split(/[/:]/).pop() || '';
const blank = () => ({ picked: [], pasted: '', sources: [], github: 'here', title: '', named: false, objective: '', kind: '', instructions: '', lab: false });

/**
 * WHAT A WORKSPACE IS, DRAWN (owner, 25 Nov; KAN-845): an example, said so, never pressable. Your
 * Workspaces, three boxes; you choose to work in one, drawn open: what it is about, the places things live in it, and
 * the Teams working in it.
 */
function workspaceDiagram() {
  const fig = el('figure', 'ws-diagram');
  fig.setAttribute('aria-label', t('setup_workspace.diagram_label', 'An example: three Workspaces, and the one you choose to work in, opened.'));
  const office = el('div', 'ws-diagram-office');
  const head = el('div', 'ws-diagram-head');
  head.append(el('b', null, t('setup_workspace.diagram_office', 'Your Workspaces')), el('span', 'ws-diagram-example', t('setup_workspace.diagram_example', 'Illustrative')));
  const row = el('div', 'ws-diagram-row');
  const stone = (name, open) => {
    const one = el('div', `ws-diagram-ws${open ? ' open' : ''}`);
    one.append(el('b', null, name)); // under 'Your Workspaces', the name alone (owner, 25 Nov)
    return one;
  };
  row.append(stone('Shop site', true), stone('Backend', false), stone('Ronin Lab', false));
  const opened = el('div', 'ws-diagram-detail');
  opened.append(
    el('small', null, t('setup_workspace.diagram_ws_named', 'Workspace: {name}', { name: 'Shop site' })),
    el('p', 'ws-diagram-objective', t('setup_workspace.diagram_objective', '“An online shop for handmade candles.”')),
  );
  const places = el('div', 'ws-diagram-places');
  for (const word of [t('setup_workspace.diagram_files', 'Files'), t('setup_workspace.diagram_repos', 'Repositories'), t('setup_workspace.diagram_plans', 'Plans'), t('setup_workspace.diagram_instructions', 'Instructions')]) places.append(el('span', null, word));
  const agents = el('div', 'ws-diagram-agents');
  agents.append(el('small', null, t('setup_workspace.diagram_teams', 'Teams work here:')));
  for (const name of ['marketing', 'operations', 'shopify_integration']) agents.append(el('span', null, name));
  opened.append(places, agents);
  office.append(head, row, el('p', 'ws-diagram-choose', t('setup_workspace.diagram_choose', 'You choose to work in one:')), opened);
  fig.append(office, el('figcaption', null, t('setup_workspace.diagram_caption', 'An illustration: your own Workspaces appear once you make them.')));
  return fig;
}

/**
 * @param workspacesRead  the Workspaces read (workspaces-read.js), read again on their push
 * @param environment     Setup's: its setup-progress push re-reads GitHub's sign-in
 */
export function createWorkspaceKickoff({ workspacesRead, environment }) {
  const { createAction, createField } = WorkspaceKit.primitives;
  const root = el('div', 'setup-workspace-kickoff');
  const doors = el('div', 'setup-workspace-doors');
  const blanks = el('div', 'setup-workspace-blanks');
  const done = el('div', 'setup-workspace-done');
  const foot = el('div', 'setup-workspace-foot');
  root.append(doors, blanks, done, foot);
  // A SECOND PRESS ON THE CHOSEN DOOR closes it (owner, 25 Nov): back to what a Workspace is.
  doors.addEventListener('click', (event) => {
    const stone = event.target.closest?.('[data-ask-field="door"]');
    if (!stone || stone.dataset.askValue !== door) return;
    event.stopPropagation(); event.preventDefault();
    door = ''; draft = blank(); done.replaceChildren(); paint();
  }, true);

  let door = '';
  let draft = blank();
  let github = { authenticated: false, account: '' };
  let mine = null; // their GitHub repositories, read once signed in
  let asking = ''; // what Connect answered
  const has = (name) => workspacesRead.list().some((w) => w.name === name && !w.archived);
  const urls = () => [...new Set([...draft.picked, ...draft.pasted.split(/\s+/).map((one) => one.trim()).filter(Boolean)])];

  const connect = async () => {
    asking = t('setup_workspace.github_asking', 'Asking the Helpful Assistant…'); paintBlanks();
    if (!irasshaiLive()) await askIrasshai();
    const sent = await sendComposerMessage(IRASSHAI, t('setup_workspace.github_message', 'Connect GitHub.'));
    asking = sent.ok ? t('setup_workspace.github_sent', 'Sent: the Helpful Assistant signs you in to GitHub in her chat.') : sent.why;
    paintBlanks();
  };
  // Read again on every fact write and when her turn ends; the blanks repaint only when it moved, so
  // what is being typed is left alone.
  const readGithub = async () => {
    const answer = await request('/api/setup/github', { cache: 'no-store' });
    if (!answer.ok || !!answer.data?.authenticated === github.authenticated) return;
    github = { authenticated: !!answer.data.authenticated, account: String(answer.data.account || '') };
    if (github.authenticated && !mine) {
      const list = await request('/api/setup/github/repos', { cache: 'no-store' });
      mine = list.ok ? list.data.repos || [] : [];
    }
    if (github.authenticated) asking = '';
    paintBlanks();
  };
  const put = (name, body) => request(`/api/workspaces/${encodeURIComponent(name)}`, { method: 'PUT', json: { repos: [], folders: [], integrations: [], ...body } });

  // ONE QUESTION, exposed: its sentence over its stones. `many` answers a list.
  const question = (key, sentence, options, chosen, pick, extra = {}) => {
    const one = ask([{ fields: [{ key, label: sentence, ...extra, options }] }], {
      value: { [key]: chosen }, exposed: true, density: 'tight',
      onChange: (now) => { if (JSON.stringify(now[key]) !== JSON.stringify(chosen)) pick(now[key]); },
    });
    const box = el('div', 'setup-workspace-question');
    box.append(el('p', 'setup-workspace-ask', sentence), one.el);
    return box;
  };
  const textBox = (label, value, onInput, placeholder, rows = 0) => {
    const input = rows ? el('textarea') : el('input');
    if (rows) input.rows = rows; else input.type = 'text';
    input.value = value; input.placeholder = placeholder;
    input.addEventListener('input', () => onInput(input.value));
    return createField({ label, control: input }).el;
  };
  const connectStone = (why) => question('connect', t('setup_workspace.github_ask', 'GitHub'), [
    { v: 'connect', l: t('setup_workspace.connect', 'Connect'), word: IRASSHAI_NAME, sub: why, ...(asking ? { off: asking } : {}) },
  ], '', () => void connect());

  // WHAT IT IS (doors 1–3), in the owner's order (25 Nov): the kind, the name, what they are working on
  // (the name made from it until one is typed); then the door's own question; then what every Agent in
  // it should follow, and Also add Ronin Lab.
  const define = () => {
    const name = textBox(t('workspaces.name', 'Name'), draft.title, (v) => { draft.title = v; draft.named = !!v.trim(); }, t('workspaces.name_placeholder', 'Such as Website or Accounts'));
    const nameInput = name.querySelector('input');
    const head = [
      question('kind', t('setup_workspace.kind_ask', 'What kind of project?'), ruledRows('kind', KINDS, kindWord), draft.kind,
        (v) => { draft.kind = v; }, { shape: 'square' }),
      name,
      textBox(t('workspaces.objective_ask', 'What are you working on?'), draft.objective, (v) => {
        draft.objective = v;
        if (!draft.named) { draft.title = v.trim().split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, ''); nameInput.value = draft.title; }
      }, t('setup_workspace.objective_placeholder', 'One or two sentences: what it is and what it is for.'), 3),
    ];
    const tail = [
      textBox(t('setup_workspace.instructions_ask', 'Anything every Agent here should follow?'), draft.instructions, (v) => { draft.instructions = v; },
        t('setup_workspace.instructions_placeholder', 'Optional. Such as: write in British English; never push to main.'), 3),
    ];
    if (!has(LAB.name)) {
      const lab = ask([{ fields: [{ key: 'lab', label: t('setup_workspace.also_lab', 'Also add Ronin Lab, a place for ideas and notes beside it'), switch: [t('forms.on', 'On'), t('forms.off', 'Off')] }] }],
        { value: { lab: draft.lab }, density: 'tight', onChange: (now) => { draft.lab = !!now.lab; } });
      tail.push(lab.el);
    }
    return { head, tail };
  };

  // CREATE: the Workspace (its folder laid out by the server), then its repositories one by one; the
  // button says what it is doing, the line under it what was made.
  const create = createAction({ label: t('workspaces.create', 'Create'), launch: true, size: 'compact', action: async () => {
    const word = create.el.querySelector('span') || create.el;
    const fail = (message) => { done.replaceChildren(el('p', 'setup-workspace-bad', message)); };
    // DOOR 4 (owner, 25 Nov): two presses, the door and Create.
    if (door === 'lab') {
      create.setDisabled(true);
      word.textContent = t('setup_workspace.making_short', 'Making…');
      const answer = await makeLab();
      create.setDisabled(false);
      word.textContent = t('workspaces.create', 'Create');
      if (!answer.ok) return fail(answer.message);
      door = ''; draft = blank();
      await workspacesRead.read();
      paint();
      tellHer(LAB.name);
      return showMade({ title: LAB.title, name: LAB.name });
    }
    if (!draft.title.trim() && door === 'git' && urls().length) draft.title = repoBase(urls()[0]);
    const name = workspaceHandle(draft.title);
    if (!name) return fail(t('setup_workspace.name_needed', 'Say what it is, or give it a name.'));
    if (has(name)) return fail(t('setup_workspace.name_taken', 'You already have a Workspace called {name}.', { name: draft.title.trim() }));
    if (door === 'git' && !urls().length) return fail(t('setup_workspace.repo_needed', 'Pick a repository or paste its Git URL.'));
    create.setDisabled(true);
    done.replaceChildren();
    word.textContent = t('setup_workspace.making_short', 'Making…');
    const integrations = door === 'existing' ? draft.sources.map((provider) => ({ provider, folder: `files/${provider}` })) : [];
    let answer = await put(name, { title: draft.title.trim(), objective: draft.objective.trim(), kind: draft.kind || 'open', instructions: draft.instructions.trim(), integrations });
    const wsMade = answer.ok;
    const repos = door === 'git' ? urls().map((repository) => ({ repository })) : door === 'scratch' ? [draft.github === 'github' && github.authenticated ? { github: 'private' } : {}] : [];
    for (const [i, body] of repos.entries()) {
      if (!answer.ok) break;
      word.textContent = body.repository
        ? (repos.length > 1 ? t('setup_workspace.cloning_n', 'Cloning {i} of {n}…', { i: i + 1, n: repos.length }) : t('setup_workspace.cloning', 'Cloning…'))
        : t('setup_workspace.starting', 'Starting its repository…');
      answer = await request(`/api/workspaces/${encodeURIComponent(name)}/repos`, { method: 'POST', json: body });
    }
    const failed = answer.ok ? '' : answer.message;
    let lab = false;
    if (wsMade && draft.lab && !has(LAB.name)) {
      word.textContent = t('setup_workspace.making_lab', 'Making Ronin Lab…');
      lab = (await makeLab()).ok;
    }
    create.setDisabled(false);
    word.textContent = t('workspaces.create', 'Create');
    if (!wsMade) return fail(failed);
    // Made, it is shown made, whatever came after; a clone that failed is said under it.
    tellHer(name, failed);
    if (lab) tellHer(LAB.name);
    const made = { title: draft.title.trim(), name };
    door = ''; draft = blank();
    await workspacesRead.read();
    paint();
    showMade(made, lab);
    if (failed) done.append(el('p', 'setup-workspace-bad', failed));
  } });

  const makeLab = async () => {
    const seed = await request(STARTERS);
    return put(LAB.name, { title: LAB.title, objective: String(seed.data?.[LAB.name]?.objective || ''), kind: 'open' });
  };
  const showMade = (made, lab = false) => {
    const line = el('p', 'setup-workspace-made', `${t('setup_workspace.made', 'Made {title}, in ~/ronin/{name}.', made)}${lab ? ` ${t('setup_workspace.made_lab', 'Ronin Lab too.')}` : ''} `);
    const open = el('button', 'setup-workspace-link', t('setup_workspace.open', 'Open it')); open.type = 'button';
    open.addEventListener('click', () => openWorkspaceTab('workspace', made.name));
    line.append(open);
    done.replaceChildren(line);
  };

  const paintBlanks = () => {
    blanks.replaceChildren();
    blanks.dataset.door = door ? 'open' : 'none'; // the form's rule only beside a door's blanks
    // NO DOOR YET: where the form would be, what a Workspace is (owner, 25 Nov).
    if (!door) {
      // The owner's words (25 Nov).
      const about = el('div', 'setup-workspace-about');
      about.append(
        el('h3', 'setup-workspace-about-title', t('setup_workspace.about_title', 'What is a Workspace?')),
        el('p', null, t('setup_workspace.about_1', 'A Workspace is where you and your AI agents work together on a project.')),
        el('p', null, t('setup_workspace.about_2', 'It brings together your project’s files, repositories, plans, and instructions in one place. Every agent you launch in that Workspace knows what the project is about, where to find things, and what you’re trying to accomplish.')),
        el('p', null, t('setup_workspace.about_3', 'You can create multiple Workspaces, each with its own project and context. Your agents can work independently or collaborate within the same Workspace.')),
      );
      blanks.append(about, workspaceDiagram());
      return;
    }
    if (door === 'lab') {
      const lab = el('div', 'setup-workspace-about');
      lab.append(
        el('h3', 'setup-workspace-about-title', LAB.title),
        el('p', null, t('setup_workspace.lab_about', 'Ronin Lab is a place for ideas, notes, research and brainstorming while you decide what to work on. Your Agents can work in it like any Workspace.')),
        el('p', null, t('setup_workspace.lab_where', 'Its folder: ~/ronin/ronin_lab, with plans, files and repos in it.')),
      );
      const line = el('div', 'setup-workspace-create');
      line.append(create.el);
      blanks.append(lab, line);
      return;
    }
    const { head, tail } = define();
    blanks.append(...head);
    if (door === 'git') {
      // GITHUB FIRST (owner, 25 Nov): signed in, nothing to say; not (almost always, on a new office),
      // Connect before anything else.
      if (!github.authenticated) blanks.append(connectStone(t('setup_workspace.github_private', 'GitHub is not signed in on this machine. The Helpful Assistant signs you in, in her chat; then your repositories are listed here to pick. A public one can be pasted without it.')));
      if (github.authenticated && mine?.length) blanks.append(question('picked', t('setup_workspace.which_repos', 'Which repositories?'),
        mine.map((repo) => ({ v: repo.url, l: repo.name, ...(repo.private ? { word: t('workspaces.private', 'private') } : {}) })), draft.picked,
        (v) => { draft.picked = v || []; }, { many: true }));
      blanks.append(textBox(github.authenticated ? t('setup_workspace.or_paste', 'Or paste Git URLs, one per line') : t('setup_workspace.paste', 'Git URLs, one per line'), draft.pasted,
        (v) => { draft.pasted = v; }, t('workspace_add.repository_placeholder', 'https://… or git@… ; owner/repo for GitHub'), 2));
    }
    if (door === 'existing') blanks.append(question('sources', t('setup_workspace.sources_ask', 'Where is it coming from?'),
      SOURCES.map((row) => ({ ...row, sub: row.v === 'computer' ? t('setup_workspace.source_computer_sub', 'They go in its files folder, from Files.') : t('setup_workspace.source_sub', 'Noted on the Workspace with its own folder; the Team step brings it in.') })),
      draft.sources, (v) => { draft.sources = v || []; }, { many: true }));
    if (door === 'scratch') {
      blanks.append(question('github', t('setup_workspace.repo_where', 'Its repository'), [
        { v: 'here', l: t('setup_workspace.repo_here', 'On this machine'), sub: t('setup_workspace.repo_here_sub', 'A new Git repository in its repos folder.') },
        { v: 'github', l: t('setup_workspace.repo_github', 'On GitHub too'), sub: t('setup_workspace.repo_github_sub', 'The same, and a private repository on your GitHub.'),
          ...(github.authenticated ? {} : { off: t('setup_workspace.repo_github_off', 'Connect GitHub first, below.') }) },
      ], draft.github, (v) => { draft.github = v; }));
    }
    blanks.append(...tail);
    // GITHUB, OPTIONAL (owner, 25 Nov), at the foot of doors 2 and 3 while it is not signed in.
    if ((door === 'existing' || door === 'scratch') && !github.authenticated) blanks.append(connectStone(t('setup_workspace.github_optional', 'Optional. So Agents can use GitHub for this project: pull requests, issues, a repository on GitHub. The Helpful Assistant signs you in, in her chat.')));
    const line = el('div', 'setup-workspace-create');
    line.append(create.el);
    blanks.append(line);
  };

  function paint() {
    const lab = has(LAB.name);
    const ready = t('setup_workspace.door_lab_made', 'Ronin Lab is ready.');
    doors.replaceChildren(question('door', t('setup_workspace.start_ask', 'How are you starting?'), [
      { v: 'git', l: t('setup_workspace.door_git', 'From a Git repository'), sub: t('setup_workspace.door_git_sub', 'A project you already have on GitHub or another Git host: each repository is cloned into the new Workspace.') },
      { v: 'existing', l: t('setup_workspace.door_existing', 'An existing project, not in Git'), sub: t('setup_workspace.door_existing_sub', 'It lives in Google Drive, WordPress, Shopify or on your computer: the Workspace is set up for it, and the Team step brings it in.') },
      { v: 'scratch', l: t('setup_workspace.door_scratch', 'From scratch'), sub: t('setup_workspace.door_scratch_sub', 'A new project with its own new Git repository.') },
      { v: 'lab', l: t('setup_workspace.door_lab', 'Not sure yet'), sub: t('setup_workspace.door_lab_sub', 'Ronin Lab: a place for ideas and notes while you decide.'), ...(lab ? { off: ready } : {}) },
    ], door, (v) => {
      done.replaceChildren();
      door = v; draft = blank(); paint();
    }));
    paintBlanks();
    const n = workspacesRead.list().filter((w) => !w.archived).length;
    foot.replaceChildren();
    if (n) {
      const link = el('button', 'setup-workspace-link', n === 1 ? t('setup_workspace.yours_one', 'You have 1 Workspace.') : t('setup_workspace.yours_n', 'You have {n} Workspaces.', { n })); link.type = 'button';
      link.addEventListener('click', () => openWorkspaceTab('workspaces'));
      foot.append(el('p', 'setup-workspace-yours', ''));
      foot.lastChild.append(link);
    }
  }

  const stopRead = workspacesRead.subscribe(() => { if (!door) paint(); });
  // GitHub's sign-in is gh's own: asked again when a fact is written and when her turn ends.
  const stopProgress = environment?.onSetupProgress?.(() => void readGithub()) || (() => {});
  let working = false;
  const stopHome = subscribe('home', (rows) => {
    const now = (rows || []).find((row) => row.name === IRASSHAI)?.stance === 'working';
    if (working && !now) void readGithub();
    working = now;
  });
  paint();
  void readGithub();
  return { el: root, destroy: () => { stopRead(); stopProgress(); stopHome(); } };
}
