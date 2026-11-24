/* part of the ronin-cowork client — see js/README.md */
/**
 * THE WORKSPACE STEP'S KICKOFF (owner, 24 Nov; KAN-809; samurai_lab wip/SETUP_WORKSPACE.md §2): three
 * questions over the Workspace stones on a hosted Setup, in this order: Ronin Lab, yes or no; a
 * project, or still thinking; GitHub, now or later. Each is ERABI, exposed, its sentence in the caption.
 *
 * Each reads the office as it is (the Workspaces, GitHub's sign-in), never an answer kept: Ronin Lab
 * reads Yes once it exists, Still thinking once Project One does, GitHub its account once signed in.
 * A press is the real thing or a view: Yes makes Ronin Lab, Still thinking makes Project One (each an
 * ordinary Workspace, its folder made by the server), A project opens New Workspace, No and Later do
 * nothing. Connect is the one press that messages the Helpful Assistant, and its stone names her.
 * Every press answers at once: the stones grey with what is happening until it is done.
 */
import { t } from './lexicon.js';
import { ask } from './ask.js';
import { request } from './request.js';
import { subscribe } from './store.js';
import { sendComposerMessage } from './composer-rules.js';
import { IRASSHAI, IRASSHAI_NAME, askIrasshai, irasshaiLive } from './setup-irasshai.js';

const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = String(text); return node; };

const LAB = { name: 'ronin_lab', title: 'Ronin Lab', objective: 'Ideas, notes, research and brainstorming, kept away from the main code.' };
const ONE = { name: 'project_one', title: 'Project One', objective: 'A first Workspace to try Agents on, until a real project comes along.' };

/**
 * @param workspacesRead  the stones' own read (workspaces-read.js): its push is this one's too
 * @param openNew         opens New Workspace under the stones
 * @param environment     Setup's: its setup-progress push re-reads GitHub's sign-in
 */
export function createWorkspaceKickoff({ workspacesRead, openNew, environment }) {
  const root = el('div', 'setup-workspace-kickoff');
  let github = { authenticated: false, account: '' };
  const busy = { lab: '', project: '', github: '' }; // what a press is doing, said on the greyed stones
  const has = (name) => workspacesRead.list().some((w) => w.name === name && !w.archived);

  const make = async (key, w, doing) => {
    busy[key] = doing; paint();
    const answer = await request(`/api/workspaces/${encodeURIComponent(w.name)}`, { method: 'PUT', json: { ...w, repos: [], folders: [], integrations: [] } });
    busy[key] = answer.ok ? '' : answer.message;
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
  const question = (key, sentence, rows, chosen, pick) => {
    const off = busy[key];
    const one = ask([{ fields: [{ key, label: sentence, options: rows.map((row) => (off ? { ...row, off } : row)) }] }], {
      value: { [key]: chosen }, exposed: true, density: 'tight',
      onChange: (now) => { if (!off && now[key] && now[key] !== chosen) void pick(now[key]); },
    });
    const box = el('div', 'setup-workspace-question');
    box.append(el('p', 'setup-workspace-ask', sentence), one.el);
    return box;
  };

  function paint() {
    const lab = has(LAB.name);
    const one = has(ONE.name);
    root.replaceChildren(
      question('lab', t('setup_workspace.lab_ask', 'Do you want Ronin Lab?'), [
        { v: 'yes', l: t('setup_workspace.yes', 'Yes'), sub: lab ? t('setup_workspace.lab_made', 'Ronin Lab is one of your Workspaces.') : t('setup_workspace.lab_sub', 'A place for brainstorming and notes, away from your main code.') },
        { v: 'no', l: t('setup_workspace.no', 'No'), ...(lab ? { off: t('setup_workspace.lab_archive', 'Archive it from its own page.') } : {}) },
      ], lab ? 'yes' : '', (v) => (v === 'yes' && !lab ? make('lab', LAB, t('setup_workspace.making', 'Making {name}…', { name: LAB.title })) : null)),
      question('project', t('setup_workspace.project_ask', 'Do you have a project you’re working on, or are you still thinking?'), [
        { v: 'project', l: t('setup_workspace.a_project', 'A project'), sub: t('setup_workspace.project_sub', 'Say what it is, then where it lives: New Workspace.') },
        { v: 'thinking', l: t('setup_workspace.thinking', 'Still thinking'), sub: one ? t('setup_workspace.one_made', 'Project One is one of your Workspaces.') : t('setup_workspace.thinking_sub', 'Start with Project One, a Workspace to try Agents on.') },
      ], one ? 'thinking' : '', (v) => (v === 'project' ? openNew() : !one ? make('project', ONE, t('setup_workspace.making', 'Making {name}…', { name: ONE.title })) : null)),
      question('github', t('setup_workspace.github_ask', 'Connect GitHub?'), github.authenticated
        ? [{ v: 'in', l: github.account || 'GitHub', word: t('setup_workspace.signed_in', 'signed in'), sub: t('setup_workspace.github_in', 'GitHub is signed in as {account}.', { account: github.account }) }]
        : [
          { v: 'connect', l: t('setup_workspace.connect', 'Connect'), word: IRASSHAI_NAME, sub: t('setup_workspace.github_sub', 'The Helpful Assistant connects GitHub with you, in her chat, so Agents can reach your private repositories. You can skip this.') },
          { v: 'later', l: t('setup_workspace.later', 'Later'), sub: t('setup_workspace.later_sub', 'Private repositories ask for it when you add one.') },
        ], github.authenticated ? 'in' : '', (v) => (v === 'connect' ? connect() : null)),
    );
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
