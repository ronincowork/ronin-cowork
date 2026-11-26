/* The one Workbench surface catalog. Destinations provide resident data; this module
 * alone registers stable surface identities and decides which profiles expose them. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { FILES_TYPE, registerFilesSurface } from './files-surface.js';
import { BEHAVIOUR_SURFACE_TYPE, registerBehaviourSurface } from './behaviour-surface.js';
import { SETUP_SURFACE_TYPES, registerSetupSurfaces } from './setup-surfaces.js';
import { PASSWORD_SURFACE_TYPE, registerPasswordSurface } from './password-surface.js';
import { PROVIDER_SURFACE_TYPE } from './harnesses-surface.js';
import { MULTIPLE_CAMPAIGNS_ENABLED } from './campaigns.js';
import { AGENT_COMPOSITION_TYPE } from './agent-composition.js';
import { WORK_ITEMS_TYPE } from './work-items-surface.js';
import { HELP_PAGE_TYPE } from './help-outline.js';
import { HOSTED } from './hosted.js';

export const WORKBENCH_PROFILES = Object.freeze({ campaign: 'campaign', launch: 'launch', cowork: 'cowork', team: 'team', agent: 'agent', models: 'models', workspaces: 'workspaces', epics: 'epics', help: 'help', settings2: 'settings2' });
export const WORKBENCH_TYPES = Object.freeze({
  document: 'document', terminal: 'session.terminal', behaviours: BEHAVIOUR_SURFACE_TYPE, feedback: FEEDBACK_TYPE, files: FILES_TYPE,
  launchTeam: 'launch.team', launchAgent: 'launch.agent', launchHelp: 'launch.help',
  commons: 'team.commons', workItems: WORK_ITEMS_TYPE, cron: 'cowork.cron-jobs',
  roster: 'cowork.team-roster', sessionRoster: 'cowork.session-roster', newTeamForm: 'cowork.new-team-form', newAgent: 'session.new-agent', newItem: 'session.new-item',
  team: 'team.profile', archives: 'cowork.archives', teamArchived: 'team.archived', teamEpics: 'team.epics', teamFindItem: 'team.find-item',
  agentDocuments: 'agent.documents', agentTeams: 'agent.team-membership', agentComposition: AGENT_COMPOSITION_TYPE,
  campaignMachine: 'campaign.machine', campaignMachineStatus: 'campaign.machine-status', campaignCloudAccount: 'campaign.cloud-account', campaignDefaults: 'campaign.defaults', campaignRoots: 'campaign.workspaces',
  campaignIdentity: 'campaign.identity', campaignCreate: 'campaign.new', campaignIntegrations: 'campaign.integrations', campaignJira: 'campaign.jira', campaignJiraItems: 'campaign.jira-items', campaignJiraPairs: 'campaign.jira-pairs',
  modelStones: 'models.stones', modelRefresh: 'models.refresh', modelDefaults: 'models.defaults', modelHarness: 'models.provider', modelMika: 'models.mika-auth',
  // THE AGENT HARNESS WORKBENCH'S TWO NEW TILESPACES (KAN-236): Accounts and Models, beside the stones and Refresh.
  helpOutline: 'help.outline', helpMika: 'help.mika', helpPage: HELP_PAGE_TYPE,
  workspaceRecords: 'workspaces.records', workspaceRecord: 'workspaces.record', workspaceNew: 'workspaces.new', epicNew: 'epics.new', folderGithub: 'workspaces.github', githubMika: 'workspaces.github-mika',
  epicRecords: 'epics.records', epicRecord: 'epics.record',
  settings2ModelServices: 'settings2.model-services',
  settings2AgentDefaults: 'settings2.agent-defaults', settings2BehaviorFiles: 'settings2.behavior-files', settings2Stats: 'settings2.stats',
  canvas: 'team.canvas',
});

let registered = false;
export function registerWorkbenchCatalog() {
  if (registered) return;
  registerFeedbackSurface(); registerFilesSurface(); registerBehaviourSurface();
  registerSetupSurfaces(); registerPasswordSurface();
  const { surfaces, profiles } = WorkspaceKit.workbench;
  const add = (definition) => { if (!surfaces.has(definition.type)) surfaces.register(definition); };
  const via = (type, header, method, extra = {}) => add({ type, header, ...extra,
    create: ({ workspace, detail, environment, consumed }) => environment[method](workspace, detail, consumed) });
  add({ type: WORKBENCH_TYPES.document, header: 'surface', label: () => t('docs.frame_title', 'Document'), discover: () => [], create: ({ detail, environment }) => environment.document(detail) });
  add({ type: WORKBENCH_TYPES.terminal, header: 'terminal', className: 'wk-selector-entity', discover: (_t, e) => e.sessions(), create: ({ workspace, detail, environment }) => environment.terminal(workspace, detail) });
  via(WORKBENCH_TYPES.launchTeam, 'surface', 'team', { label: () => t('launch.new_team', 'New Team'), summary: () => t('launch.new_team_summary', 'Define a Team, then launch its Agents.') });
  via(WORKBENCH_TYPES.launchAgent, 'surface', 'agent', { label: () => t('launch.new_agent', 'New Agent'), summary: () => t('launch.new_agent_summary', 'Start an Agent in a Team or on its own.') });
  via(WORKBENCH_TYPES.launchHelp, 'surface', 'help', { label: () => t('help.title', 'Help'), summary: () => t('help.card_summary', 'What each step means, beside the step you are on.'), variant: 'dotted' });
  via(WORKBENCH_TYPES.commons, 'tabs', 'teamCommons', { className: 'wk-selector-utility', label: () => t('team.commons_card', 'Commons'), summary: () => t('team.commons_summary', 'See Roster / Docs / Wipeboard / Messages / Configuration') });
  // EPICS (KAN-232): the Team's Epics on the Epics board (team-epics.js).
  via(WORKBENCH_TYPES.teamEpics, 'surface', 'teamEpics', { className: 'wk-selector-utility', label: () => t('epics.title', 'Epics') });
  // A CANVAS (KAN-329): one card per canvas of the Team's Workspace, beside its Agents; placed, it
  // reads the canvas now and paints it (canvas-view.js). Its own colour, not an Agent's khaki.
  add({ type: WORKBENCH_TYPES.canvas, header: 'surface', className: 'wk-selector-canvas', discover: (_t, e) => e.canvases?.() ?? [], create: ({ workspace, detail, environment }) => environment.canvas(workspace, detail) });
  // FIND ITEM (owner, 2026-11-12, KAN-433): asks for an item number, loads that item here (team-find-item.js).
  via(WORKBENCH_TYPES.teamFindItem, 'surface', 'teamFindItem', { className: 'wk-selector-utility', label: () => t('find_item.title', 'Find item') });
  add({ type: WORKBENCH_TYPES.workItems, header: 'surface', className: 'wk-selector-utility', label: () => t('work_items.title', 'Work Items'), discover: (_t, e) => e.workItemOffers(), create: ({ environment }) => environment.workItems() });
  via(WORKBENCH_TYPES.roster, 'surface', 'roster', { className: 'wk-selector-utility', label: () => t('campaign.coworks', 'Teams') });
  via(WORKBENCH_TYPES.sessionRoster, 'surface', 'sessionRoster', { className: 'wk-selector-utility', label: () => t('league.team_roster', 'Team roster') });
  via(WORKBENCH_TYPES.cron, 'surface', 'cron', { className: 'wk-selector-utility', label: () => t('workspace.tab_cron_jobs', 'Cron jobs'), summary: () => t('team_jikan.all_teams_summary', 'Scheduled messages across every team') });
  add({ type: WORKBENCH_TYPES.newTeamForm, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('new_team.title', 'New Team'), summary: () => t('new_team.card_summary', 'Kind · kit · lead — the drawn form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newTeamForm(workspace, consumed) });
  add({ type: WORKBENCH_TYPES.newAgent, header: 'surface', className: 'wk-selector-utility', label: () => t('new_agent.title', 'New Agent'), summary: () => t('new_agent.card_summary', 'Session type first — the drawn launch form.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newAgent(workspace, consumed) });
  // NEW ITEM (owner, 2026-11-23): beside New Agent, a person adds a work item the way they add an
  // Agent: the Epics workbench's New form (createNewItem), started on Task.
  add({ type: WORKBENCH_TYPES.newItem, header: 'surface', className: 'wk-selector-utility', label: () => t('work_items.new_item', 'New Item'), summary: () => t('epics.new_state', 'title · goal · who holds it'), variant: 'dotted', create: ({ workspace, environment }) => environment.newItem(workspace) });
  via(WORKBENCH_TYPES.archives, 'surface', 'archives', { className: 'wk-selector-utility', label: () => t('archives.card', 'Archived Agents'), variant: 'dotted' });
  // ARCHIVED AGENTS (owner, 2026-11-19, KAN-706; the word 2026-11-22): one pill on a Team's selector; it places the same
  // archived sessions surface, holding only this Team's archives (cowork-view.js archivesBySeat).
  via(WORKBENCH_TYPES.teamArchived, 'surface', 'archives', { className: 'wk-selector-utility', label: () => t('archives.team_card', 'Archived Agents'), variant: 'dotted' });
  // A card per Team on the Teams selector (w900), and a dragged Teams stone, place that Team.
  add({ type: WORKBENCH_TYPES.team, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.teams?.() ?? [], create: ({ workspace, detail, environment }) => environment.team(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentDocuments, header: 'surface', className: 'wk-selector-utility', label: () => t('workspace.tab_docs', 'Documents'), summary: () => t('agent.documents_summary', 'Documents tracked by this Agent'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.documents(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentTeams, header: 'surface', className: 'wk-selector-utility', label: () => t('agent.team_membership', 'Team membership'), summary: () => t('agent.team_membership_summary', 'Add or remove this Agent from installed Teams'), discover: (_t, e) => [{ key: e.agent() }], create: ({ workspace, detail, environment }) => environment.teams(workspace, detail) });
  add({ type: WORKBENCH_TYPES.agentComposition, header: 'surface', className: 'wk-selector-utility', label: () => t('agent_composition.title', 'Agent composition'), summary: () => t('agent_composition.summary', 'Birth brief, mandate, and Behaviors beside current facts'), discover: (_t, e) => { const key = e.agent?.(); return key ? [{ key }] : []; }, create: ({ detail, environment }) => environment.composition(detail) });
  const campaign = (type, header, label, method, summary = null, extra = {}) => add({ type, header, ...extra, label, ...(summary ? { summary: (_t, e) => summary(e) } : {}), create: (context) => context.environment[method](context) });
  campaign(WORKBENCH_TYPES.campaignIdentity, 'surface', () => t('campaign', 'Desk'), 'campaignIdentity', (e) => e.identitySummary());
  campaign(WORKBENCH_TYPES.campaignRoots, 'surface', () => t('campaign_view.workspaces', 'Workspaces'), 'campaignRoots', (e) => e.rootsSummary());
  campaign(WORKBENCH_TYPES.campaignDefaults, 'surface', () => t('campaign_view.agent_defaults', 'Team and Agent defaults'), 'campaignDefaults', (e) => e.defaultsSummary());
  // Placed by the Jira panel's Open, never offered in the selector.
  add({ type: WORKBENCH_TYPES.campaignJiraItems, header: 'surface', discover: () => [], create: (context) => context.environment.campaignJiraItems(context) });
  add({ type: WORKBENCH_TYPES.campaignJiraPairs, header: 'surface', discover: () => [], create: (context) => context.environment.campaignJiraPairs(context) });
  // THE INTEGRATIONS PANEL (KAN-339): every integration in one frame, Jira's panel inside it.
  campaign(WORKBENCH_TYPES.campaignIntegrations, 'surface', () => t('integrations.title', 'Integrations'), 'campaignIntegrations', () => t('integrations.card_summary', 'Every outside service: connected or not, its token, its Workspaces.'));
  campaign(WORKBENCH_TYPES.campaignJira, 'surface', () => t('jira.title', 'Jira'), 'campaignJira', () => t('jira.card_summary', 'This office’s Jira space: connect, check, sync.'));
  campaign(WORKBENCH_TYPES.campaignMachine, 'tabs', () => t('campaign_view.machine', 'Machine'), 'campaignMachine', () => t('campaign_view.machine_summary', 'Themes · Desk · Account · Archived · Messages · Help desk · Keypad.'));
  // MACHINE STATUS (owner, 2026-11-20; KAN-759): the one complete truth, an office-output kept current.
  campaign(WORKBENCH_TYPES.campaignMachineStatus, 'surface', () => t('machine_status.title', 'Machine status'), 'campaignMachineStatus', () => t('machine_status.summary', 'What this office has set up, what it hasn\u2019t and what is available, in one doc any Agent reads, kept current.'));
  // THE CLOUD ACCOUNT (owner, 2026-11-06; KAN-282): its own worksurface in the Machine Settings group,
  // read-only, the same card Configuration ends with (js/account-card.js).
  campaign(WORKBENCH_TYPES.campaignCloudAccount, 'surface', () => t('campaign_view.cloud_account', 'Cloud Account'), 'campaignCloudAccount', () => t('campaign_view.cloud_account_summary', 'Where this Ronin lives (self-hosted, or an office on an office_park) and its Ronin HQ account, subscription and house-model usage. Read-only.'));
  if (MULTIPLE_CAMPAIGNS_ENABLED) campaign(WORKBENCH_TYPES.campaignCreate, 'surface', () => t('campaign.new', 'New Desk'), 'campaignCreate', () => t('campaign_view.new_summary', 'Set the stage. It creates no Team and launches no Agent.'), { variant: 'dotted' });
  profiles.define(WORKBENCH_PROFILES.launch, [WORKBENCH_TYPES.launchTeam, WORKBENCH_TYPES.launchAgent, WORKBENCH_TYPES.launchHelp, BEHAVIOUR_SURFACE_TYPE, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.cowork, [WORKBENCH_TYPES.roster, WORKBENCH_TYPES.sessionRoster, WORKBENCH_TYPES.cron, WORKBENCH_TYPES.team, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newTeamForm, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.newItem, WORKBENCH_TYPES.archives, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.agent, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.agentComposition, WORKBENCH_TYPES.agentDocuments, WORKBENCH_TYPES.agentTeams, WORKBENCH_TYPES.workItems, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  // A hosted office's Settings offers no account, registration or password cards:
  // those live in the Business Lounge and on the office_park (hosted.js).
  const notHosted = (...types) => (HOSTED ? [] : types);
  profiles.define(WORKBENCH_PROFILES.campaign, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.campaignMachine, WORKBENCH_TYPES.campaignMachineStatus, ...notHosted(WORKBENCH_TYPES.campaignCloudAccount), BEHAVIOUR_SURFACE_TYPE, ...notHosted(PASSWORD_SURFACE_TYPE), PROVIDER_SURFACE_TYPE, ...notHosted(SETUP_SURFACE_TYPES.register), FEEDBACK_TYPE, WORKBENCH_TYPES.campaignIdentity, WORKBENCH_TYPES.campaignDefaults, WORKBENCH_TYPES.campaignRoots, SETUP_SURFACE_TYPES.launchOwn, WORKBENCH_TYPES.document, WORKBENCH_TYPES.campaignIntegrations, WORKBENCH_TYPES.campaignJira, WORKBENCH_TYPES.campaignJiraItems, WORKBENCH_TYPES.campaignJiraPairs, ...(MULTIPLE_CAMPAIGNS_ENABLED ? [WORKBENCH_TYPES.campaignCreate] : [])]);
  // HOME'S DOORS (owner, 2026-10-19; door-workbenches.js): Models and Workspaces are workbenches of
  // their own; Teams is the Cowork workbench above (owner, 2026-10-20).
  // THE MODELS WORKBENCH (owner, 2026-10-19): its own stones in Workspace 1; one provider whole in a
  // workspace, placed by a dragged stone or its selector card (models-surface.js). THE CARDS FOLLOW THE
  // TEAM PAGE (owner, 2026-10-20): a provider's or folder's card is an entity card like an Agent's
  // (wk-selector-entity, the terminal's class); the three admin doors are dotted like New Agent; the
  // stones surface heads the selector as a solid card, as the Teams card heads the Cowork selector.
  // THE AGENT HARNESS WORKBENCH (KAN-236; owner, 2026-11-04): the same stones, now the Harness card; Refresh the
  // Model refresh surface under its new word. The Accounts and Models (preset) cards are gone (owner, 26 Nov 2026):
  // model services and their model entries are Settings' Model services card.
  add({ type: WORKBENCH_TYPES.modelStones, header: 'surface', className: 'wk-selector-utility', label: () => t('harness.stones', 'Harness'), summary: () => t('harness.stones_summary', 'The CLIs: install, sign in, ready'), create: ({ workspace, environment }) => environment.modelStones(workspace) });
  // Refresh (owner, 2026-10-20; the word 2026-11-04): the Refresh all door the stones do not carry, a solid utility card.
  add({ type: WORKBENCH_TYPES.modelRefresh, header: 'surface', className: 'wk-selector-utility', label: () => t('harness.refresh', 'Refresh'), summary: () => t('harness.refresh_summary', 'One press: harnesses, model services'), create: ({ workspace, environment }) => environment.modelRefresh(workspace) });
  // Defaults (owner, 2026-10-21): the model a new Agent, a new Team lead and Mika start on, a solid utility card after Model refresh.
  add({ type: WORKBENCH_TYPES.modelDefaults, header: 'surface', className: 'wk-selector-utility', label: () => t('models.defaults', 'Defaults'), summary: () => t('models.defaults_summary', 'Agent · Team lead · Mika'), create: ({ workspace, environment }) => environment.modelDefaults(workspace) });
  add({ type: WORKBENCH_TYPES.modelHarness, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.providers(), create: ({ workspace, detail, environment }) => environment.modelHarness(workspace, detail) });
  add({ type: WORKBENCH_TYPES.modelMika, header: 'terminal', label: () => 'Mika', discover: () => [], create: ({ environment }) => environment.modelMika() });
  profiles.define(WORKBENCH_PROFILES.models, [WORKBENCH_TYPES.modelStones, WORKBENCH_TYPES.modelRefresh, WORKBENCH_TYPES.modelDefaults, WORKBENCH_TYPES.modelHarness, WORKBENCH_TYPES.modelMika]);
  // THE WORKSPACES WORKBENCH (owner, 2026-11-02): the stones of Workspaces in Tilespace 1, a pressed one's
  // page beside them; a card per Workspace, opened whole; New Workspace and GitHub CLI dotted (workspaces-surface.js).
  add({ type: WORKBENCH_TYPES.workspaceRecords, header: 'surface', className: 'wk-selector-utility', label: () => t('workspaces.title', 'Workspaces'), create: ({ workspace, environment }) => environment.workspaceRecords(workspace) });
  add({ type: WORKBENCH_TYPES.workspaceRecord, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.workspaces(), create: ({ workspace, detail, environment }) => environment.workspaceRecord(workspace, detail) });
  add({ type: WORKBENCH_TYPES.workspaceNew, header: 'surface', className: 'wk-selector-utility', label: () => t('workspaces.new', 'New Workspace'), summary: () => t('workspaces.new_state', 'a project for your Teams'), variant: 'dotted', create: ({ workspace, environment }) => environment.workspaceNew(workspace) });
  add({ type: WORKBENCH_TYPES.folderGithub, header: 'surface', className: 'wk-selector-utility', label: () => t('roots.github_auth_stone', 'GitHub CLI'), summary: () => t('roots.github_auth_state', 'Connect account'), variant: 'dotted', create: ({ workspace, environment }) => environment.folderGithub(workspace) });
  add({ type: WORKBENCH_TYPES.githubMika, header: 'terminal', label: () => 'Mika', discover: () => [], create: ({ environment }) => environment.githubMika() });
  profiles.define(WORKBENCH_PROFILES.workspaces, [WORKBENCH_TYPES.workspaceRecords, WORKBENCH_TYPES.workspaceRecord, WORKBENCH_TYPES.workspaceNew, FILES_TYPE]); // no GitHub CLI here (owner, 2026-11-23): a machine's sign-in is setup, not a Workspace
  // THE EPICS WORKBENCH (owner, 2026-11-02; KAN-187): a stone per Epic in Tilespace 1, a pressed one's reading
  // beside them; a dragged stone places that Epic whole, never offered in the selector (epics-surface.js).
  add({ type: WORKBENCH_TYPES.epicRecords, header: 'surface', className: 'wk-selector-utility', label: () => t('epics.title', 'Epics'), create: ({ workspace, environment }) => environment.epicRecords(workspace) });
  add({ type: WORKBENCH_TYPES.epicRecord, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.epics(), create: ({ workspace, detail, environment }) => environment.epicRecord(workspace, detail) });
  add({ type: WORKBENCH_TYPES.epicNew, header: 'surface', className: 'wk-selector-utility', label: () => t('epics.new', 'New Epic'), summary: () => t('epics.new_state', 'title · goal · who holds it'), variant: 'dotted', create: ({ workspace, environment }) => environment.epicNew(workspace) });
  profiles.define(WORKBENCH_PROFILES.epics, [WORKBENCH_TYPES.epicRecords, WORKBENCH_TYPES.epicRecord, WORKBENCH_TYPES.epicNew]);
  // THE TEAM PAGE (owner, 2026-10-18): the selector holds Commons, the Agents, New Agent and the
  // hints (Agent vocabulary, Session controls — the selector's own, workbench.js). The composition
  // reader, Behaviors and Feedback stay placeable: the roster, New Agent and the bar place them.
  // Archived Agents goes before New Agent (KAN-706).
  // Epics follows Commons (KAN-232), Find item follows Epics (KAN-433); an Epic's record is placed by a pressed Epic stone, never a card.
  // Defined after the Epics types: a profile names only registered types.
  // A document or a commit dragged from a Chat opens on a Document surface (KAN-707).
  profiles.define(WORKBENCH_PROFILES.team, [WORKBENCH_TYPES.commons, WORKBENCH_TYPES.teamEpics, WORKBENCH_TYPES.teamFindItem, WORKBENCH_TYPES.epicRecord, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.canvas, WORKBENCH_TYPES.teamArchived, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.newItem, WORKBENCH_TYPES.agentComposition, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE, FEEDBACK_TYPE]);
  // THE HELP WORKBENCH (owner, 2026-10-21): the help outline and Mika in chat, both solid cards (door-workbenches.js).
  add({ type: WORKBENCH_TYPES.helpOutline, header: 'surface', className: 'wk-selector-utility', label: () => t('help_outline.title', 'Help'), summary: () => t('help_outline.summary', 'The guides, starting with the four things to know'), create: ({ environment }) => environment.helpOutline() });
  add({ type: WORKBENCH_TYPES.helpMika, header: 'terminal', className: 'wk-selector-utility', label: () => 'Mika', summary: () => t('help_outline.mika_summary', 'Ask in plain words'), create: ({ environment }) => environment.helpMika() });
  // One help page whole in a workspace, placed by a dragged stone (help-outline.js); no selector cards.
  add({ type: WORKBENCH_TYPES.helpPage, header: 'surface', label: () => t('help_outline.title', 'Help'), discover: () => [], create: ({ detail, environment }) => environment.helpPage(detail) });
  profiles.define(WORKBENCH_PROFILES.help, [WORKBENCH_TYPES.helpOutline, WORKBENCH_TYPES.helpMika, WORKBENCH_TYPES.helpPage]);
  // SETTINGS V2 (owner, 2026-11-25; KAN-862, KAN-867): built beside Settings to compare; the old one goes once v2 is right.
  // The five agreed sections (MACHINE_SETTINGS_V2.md). Its own card types where its words differ from the Harnesses
  // door's; the surfaces under them are today's, reused. A harness's own card is placed by its stone, not offered.
  // Model services (KAN-870): one record per connection; tabs Ronin Gateway, API key and OpenRouter.
  campaign(WORKBENCH_TYPES.settings2ModelServices, 'surface', () => t('settings2.model_services', 'Model services'), 'settings2ModelServices', () => t('settings2.model_services_summary', 'Ronin Gateway, OpenRouter and your API keys, and the model entries each offers.'));
  // Office defaults (KAN-871): the starting models live with mandate, launch mode and behaviors.
  campaign(WORKBENCH_TYPES.settings2AgentDefaults, 'surface', () => t('settings2.agent_defaults', 'Agent defaults'), 'settings2AgentDefaults', () => t('settings2.agent_defaults_summary', 'Model, mandate, launch mode and behaviors new Agents and Teams start with.'));
  campaign(WORKBENCH_TYPES.settings2BehaviorFiles, 'surface', () => t('settings2.behavior_files', 'Behavior files'), 'settings2BehaviorFiles', () => t('settings2.behavior_files_summary', 'Read and edit the behavior, fact and tool files themselves.'));
  campaign(WORKBENCH_TYPES.settings2Stats, 'surface', () => t('settings2.stats', 'Machine stats'), 'settings2Stats', () => t('settings2.stats_summary', 'Tool-call activity on this machine.'));
  profiles.define(WORKBENCH_PROFILES.settings2, [
    WORKBENCH_TYPES.modelStones, WORKBENCH_TYPES.settings2ModelServices,
    WORKBENCH_TYPES.settings2AgentDefaults,
    // Jira has no card of its own: it is set up under Integrations (owner, 26 Nov).
    WORKBENCH_TYPES.campaignRoots, WORKBENCH_TYPES.campaignIntegrations,
    WORKBENCH_TYPES.settings2BehaviorFiles, WORKBENCH_TYPES.campaignMachineStatus, WORKBENCH_TYPES.settings2Stats, FILES_TYPE,
    FEEDBACK_TYPE,
    WORKBENCH_TYPES.modelHarness, WORKBENCH_TYPES.modelMika, WORKBENCH_TYPES.campaignJiraItems, WORKBENCH_TYPES.campaignJiraPairs, WORKBENCH_TYPES.document,
  ]);
  registered = true;
}
