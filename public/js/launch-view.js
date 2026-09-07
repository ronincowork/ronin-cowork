/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { createLaunchHelpView } from './launch-help.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent', help: 'launch.help' });
const node = (tag, cls, text) => { const out = document.createElement(tag); if (cls) out.className = cls; if (text != null) out.textContent = text; return out; };

function registerLaunchSurfaces() {
  registerFeedbackSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({
    type: TYPES.team,
    header: 'surface',
    label: () => t('launch.new_team', 'New Team'),
    summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.'),
    create: ({ environment, workspace }) => environment.team(workspace),
  });
  add({
    type: TYPES.agent,
    header: 'surface',
    label: () => t('launch.new_agent', 'New Agent'),
    summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.'),
    create: ({ environment, workspace }) => environment.agent(workspace),
  });
  // or instructions… I should be able to scroll up and down the form, and the help should
  // scroll up and down." It follows whichever form is on the bench.
  add({
    type: TYPES.help,
    header: 'surface',
    label: () => t('help.title', 'Help'),
    summary: () => t('help.card_summary', 'What each step means, beside the step you are on.'),
    variant: 'dotted',
    create: ({ environment, workspace }) => environment.help(workspace),
  });
  profiles.define(PROFILE, [TYPES.team, TYPES.agent, TYPES.help, FEEDBACK_TYPE]);
}

export function createLaunchView() {
  registerLaunchSurfaces();
  const { createSurface } = WorkspaceKit.primitives;
  let ctx = null;
  let bench = null;
  const teamBySeat = {};
  const agentBySeat = {};
  const helpBySeat = {};
  const started = new WeakSet();

  const seated = (view) => ({
    el: view.el,
    show: () => { if (!started.has(view)) { started.add(view); void view.enter(); } },
  });
  const environment = {
    feedback: (workspace) => createFeedbackSurface(() => bench.place(TYPES.team, workspace)),
    team: (workspace) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          created: async (name) => { await refreshTeams(); ctx?.navigate('team', { param: name }); },
        });
      }
      return seated(teamBySeat[workspace]);
    },
    agent: (workspace) => {
      if (!agentBySeat[workspace]) agentBySeat[workspace] = createNewAgentView(WorkspaceKit, {});
      return seated(agentBySeat[workspace]);
    },
    help: (workspace) => {
      if (!helpBySeat[workspace]) helpBySeat[workspace] = createLaunchHelpView(WorkspaceKit, { bench });
      return helpBySeat[workspace];
    },
  };

  const blank = (id) => {
    const surface = createSurface({ label: id.replace('workspace', 'Workspace '), className: 'lv-blank' });
    surface.content.append(node('p', 'cv-blank-word', t('team.workspace_blank', 'Workspace')));
    return surface.el;
  };
  const save = () => ctx?.patchViewState('launch', bench.snapshot());
  bench = WorkspaceKit.workbench.create({
    profile: PROFILE,
    tenant: { kind: 'launch' },
    environment,
    defaultNode: blank,
    label: t('campaign_home.launch', 'New Project'),
    title: () => t('campaign_home.launch', 'New Project'),
    shapeControl: document.getElementById('shapecycle'),
    onStateChange: save,
    onPlacement: save,
  });

  return {
    el: bench.host,
    glyph: '＋',
    arrangement: bench.arrangement,
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    title: () => t('campaign_home.launch', 'New Project'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const stored = context.viewState('launch') || {};
      bench.enter(stored);
      await refreshTeams();
      let placed = false;
      for (const [workspace, held] of Object.entries(stored.seats || {})) {
        const type = typeof held === 'object' ? held.type : held;
        if (!Object.values(TYPES).includes(type)) continue;
        bench.place(type, workspace);
        placed = true;
      }
      // Arriving from the root page with nothing remembered: the Agent form, since that
      // is what most arrivals want, and the Team card is one click beside it.
      if (!placed) bench.place(TYPES.agent, 'workspace1');
      // The cards read left-to-right like the page does; drag it back and that sticks.
      if (!stored.arrangement) bench.arrangement.move('selector', 0);
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { for (const help of Object.values(helpBySeat)) help.destroy?.(); bench.leave(); ctx = null; },
  };
}
