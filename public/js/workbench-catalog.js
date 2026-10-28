/* The one Workbench surface catalog. Destinations provide resident data; this module
 * alone registers stable surface identities and decides which profiles expose them. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { BEHAVIOUR_SURFACE_TYPE, registerBehaviourSurface } from './behaviour-surface.js';
import { PRESETS_TYPE, registerPresetsSurface } from './presets.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';
import { PROVIDER_SURFACE_TYPE } from './provider-surface.js';
import { MULTIPLE_CAMPAIGNS_ENABLED } from './campaigns.js';
import { AGENT_COMPOSITION_TYPE } from './agent-composition.js';
import { WORK_ITEMS_TYPE } from './work-items-surface.js';
import { HELP_PAGE_TYPE } from './help-outline.js';

export const WORKBENCH_PROFILES = Object.freeze({ campaign: 'campaign', launch: 'launch', cowork: 'cowork', team: 'team', agent: 'agent', models: 'models', workspaces: 'workspaces', help: 'help' });
export const WORKBENCH_TYPES = Object.freeze({
  document: 'document', terminal: 'session.terminal', behaviours: BEHAVIOUR_SURFACE_TYPE, feedback: FEEDBACK_TYPE,
  launchTeam: 'launch.team', launchAgent: 'launch.agent', launchHelp: 'launch.help',
  commons: 'team.commons', workItems: WORK_ITEMS_TYPE, cron: 'cowork.cron-jobs',
  roster: 'cowork.team-roster', sessionRoster: 'cowork.session-roster', newTeamForm: 'cowork.new-team-form', newAgent: 'session.new-agent',
  team: 'team.profile', archives: 'cowork.archives',
  agentDocuments: 'agent.documents', agentTeams: 'agent.team-membership', agentComposition: AGENT_COMPOSITION_TYPE,
  campaignMachine: 'campaign.machine', campaignDefaults: 'campaign.defaults', campaignRoots: 'campaign.project-roots',
  campaignIdentity: 'campaign.identity', campaignInstallations: 'campaign.installations', campaignCreate: 'campaign.new', campaignJira: 'campaign.jira', campaignJiraItems: 'campaign.jira-items',
  modelStones: 'models.stones', modelRefresh: 'models.refresh', modelDefaults: 'models.defaults', modelProvider: 'models.provider',
  helpOutline: 'help.outline', helpMika: 'help.mika', helpPage: HELP_PAGE_TYPE,
  folderStones: 'workspaces.stones', folder: 'workspaces.folder', folderAdd: 'workspaces.add', folderNew: 'workspaces.new', folderGithub: 'workspaces.github', folderClone: 'workspaces.clone',
});

let registered = false;
export function registerWorkbenchCatalog() {
  if (registered) return;
  registerFeedbackSurface(); registerBehaviourSurface(); registerPresetsSurface();
  registerSetupSurfaces(); registerPasswordSurface();
  const { library, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!library.has(definition.type)) library.register(definition); };
  const via = (type, header, method, extra = {}) => add({ type, header, ...extra,
    create: ({ workspace, detail, environment, consumed }) => environment[method](workspace, detail, consumed) });
  add({ type: WORKBENCH_TYPES.document, header: 'surface', label: () => t('docs.frame_title', 'Document'), discover: () => [], create: ({ detail, environment }) => environment.document(detail) });
  add({ type: WORKBENCH_TYPES.terminal, header: 'terminal', className: 'wk-selector-entity', discover: (_t, e) => e.sessions(), create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail) });
  via(WORKBENCH_TYPES.launchTeam, 'surface', 'team', { label: () => t('launch.new_team', 'New Team'), summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.') });
  via(WORKBENCH_TYPES.launchAgent, 'surface', 'agent', { label: () => t('launch.new_agent', 'New Agent'), summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.') });
  via(WORKBENCH_TYPES.launchHelp, 'surface', 'help', { label: () => t('help.title', 'Help'), summary: () => t('help.card_summary', 'What each step means, beside the step you are on.'), variant: 'dotted' });
  via(WORKBENCH_TYPES.commons, 'tabs', 'teamCommons', { className: 'wk-selector-utility', label: () => t('team.commons_card', 'Commons'), summary: () => t('team.commons_summary', 'See Roster / Docs / Wipeboard / Messages / Configuration') });
  add({ type: WORKBENCH_TYPES.workItems, header: 'surface', className: 'wk-selector-utility', label: () => t('work_items.title', 'Work Items'), discover: (_t, e) => e.workItemOffers(), create: ({ environment }) => environment.workItems() });
  via(WORKBENCH_TYPES.roster, 'surface', 'roster', { className: 'wk-selector-utility', label: () => t('campaign.coworks', 'Teams') });
  via(WORKBENCH_TYPES.sessionRoster, 'surface', 'sessionRoster', { className: 'wk-selector-utility', label: () => t('league.team_roster', 'Team roster') });
  via(WORKBENCH_TYPES.cron, 'surface', 'cron', { className: 'wk-selector-utility', label: () => t('workspace.tab_cron_jobs', 'Cron jobs'), summary: () => t('team_jikan.all_teams_summary', 'Scheduled messages across every team') });
  add({ type: WORKBENCH_TYPES.newTeamForm, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('new_team.title', 'New Team'), summary: () => t('new_team.card_summary', 'Template · kit · lead — the drawn form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newTeamForm(workspace, consumed) });
  add({ type: WORKBENCH_TYPES.newAgent, header: 'surface', className: 'wk-selector-utility', label: () => t('new_agent.title', 'New Agent'), summary: () => t('new_agent.card_summary', 'Session type first — the drawn launch form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newAgent(workspace, consumed) });
  via(WORKBENCH_TYPES.archives, 'surface', 'archives', { className: 'wk-selector-utility', label: () => t('archives.card', 'Rehydrate Archived'), variant: 'dotted' });
  // The Teams Phalanx is the discovery; a dragged stone places the Team profile.
  add({ type: WORKBENCH_TYPES.team, header: 'surface', discover: () => [], create: ({ workspace, detail, environment }) => environment.team(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentDocuments, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.tab_docs', 'Documents'), summary: () => t('agent.documents_summary', 'Documents tracked by this Agent'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.documents(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentTeams, header: 'surface', className: 'wk-selector-utility', label: () => t('agent.team_membership', 'Team membership'), summary: () => t('agent.team_membership_summary', 'Add or remove this Agent from installed Teams'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.teams(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentComposition, header: 'surface', className: 'wk-selector-utility', label: () => t('agent_composition.title', 'Agent composition'), summary: () => t('agent_composition.summary', 'Birth brief, mandate, and Behaviors beside current facts'), discover: (_t, e) => { const key = e.agent?.(); return key ? [{ key }] : []; }, create: ({ detail, environment }) => environment.composition(detail) });
  const campaign = (type, header, label, method, summary = null, extra = {}) => add({ type, header, ...extra, label, ...(summary ? { summary: (_t, e) => summary(e) } : {}), create: (context) => context.environment[method](context) });
  campaign(WORKBENCH_TYPES.campaignIdentity, 'surface', () => t('campaign', 'Desk'), 'campaignIdentity', (e) => e.identitySummary());
  campaign(WORKBENCH_TYPES.campaignRoots, 'surface', () => t('campaign_view.workspaces', 'Workspaces'), 'campaignRoots', (e) => e.rootsSummary());
  campaign(WORKBENCH_TYPES.campaignDefaults, 'surface', () => t('campaign_view.agent_defaults', 'Team and Agent defaults'), 'campaignDefaults', (e) => e.defaultsSummary());
  campaign(WORKBENCH_TYPES.campaignInstallations, 'surface', () => t('campaign_view.installations', 'Installations'), 'campaignInstallations', (e) => e.installationsSummary());
  // Placed by the Jira panel's Open, never offered in the selector.
  add({ type: WORKBENCH_TYPES.campaignJiraItems, header: 'surface', discover: () => [], create: (context) => context.environment.campaignJiraItems(context) });
  campaign(WORKBENCH_TYPES.campaignJira, 'surface', () => t('jira.title', 'Jira'), 'campaignJira', () => t('jira.card_summary', 'This Desk’s Jira space: connect, check, sync.'));
  campaign(WORKBENCH_TYPES.campaignMachine, 'tabs', () => t('campaign_view.machine', 'Machine'), 'campaignMachine', () => t('campaign_view.machine_summary', 'Themes · Desk · Account · Archived · Messages · Help desk · Keypad.'));
  if (MULTIPLE_CAMPAIGNS_ENABLED) campaign(WORKBENCH_TYPES.campaignCreate, 'surface', () => t('campaign.new', 'New Desk'), 'campaignCreate', () => t('campaign_view.new_summary', 'Set the stage. It creates no Team and launches no Agent.'), { variant: 'dotted' });
  profiles.define(WORKBENCH_PROFILES.launch, [WORKBENCH_TYPES.launchTeam, WORKBENCH_TYPES.launchAgent, WORKBENCH_TYPES.launchHelp, BEHAVIOUR_SURFACE_TYPE, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.cowork, [WORKBENCH_TYPES.roster, WORKBENCH_TYPES.sessionRoster, WORKBENCH_TYPES.cron, WORKBENCH_TYPES.team, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newTeamForm, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.archives, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE, PRESETS_TYPE, FEEDBACK_TYPE]);
  // THE TEAM PAGE (owner, 2026-10-18): the selector holds Commons, the Agents, New Agent and the
  // hints (Agent vocabulary, Session controls — the selector's own, workbench.js). The composition
  // reader, Behaviors and Feedback stay placeable: the roster, New Agent and the bar place them.
  profiles.define(WORKBENCH_PROFILES.team, [WORKBENCH_TYPES.commons, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.agentComposition, BEHAVIOUR_SURFACE_TYPE, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.agent, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.agentComposition, WORKBENCH_TYPES.agentDocuments, WORKBENCH_TYPES.agentTeams, WORKBENCH_TYPES.workItems, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.campaign, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.campaignMachine, BEHAVIOUR_SURFACE_TYPE, PASSWORD_SURFACE_TYPE, WORKBENCH_TYPES.campaignInstallations, PROVIDER_SURFACE_TYPE, SETUP_SURFACE_TYPES.register, FEEDBACK_TYPE, WORKBENCH_TYPES.campaignIdentity, WORKBENCH_TYPES.campaignDefaults, WORKBENCH_TYPES.campaignRoots, SETUP_SURFACE_TYPES.launchOwn, WORKBENCH_TYPES.document, WORKBENCH_TYPES.campaignJira, WORKBENCH_TYPES.campaignJiraItems, ...(MULTIPLE_CAMPAIGNS_ENABLED ? [WORKBENCH_TYPES.campaignCreate] : [])]);
  // HOME'S DOORS (owner, 2026-10-19; door-workbenches.js): Models and Workspaces are workbenches of
  // their own; Teams is the Cowork workbench above (owner, 2026-10-20).
  // THE MODELS WORKBENCH (owner, 2026-10-19): its own stones in Workspace 1; one provider whole in a
  // workspace, placed by a dragged stone or its selector card (models-surface.js). THE CARDS FOLLOW THE
  // TEAM PAGE (owner, 2026-10-20): a provider's or folder's card is an entity card like an Agent's
  // (wk-selector-entity, the terminal's class); the three admin doors are dotted like New Agent; the
  // stones surface heads the selector as a solid card, as the Teams card heads the Cowork selector.
  add({ type: WORKBENCH_TYPES.modelStones, header: 'surface', className: 'wk-selector-utility', label: () => t('campaign_home.models', 'Models'), create: ({ workspace, environment }) => environment.modelStones(workspace) });
  // Model refresh (owner, 2026-10-20): the Refresh all door the Models stones do not carry, a solid utility card after Models.
  add({ type: WORKBENCH_TYPES.modelRefresh, header: 'surface', className: 'wk-selector-utility', label: () => t('models.refresh', 'Model refresh'), create: ({ workspace, environment }) => environment.modelRefresh(workspace) });
  // Defaults (owner, 2026-10-21): the model a new Agent, a new Team lead and Mika start on, a solid utility card after Model refresh.
  add({ type: WORKBENCH_TYPES.modelDefaults, header: 'surface', className: 'wk-selector-utility', label: () => t('models.defaults', 'Defaults'), summary: () => t('models.defaults_summary', 'Agent · Team lead · Mika'), create: ({ workspace, environment }) => environment.modelDefaults(workspace) });
  add({ type: WORKBENCH_TYPES.modelProvider, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.providers(), create: ({ workspace, detail, environment }) => environment.modelProvider(workspace, detail) });
  profiles.define(WORKBENCH_PROFILES.models, [WORKBENCH_TYPES.modelStones, WORKBENCH_TYPES.modelRefresh, WORKBENCH_TYPES.modelDefaults, WORKBENCH_TYPES.modelProvider]);
  // THE WORKSPACES WORKBENCH (owner, 2026-10-19): its own stones of folders in Workspace 1; one folder
  // whole in a workspace, placed by a dragged stone or its selector card; the three admin doors are
  // dotted cards, the New Agent format (workspaces-surface.js).
  add({ type: WORKBENCH_TYPES.folderStones, header: 'surface', className: 'wk-selector-utility', label: () => t('campaign_home.workspaces', 'Workspaces'), create: ({ workspace, environment }) => environment.folderStones(workspace) });
  add({ type: WORKBENCH_TYPES.folder, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.folders(), create: ({ workspace, detail, environment }) => environment.folder(workspace, detail) });
  add({ type: WORKBENCH_TYPES.folderAdd, header: 'surface', className: 'wk-selector-utility', label: () => t('roots.add_stone', 'Add a workspace'), summary: () => t('workspace_add.card_summary', 'A new folder, a folder on this machine, or a GitHub repository.'), variant: 'dotted', create: ({ workspace, environment }) => environment.folderAdd(workspace) });
  add({ type: WORKBENCH_TYPES.folderNew, header: 'surface', className: 'wk-selector-utility', label: () => t('roots.add_stone_old', 'Add a workspace (old form)'), summary: () => t('roots.keep_hint', 'Keep a folder on this machine for Teams and Agents to start in.'), variant: 'dotted', create: ({ workspace, environment }) => environment.folderNew(workspace) });
  add({ type: WORKBENCH_TYPES.folderGithub, header: 'surface', className: 'wk-selector-utility', label: () => t('roots.github_auth_stone', 'GitHub CLI'), summary: () => t('roots.github_auth_state', 'Connect account'), variant: 'dotted', create: ({ workspace, environment }) => environment.folderGithub(workspace) });
  add({ type: WORKBENCH_TYPES.folderClone, header: 'surface', className: 'wk-selector-utility', label: () => t('roots.github_clone_stone', 'Clone a repository'), summary: () => t('roots.github_clone_ready_state', 'Uses existing Git access'), variant: 'dotted', create: ({ workspace, environment }) => environment.folderClone(workspace) });
  profiles.define(WORKBENCH_PROFILES.workspaces, [WORKBENCH_TYPES.folderStones, WORKBENCH_TYPES.folder, WORKBENCH_TYPES.folderAdd, WORKBENCH_TYPES.folderNew, WORKBENCH_TYPES.folderGithub, WORKBENCH_TYPES.folderClone]);
  // THE HELP WORKBENCH (owner, 2026-10-21): the help outline and Mika in chat, both solid cards (door-workbenches.js).
  add({ type: WORKBENCH_TYPES.helpOutline, header: 'surface', className: 'wk-selector-utility', label: () => t('help_outline.title', 'Help'), summary: () => t('help_outline.summary', 'The guides, starting with the four things to know'), create: ({ environment }) => environment.helpOutline() });
  add({ type: WORKBENCH_TYPES.helpMika, header: 'terminal', className: 'wk-selector-utility', label: () => 'Mika', summary: () => t('help_outline.mika_summary', 'Ask in plain words'), create: ({ environment }) => environment.helpMika() });
  // One help page whole in a workspace, placed by a dragged stone (help-outline.js); no selector cards.
  add({ type: WORKBENCH_TYPES.helpPage, header: 'surface', label: () => t('help_outline.title', 'Help'), discover: () => [], create: ({ detail, environment }) => environment.helpPage(detail) });
  profiles.define(WORKBENCH_PROFILES.help, [WORKBENCH_TYPES.helpOutline, WORKBENCH_TYPES.helpMika, WORKBENCH_TYPES.helpPage]);
  registered = true;
}
