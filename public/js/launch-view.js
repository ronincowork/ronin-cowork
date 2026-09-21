/* part of the ronin-cowork client — see js/README.md */
import { WorkspaceKit } from './workspace-kit.js';
import { createNewTeamFormView } from './new-team-form.js';
import { createNewAgentView } from './new-agent.js';
import { createLaunchHelpView } from './launch-help.js';
import { refreshTeams } from './team-controller.js';
import { t } from './lexicon.js';
import { createFeedbackSurface } from './feedback.js';
import { createDocumentWorkspaceAdapter } from './docs.js';
import { installBehaviourReader } from './behaviour-reader.js';
import { workbenchView } from './workspace-contract.js';
import { registerWorkbenchCatalog, WORKBENCH_PROFILES, WORKBENCH_TYPES } from './workbench-catalog.js';

const PROFILE = WORKBENCH_PROFILES.launch;
const TYPES = Object.freeze({ team: WORKBENCH_TYPES.launchTeam, agent: WORKBENCH_TYPES.launchAgent, help: WORKBENCH_TYPES.launchHelp, behaviours: WORKBENCH_TYPES.behaviours, document: WORKBENCH_TYPES.document, feedback: WORKBENCH_TYPES.feedback });

export function createLaunchView() {
  registerWorkbenchCatalog();
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
    team: (workspace, _detail, consumed) => {
      if (!teamBySeat[workspace]) {
        teamBySeat[workspace] = createNewTeamFormView(WorkspaceKit, {
          consumed,
          created: async () => { await refreshTeams(); bench.refreshSelector(); },
        });
      }
      return seated(teamBySeat[workspace]);
    },
    agent: (workspace, _detail, consumed) => {
      if (!agentBySeat[workspace]) agentBySeat[workspace] = createNewAgentView(WorkspaceKit, {
        consumed, openBehaviours: () => bench.place(TYPES.behaviours, workspace === 'workspace1' ? 'workspace2' : 'workspace1'),
      });
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
    onStateChange: save,
    onPlacement: save,
  });
  installBehaviourReader(bench, TYPES.document, TYPES.behaviours);

  return {
    el: bench.host,
    glyph: '＋',
    ...workbenchView('launch'),
    arrangement: bench.arrangement,
    placeFeedback: () => bench.place(TYPES.feedback, bench.selected()),
    title: () => t('campaign_home.launch', 'New Project'),
    mount: (_host, context) => { ctx = context; },
    enter: async (context) => {
      ctx = context;
      const { state: resolved } = context.workbenchEntry({
        count: 2, selected: 'workspace1',
        arrangement: WorkspaceKit.contract.normalizeWorkbenchState({
          arrangement: { order: ['selector', 'workspace1', 'workspace2'] },
        }, bench.declaration).arrangement,
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
    destroy: () => { for (const help of Object.values(helpBySeat)) help.destroy?.(); for (const view of Object.values(agentBySeat)) view.destroy?.(); bench.leave(); ctx = null; },
  };
}
