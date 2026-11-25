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
 * 4. Not sure yet: Ronin Lab, made on the press.
 * Doors 1–3 then ask what it is (objective, name), its kind, and what every Agent in it should follow
 * (instructions); last, while there is none, Also add Ronin Lab. Every answer is on the record.
 *
 * Connect is the one press that messages the Helpful Assistant; its stone names her.
 * Every press answers at once: a pressed Create reads what it is doing until it is done.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { subscribe } from './store.js';
import { WorkspaceKit } from './workspace-kit.js';
import { KINDS, kindWord, ruledRows } from './glyphs.js';
import { openWorkspaceTab } from './workspace.js';
import { sendComposerMessage } from './composer-rules.js';
import { IRASSHAI, IRASSHAI_NAME, askIrasshai, irasshaiLive } from './setup-irasshai.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

const LAB = { name: 'ronin_lab', title: 'Ronin Lab' };
/** Its objective: one seed, which the Helpful Assistant's `workspace starter` reads too (w926). */
const STARTERS = '/content/starter-workspaces.json';
/** Door 2's sources: each an integration row on the record, its folder files/<provider>. */
const SOURCES = [
  { v: 'google_drive', l: 'Google Drive' }, { v: 'wordpress', l: 'WordPress' }, { v: 'shopify', l: 'Shopify' },
  { v: 'netlify', l: 'Netlify' }, { v: 'computer', l: t('setup_workspace.source_computer', 'Files from my computer') },
];
/** A Workspace's handle from its name (lowercase, _), as the server takes it. */
const handle = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
const repoBase = (url) => url.trim().replace(/\.git$/, '').replace(/\/+$/, '').split(/[/:]/).pop() || '';
const blank = () => ({ picked: [], pasted: '', sources: [], github: 'here', title: '', named: false, objective: '', kind: '', instructions: '', lab: false });

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
  const foot = el('p', 'setup-workspace-foot');
  root.append(doors, blanks, done, foot);

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
  const readGithub = async () => {
    const answer = await request('/api/setup/github', { cache: 'no-store' });
    if (answer.ok) github = { authenticated: !!answer.data?.authenticated, account: String(answer.data?.account || '') };
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
    input.addEventListener('input', () => onInput(input.value, input));
    return createField({ label, control: input }).el;
  };
  const connectStone = (why) => question('connect', t('setup_workspace.github_ask', 'Connect GitHub'), [
    { v: 'connect', l: t('setup_workspace.connect', 'Connect'), word: IRASSHAI_NAME, sub: why, ...(asking ? { off: asking } : {}) },
  ], '', () => void connect());

  // WHAT IT IS (doors 1–3): the objective, the name made from it until one is typed, the kind, and
  // what every Agent in it should follow.
  const define = () => {
    const name = textBox(t('workspaces.name', 'Name'), draft.title, (v) => { draft.title = v; draft.named = !!v.trim(); }, t('workspaces.name_placeholder', 'Such as Website or Accounts'));
    const nameInput = name.querySelector('input');
    const parts = [
      textBox(t('workspaces.objective_ask', 'What are you working on?'), draft.objective, (v) => {
        draft.objective = v;
        if (!draft.named) { draft.title = v.trim().split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:!?]+$/, ''); nameInput.value = draft.title; }
      }, t('setup_workspace.objective_placeholder', 'One or two sentences: what it is and what it is for.'), 3),
      name,
      question('kind', t('setup_workspace.kind_ask', 'What kind of project?'), ruledRows('kind', KINDS, kindWord), draft.kind,
        (v) => { draft.kind = v; }, { shape: 'square' }),
      textBox(t('setup_workspace.instructions_ask', 'Anything every Agent here should follow?'), draft.instructions, (v) => { draft.instructions = v; },
        t('setup_workspace.instructions_placeholder', 'Optional. Such as: write in British English; never push to main.'), 3),
    ];
    if (!has(LAB.name)) {
      const lab = ask([{ fields: [{ key: 'lab', label: t('setup_workspace.also_lab', 'Also add Ronin Lab, a place for ideas and notes beside it'), switch: [t('forms.on', 'On'), t('forms.off', 'Off')] }] }],
        { value: { lab: draft.lab }, density: 'tight', onChange: (now) => { draft.lab = !!now.lab; } });
      parts.push(lab.el);
    }
    return parts;
  };

  // CREATE: the Workspace (its folder laid out by the server), then its repositories one by one; the
  // button says what it is doing, the line under it what was made.
  const create = createAction({ label: t('workspaces.create', 'Create'), launch: true, size: 'compact', action: async () => {
    const word = create.el.querySelector('span') || create.el;
    const fail = (message) => { done.replaceChildren(el('p', 'setup-workspace-bad', message)); };
    if (!draft.title.trim() && door === 'git' && urls().length) draft.title = repoBase(urls()[0]);
    const name = handle(draft.title);
    if (!name) return fail(t('setup_workspace.name_needed', 'Say what it is, or give it a name.'));
    if (has(name)) return fail(t('setup_workspace.name_taken', 'You already have a Workspace called {name}.', { name: draft.title.trim() }));
    if (door === 'git' && !urls().length) return fail(t('setup_workspace.repo_needed', 'Pick a repository or paste its Git URL.'));
    create.setDisabled(true);
    done.replaceChildren();
    word.textContent = t('setup_workspace.making_short', 'Making…');
    const integrations = door === 'existing' ? draft.sources.map((provider) => ({ provider, folder: `files/${provider}` })) : [];
    let answer = await put(name, { title: draft.title.trim(), objective: draft.objective.trim(), kind: draft.kind || 'open', instructions: draft.instructions.trim(), integrations });
    const repos = door === 'git' ? urls().map((repository) => ({ repository })) : door === 'scratch' ? [draft.github === 'github' && github.authenticated ? { github: 'private' } : {}] : [];
    for (const [i, body] of repos.entries()) {
      if (!answer.ok) break;
      word.textContent = body.repository
        ? (repos.length > 1 ? t('setup_workspace.cloning_n', 'Cloning {i} of {n}…', { i: i + 1, n: repos.length }) : t('setup_workspace.cloning', 'Cloning…'))
        : t('setup_workspace.starting', 'Starting its repository…');
      answer = await request(`/api/workspaces/${encodeURIComponent(name)}/repos`, { method: 'POST', json: body });
    }
    const lab = draft.lab && !has(LAB.name);
    if (answer.ok && lab) { word.textContent = t('setup_workspace.making_lab', 'Making Ronin Lab…'); await makeLab(); }
    create.setDisabled(false);
    word.textContent = t('workspaces.create', 'Create');
    if (!answer.ok) return fail(answer.message);
    const made = { title: draft.title.trim(), name };
    door = ''; draft = blank();
    await workspacesRead.read();
    paint();
    showMade(made, lab);
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
    blanks.hidden = !door;
    if (!door) return;
    if (door === 'git') {
      if (github.authenticated && mine?.length) blanks.append(question('picked', t('setup_workspace.which_repos', 'Which repositories?'),
        mine.map((repo) => ({ v: repo.url, l: repo.name, ...(repo.private ? { word: t('workspaces.private', 'private') } : {}) })), draft.picked,
        (v) => { draft.picked = v || []; }, { many: true }));
      blanks.append(textBox(github.authenticated ? t('setup_workspace.or_paste', 'Or paste Git URLs, one per line') : t('setup_workspace.paste', 'Git URLs, one per line'), draft.pasted,
        (v) => { draft.pasted = v; }, t('workspace_add.repository_placeholder', 'https://… or git@… ; owner/repo for GitHub'), 2));
      if (!github.authenticated) blanks.append(connectStone(t('setup_workspace.github_private', 'For a private repository, or to pick from yours: the Helpful Assistant signs you in to GitHub, in her chat. A public one needs no sign-in.')));
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
      if (!github.authenticated) blanks.append(connectStone(t('setup_workspace.github_new', 'To keep it on GitHub too: the Helpful Assistant signs you in, in her chat.')));
    }
    blanks.append(...define());
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
      if (v !== 'lab') { door = v; draft = blank(); paint(); return; }
      door = ''; paint();
      done.replaceChildren(el('p', 'setup-workspace-made', t('setup_workspace.making', 'Making {name}…', { name: LAB.title })));
      void makeLab().then(async (answer) => {
        if (!answer.ok) { done.replaceChildren(el('p', 'setup-workspace-bad', answer.message)); return; }
        await workspacesRead.read();
        paint();
        showMade({ title: LAB.title, name: LAB.name });
      });
    }));
    paintBlanks();
    const n = workspacesRead.list().filter((w) => !w.archived).length;
    foot.replaceChildren();
    if (n) {
      const link = el('button', 'setup-workspace-link', n === 1 ? t('setup_workspace.yours_one', 'You have 1 Workspace.') : t('setup_workspace.yours_n', 'You have {n} Workspaces.', { n })); link.type = 'button';
      link.addEventListener('click', () => openWorkspaceTab('workspaces'));
      foot.append(link);
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
