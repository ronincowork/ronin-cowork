/* The one Workbench surface catalog. Destinations provide resident data; this module
 * alone registers stable surface identities and decides which profiles expose them. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { BEHAVIOUR_SURFACE_TYPE, registerBehaviourSurface } from './behaviour-surface.js';
import { PRESETS_TYPE, registerPresetsSurface } from './presets.js';

export const WORKBENCH_PROFILES = Object.freeze({ launch: 'launch', cowork: 'cowork', team: 'team', agent: 'agent' });
export const WORKBENCH_TYPES = Object.freeze({
  document: 'document', terminal: 'session.terminal', behaviours: BEHAVIOUR_SURFACE_TYPE, feedback: FEEDBACK_TYPE,
  launchTeam: 'launch.team', launchAgent: 'launch.agent', launchHelp: 'launch.help',
  commons: 'team.commons', kanban: 'team.kanban', cron: 'cowork.cron-jobs',
  roster: 'cowork.team-roster', newTeam: 'cowork.new-team-form', newAgent: 'session.new-agent',
  team: 'team.profile', archives: 'cowork.archives',
  agentDocuments: 'agent.documents', agentTeams: 'agent.team-membership', agentTasks: 'agent.task-manager',
});

let registered = false;
export function registerWorkbenchCatalog() {
  if (registered) return;
  registerFeedbackSurface(); registerBehaviourSurface(); registerPresetsSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  const via = (type, header, method, extra = {}) => add({ type, header, ...extra,
    create: ({ workspace, detail, environment, consumed }) => environment[method](workspace, detail, consumed) });
  add({ type: WORKBENCH_TYPES.document, header: 'surface', label: () => t('docs.frame_title', 'Document'), discover: () => [], create: ({ detail, environment }) => environment.document(detail) });
  add({ type: WORKBENCH_TYPES.terminal, header: 'terminal', className: 'wk-selector-entity', discover: (_t, e) => e.sessions(), create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail) });
  via(WORKBENCH_TYPES.launchTeam, 'surface', 'team', { label: () => t('launch.new_team', 'New Team'), summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.') });
  via(WORKBENCH_TYPES.launchAgent, 'surface', 'agent', { label: () => t('launch.new_agent', 'New Agent'), summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.') });
  via(WORKBENCH_TYPES.launchHelp, 'surface', 'help', { label: () => t('help.title', 'Help'), summary: () => t('help.card_summary', 'What each step means, beside the step you are on.'), variant: 'dotted' });
  via(WORKBENCH_TYPES.commons, 'tabs', 'teamCommons', { className: 'wk-selector-utility', label: () => t('team.commons_card', 'Commons'), summary: () => t('team.commons_summary', 'See Roster / Docs / Wipeboard / Task Manager / Configuration') });
  add({ type: WORKBENCH_TYPES.kanban, header: 'tabs', className: 'wk-selector-utility', discover: (_t, e) => e.kanbanOffers(), create: ({ workspace, environment }) => environment.teamKanban(workspace) });
  via(WORKBENCH_TYPES.roster, 'surface', 'roster', { className: 'wk-selector-utility', label: () => t('league.team_roster', 'Team roster') });
  via(WORKBENCH_TYPES.cron, 'surface', 'cron', { className: 'wk-selector-utility', label: () => t('workspace.tab_cron_jobs', 'Cron jobs'), summary: () => t('team_jikan.all_teams_summary', 'Scheduled messages across every team') });
  add({ type: WORKBENCH_TYPES.newTeam, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('new_team.title', 'New Team'), summary: () => t('new_team.card_summary', 'Template · kit · lead — the drawn form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newTeamForm(workspace, consumed) });
  add({ type: WORKBENCH_TYPES.newAgent, header: 'surface', className: 'wk-selector-utility', label: () => t('new_agent.title', 'New Agent'), summary: () => t('new_agent.card_summary', 'Session type first — the drawn launch form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newAgent(workspace, consumed) });
  via(WORKBENCH_TYPES.archives, 'surface', 'archives', { className: 'wk-selector-utility', label: () => t('archives.card', 'Rehydrate Archived'), variant: 'dotted' });
  add({ type: WORKBENCH_TYPES.team, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.teams(), create: ({ workspace, detail, environment }) => environment.team(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentDocuments, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.tab_docs', 'Documents'), summary: () => t('agent.documents_summary', 'Documents tracked by this Agent'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.documents(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentTeams, header: 'surface', className: 'wk-selector-utility', label: () => t('agent.team_membership', 'Team membership'), summary: () => t('agent.team_membership_summary', 'Add or remove this Agent from installed Teams'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.teams(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentTasks, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.tab_task_manager', 'Task Manager'), discover: (_t, e) => e.taskOffers(), create: ({ workspace, detail, environment }) => environment.tasks(workspace, detail) });
  profiles.define(WORKBENCH_PROFILES.launch, [WORKBENCH_TYPES.launchTeam, WORKBENCH_TYPES.launchAgent, WORKBENCH_TYPES.launchHelp, BEHAVIOUR_SURFACE_TYPE, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.cowork, [WORKBENCH_TYPES.roster, WORKBENCH_TYPES.cron, WORKBENCH_TYPES.team, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newTeam, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.archives, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE, PRESETS_TYPE, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.team, [WORKBENCH_TYPES.commons, WORKBENCH_TYPES.kanban, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newAgent, BEHAVIOUR_SURFACE_TYPE, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.agent, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.agentDocuments, WORKBENCH_TYPES.agentTeams, WORKBENCH_TYPES.agentTasks, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  registered = true;
}
