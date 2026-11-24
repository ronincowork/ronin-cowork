/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACE STEP (owner, 24 Nov; KAN-809; samurai_lab wip/SETUP_WORKSPACE.md §2), over the
 * Workspaces already made (their stones, at the foot):
 *
 * 1. Ronin Lab: one ERABI stone, Add Ronin Lab, while there is none; made, one line saying what it is.
 *    It is never taken off here, so there is nothing to say no to.
 * 2. "What kind of project do you want to add?": the seven kinds as ERABI squares (the Team kinds).
 *    A press walks the new Workspace through: for coding, GitHub first while it is not signed in
 *    (Connect, the one press that messages the Helpful Assistant, its stone naming her); then the
 *    New Workspace page with that kind (what it is, where it lives: a coding one's repositories, any
 *    other its folder), and Create. Created, the kind clears and its stone is under.
 *
 * Every press answers at once: the stones grey with what is happening until it is done.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { subscribe } from './store.js';
import { ruledRows } from './glyphs.js';
import { KINDS, kindWord } from './team-configuration.js';
import { workspacePage } from './workspaces-surface.js';
import { sendComposerMessage } from './composer-rules.js';
import { IRASSHAI, IRASSHAI_NAME, askIrasshai, irasshaiLive } from './setup-irasshai.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

const LAB = { name: 'ronin_lab', title: 'Ronin Lab' };
/** Its objective: one seed, which the Helpful Assistant's `workspace starter` reads too (w926). */
const STARTERS = '/content/starter-workspaces.json';

/**
 * @param workspacesRead  the stones' own read (workspaces-read.js): its push is this one's too
 * @param environment     Setup's: its setup-progress push re-reads GitHub's sign-in
 */
export function createWorkspaceKickoff({ workspacesRead, environment }) {
  const root = el('div', 'setup-workspace-kickoff');
  const top = el('div', 'setup-workspace-questions');
  const walk = el('div', 'setup-workspace-walk');
  const yours = el('p', 'setup-workspace-ask setup-workspace-yours', t('setup_workspace.yours', 'Your Workspaces'));
  root.append(top, walk, yours);
  let github = { authenticated: false, account: '' };
  let kind = '';         // the kind being added; '' when nothing is
  let shownKind = '';    // the kind the walk's page was made for
  const busy = { lab: '', github: '' }; // what a press is doing, said on the greyed stones
  const has = (name) => workspacesRead.list().some((w) => w.name === name && !w.archived);

  const addLab = async () => {
    busy.lab = t('setup_workspace.adding', 'Adding {name}…', { name: LAB.title }); paint();
    const seed = await request(STARTERS);
    const objective = String(seed.data?.[LAB.name]?.objective || '');
    const answer = await request(`/api/workspaces/${LAB.name}`, { method: 'PUT', json: { ...LAB, objective, repos: [], folders: [], integrations: [] } });
    busy.lab = answer.ok ? '' : answer.message;
    await workspacesRead.read();
    paint();
  };
  const connect = async () => {
    busy.github = t('setup_workspace.github_asking', 'Asking the Helpful Assistant…'); paint();
    if (!irasshaiLive()) await askIrasshai();
    const sent = await sendComposerMessage(IRASSHAI, t('setup_workspace.github_message', 'Connect GitHub.'));
    busy.github = sent.ok ? t('setup_workspace.github_sent', 'Sent: the Helpful Assistant connects GitHub with you in her chat.') : sent.why;
    paint();
  };
  const readGithub = async () => {
    const answer = await request('/api/setup/github', { cache: 'no-store' });
    if (answer.ok) github = { authenticated: !!answer.data?.authenticated, account: String(answer.data?.account || '') };
    paint();
  };

  // One exposed question: its sentence over its stones, a press answered by `pick`.
  const question = (key, sentence, rows, chosen, pick, shape) => {
    const off = busy[key];
    const one = ask([{ fields: [{ key, label: sentence, ...(shape ? { shape } : {}), options: rows.map((row) => (off ? { ...row, off } : row)) }] }], {
      value: { [key]: chosen }, exposed: true, density: 'tight',
      onChange: (now) => { if (!off && now[key] && now[key] !== chosen) void pick(now[key]); },
    });
    const box = el('div', 'setup-workspace-question');
    box.append(el('p', 'setup-workspace-ask', sentence), one.el);
    return box;
  };

  // The walk: GitHub first for coding while it is not signed in, then the New Workspace page of that kind.
  const paintWalk = () => {
    if (kind === shownKind) return;
    shownKind = kind;
    walk.replaceChildren();
    if (!kind) return;
    const page = workspacePage(null, { kind, taken: () => workspacesRead.list().map((w) => w.name),
      onSaved: async () => { kind = ''; await workspacesRead.read(); paint(); },
      onDiscard: () => { kind = ''; paint(); } });
    const head = el('div', 'workspace-page-head');
    const actions = el('div', 'workspace-page-actions');
    actions.append(page.action.el, page.discard.el);
    head.append(el('span', 'wk-surface-header-title', t('setup_workspace.new_kind', 'New {kind} Workspace', { kind: kindWord(kind) })), actions);
    walk.append(head, page.el);
  };

  function paint() {
    const lab = has(LAB.name);
    const rows = [
      lab
        ? el('p', 'setup-workspace-lab', t('setup_workspace.lab_is', 'Ronin Lab is where you do your creative work.'))
        : question('lab', t('setup_workspace.lab_ask', 'Ronin Lab'), [
          { v: 'add', l: t('setup_workspace.add_lab', 'Add Ronin Lab'), sub: t('setup_workspace.lab_sub', 'Ronin Lab is where you do your creative work: ideas, notes and brainstorming, away from your main code.') },
        ], '', () => addLab()),
      question('kind', t('setup_workspace.kind_ask', 'What kind of project do you want to add?'), ruledRows('kind', KINDS, kindWord), kind,
        (v) => { kind = v; paint(); }, 'square'),
    ];
    if (kind === 'coding' && !github.authenticated) rows.push(question('github', t('setup_workspace.github_ask', 'Connect GitHub'), [
      { v: 'connect', l: t('setup_workspace.connect', 'Connect'), word: IRASSHAI_NAME, sub: t('setup_workspace.github_sub', 'The Helpful Assistant connects GitHub with you, in her chat, so Agents can reach your private repositories. A public repository needs no sign-in.') },
    ], '', () => connect()));
    yours.hidden = !workspacesRead.list().length;
    top.replaceChildren(...rows);
    paintWalk();
  }

  const stopRead = workspacesRead.subscribe(() => paint());
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
