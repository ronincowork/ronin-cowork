/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { createLaunchHelpView } from './launch-help.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';
import { createFeedbackSurface, FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { workbenchView } from './workspace-contract.js';
import { BEHAVIOUR_SURFACE_TYPE, registerBehaviourSurface } from './behaviour-surface.js';

const PROFILE = 'launch';
const TYPES = Object.freeze({ team: 'launch.team', agent: 'launch.agent', help: 'launch.help', behaviours: BEHAVIOUR_SURFACE_TYPE, document: 'document' });
function registerLaunchSurfaces() {
  registerFeedbackSurface();
  registerBehaviourSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  add({
    type: TYPES.team,
    header: 'surface',
    label: () => t('launch.new_team', 'New Team'),
    summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.'),
    create: ({ environment, workspace }) => environment.team(workspace),
  });
  add({ type: TYPES.document, header: 'surface', label: () => t('docs.frame_title', 'Document'), discover: () => [], create: ({ detail, environment }) => environment.document(detail) });
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
  profiles.define(PROFILE, [TYPES.team, TYPES.agent, TYPES.help, TYPES.behaviours, TYPES.document, FEEDBACK_TYPE]);
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
    show: (detail) => { if (!started.has(view)) { started.add(view); void view.enter(detail); } },
  });
  const environment = {
    feedback: (workspace) => createFeedbackSurface(() => bench.place(TYPES.team, workspace)),
    team: (workspace) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          created: async () => { await refreshTeams(); bench.refreshSelector(); },
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
    document: (detail = {}) => createDocumentWorkspaceAdapter({ root: detail.root, path: detail.path || detail.key }),
  };

  const blank = (id) => WorkspaceKit.primitives.createBlankSurface(id.replace('workspace', 'Workspace ')).el;
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
  installBehaviourReader(bench, TYPES.document, TYPES.behaviours);

  return {
    el: bench.host,
    glyph: '＋',
    ...workbenchView('launch'),
    arrangement: bench.arrangement,
    placeFeedback: () => bench.place(FEEDBACK_TYPE, bench.selected()),
    title: () => t('campaign_home.launch', 'New Project'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const { state: resolved } = context.workbenchEntry({
        count: 2, selected: 'workspace1',
        arrangement: { order: ['selector', 'workspace1', 'workspace2'] },
        seats: { workspace1: TYPES.agent },
      });
      bench.enter(resolved);
      for (const [workspace, held] of Object.entries(resolved.seats || {})) {
        const type = typeof held === 'object' ? held.type : held;
        if (!Object.values(TYPES).includes(type)) continue;
        bench.place(type, workspace, typeof held === 'object' ? held.detail || held : {});
      }
      bench.refreshSelector();
      save();
    },
    leave: () => bench.leave(),
    destroy: () => { for (const help of Object.values(helpBySeat)) help.destroy?.(); bench.leave(); ctx = null; },
  };
}
