/* The one Workbench surface catalog. Destinations provide resident data; this module
 * alone registers stable surface identities and decides which profiles expose them. */
import { WorkspaceKit } from './workspace-kit.js';
import { t } from './lexicon.js';
import { FEEDBACK_TYPE, registerFeedbackSurface } from './feedback.js';
import { FILES_TYPE, registerFilesSurface } from './files-surface.js';
import { BEHAVIOUR_SURFACE_TYPE, registerBehaviourSurface } from './behaviour-surface.js';
import { registerSetupSurfaces } from './setup-surfaces.js';
import { AGENT_COMPOSITION_TYPE } from './agent-composition.js';
import { WORK_ITEMS_TYPE } from './work-items-surface.js';
import { HELP_PAGE_TYPE } from './help-outline.js';

export const WORKBENCH_PROFILES = Object.freeze({ launch: 'launch', cowork: 'cowork', team: 'team', agent: 'agent', workspaces: 'workspaces', epics: 'epics', help: 'help', settings2: 'settings2' });
export const WORKBENCH_TYPES = Object.freeze({
  document: 'document', terminal: 'session.terminal', behaviours: BEHAVIOUR_SURFACE_TYPE, feedback: FEEDBACK_TYPE, files: FILES_TYPE,
  launchTeam: 'launch.team', launchAgent: 'launch.agent', launchHelp: 'launch.help',
  commons: 'team.commons', workItems: WORK_ITEMS_TYPE, cron: 'cowork.cron-jobs',
  roster: 'cowork.team-roster', sessionRoster: 'cowork.session-roster', newTeamForm: 'cowork.new-team-form', newAgent: 'session.new-agent', newItem: 'session.new-item',
  team: 'team.profile', archives: 'cowork.archives', teamArchived: 'team.archived', teamEpics: 'team.epics', teamFindItem: 'team.find-item',
  agentDocuments: 'agent.documents', agentTeams: 'agent.team-membership', agentComposition: AGENT_COMPOSITION_TYPE,
  campaignMachineStatus: 'campaign.machine-status', campaignRoots: 'campaign.workspaces',
  campaignIntegrations: 'campaign.integrations', campaignJiraItems: 'campaign.jira-items', campaignJiraPairs: 'campaign.jira-pairs',
  modelStones: 'models.stones', modelHarness: 'models.provider',
  helpOutline: 'help.outline', helpMika: 'help.mika', helpPage: HELP_PAGE_TYPE,
  workspaceRecords: 'workspaces.records', workspaceRecord: 'workspaces.record', workspaceNew: 'workspaces.new', epicNew: 'epics.new', folderGithub: 'workspaces.github', githubMika: 'workspaces.github-mika',
  epicRecords: 'epics.records', epicRecord: 'epics.record',
  settings2ModelServices: 'settings2.model-services',
  settings2AgentDefaults: 'settings2.agent-defaults', settings2MembersSee: 'settings2.members-see', settings2BehaviorFiles: 'settings2.behavior-files', settings2Stats: 'settings2.stats',
  canvas: 'team.canvas',
});

let registered = false;
export function registerWorkbenchCatalog() {
  if (registered) return;
  registerFeedbackSurface(); registerFilesSurface(); registerBehaviourSurface();
  registerSetupSurfaces();
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
  add({ type: WORKBENCH_TYPES.newTeamForm, header: 'surface', className: 'wk-selector-utility wk-selector-group-after', label: () => t('new_team.title', 'New Team'), summary: () => t('new_team.card_summary', 'Name, Workspace, Agents and Epic.'), variant: 'dotted', create: ({ workspace, environment, consumed }) => environment.newTeamForm(workspace, consumed) });
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
  campaign(WORKBENCH_TYPES.campaignRoots, 'surface', () => t('campaign_view.workspaces', 'Workspaces'), 'campaignRoots', (e) => e.rootsSummary());
  // Placed by the Jira panel's Open, never offered in the selector.
  add({ type: WORKBENCH_TYPES.campaignJiraItems, header: 'surface', discover: () => [], create: (context) => context.environment.campaignJiraItems(context) });
  add({ type: WORKBENCH_TYPES.campaignJiraPairs, header: 'surface', discover: () => [], create: (context) => context.environment.campaignJiraPairs(context) });
  // THE INTEGRATIONS PANEL (KAN-339): every integration in one frame, Jira's panel inside it.
  campaign(WORKBENCH_TYPES.campaignIntegrations, 'surface', () => t('integrations.title', 'Integrations'), 'campaignIntegrations', () => t('integrations.card_summary', 'Every outside service: connected or not, its token, its Workspaces.'));
  // MACHINE STATUS (owner, 2026-11-20; KAN-759): the one complete truth, an office-output kept current.
  campaign(WORKBENCH_TYPES.campaignMachineStatus, 'surface', () => t('machine_status.title', 'Machine status'), 'campaignMachineStatus', () => t('machine_status.summary', 'What this office has set up, what it hasn\u2019t and what is available, in one doc any Agent reads, kept current.'));
  profiles.define(WORKBENCH_PROFILES.launch, [WORKBENCH_TYPES.launchTeam, WORKBENCH_TYPES.launchAgent, WORKBENCH_TYPES.launchHelp, BEHAVIOUR_SURFACE_TYPE, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.cowork, [WORKBENCH_TYPES.roster, WORKBENCH_TYPES.sessionRoster, WORKBENCH_TYPES.cron, WORKBENCH_TYPES.team, WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.newTeamForm, WORKBENCH_TYPES.newAgent, WORKBENCH_TYPES.newItem, WORKBENCH_TYPES.archives, WORKBENCH_TYPES.document, BEHAVIOUR_SURFACE_TYPE, FEEDBACK_TYPE]);
  profiles.define(WORKBENCH_PROFILES.agent, [WORKBENCH_TYPES.terminal, WORKBENCH_TYPES.agentComposition, WORKBENCH_TYPES.agentDocuments, WORKBENCH_TYPES.agentTeams, WORKBENCH_TYPES.workItems, WORKBENCH_TYPES.document, FEEDBACK_TYPE]);
  // SETTINGS' HARNESS CARDS: the stones of harnesses (Harness), and one card per harness,
  // an entity card placing that harness whole (models-surface.js).
  add({ type: WORKBENCH_TYPES.modelStones, header: 'surface', className: 'wk-selector-utility', label: () => t('harness.stones', 'Harness'), summary: () => t('harness.stones_summary', 'The CLIs: install, model services'), create: ({ workspace, environment }) => environment.modelStones(workspace) });
  add({ type: WORKBENCH_TYPES.modelHarness, header: 'surface', className: 'wk-selector-entity', discover: (_t, e) => e.providers(), create: ({ workspace, detail, environment }) => environment.modelHarness(workspace, detail) });
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
  // Appliance Access (KAN-955, KAN-973): which workbenches the people invited from the Business Lounge are shown
  // (members-see-surface.js). Offered only when an appliance (a folder workbench) is set up.
  campaign(WORKBENCH_TYPES.settings2MembersSee, 'surface', () => t('settings2.appliance_access', 'Appliance Access'), 'settings2MembersSee', () => t('settings2.appliance_access_summary', 'People invited from the Business Lounge see only these workbenches and land on the first.'), { discover: (_t, e) => (e.appliances?.().length ? [{}] : []) });
  campaign(WORKBENCH_TYPES.settings2BehaviorFiles, 'surface', () => t('settings2.behavior_files', 'Behavior files'), 'settings2BehaviorFiles', () => t('settings2.behavior_files_summary', 'Read and edit the behavior, fact and tool files themselves.'));
  campaign(WORKBENCH_TYPES.settings2Stats, 'surface', () => t('settings2.stats', 'Machine stats'), 'settings2Stats', () => t('settings2.stats_summary', 'Tool-call activity on this machine.'));
  profiles.define(WORKBENCH_PROFILES.settings2, [
    WORKBENCH_TYPES.modelStones, WORKBENCH_TYPES.settings2ModelServices,
    WORKBENCH_TYPES.settings2AgentDefaults, WORKBENCH_TYPES.settings2MembersSee,
    // Jira has no card of its own: it is set up under Integrations (owner, 26 Nov).
    WORKBENCH_TYPES.campaignRoots, WORKBENCH_TYPES.campaignIntegrations,
    WORKBENCH_TYPES.settings2BehaviorFiles, WORKBENCH_TYPES.campaignMachineStatus, WORKBENCH_TYPES.settings2Stats, FILES_TYPE,
    FEEDBACK_TYPE,
    WORKBENCH_TYPES.modelHarness, WORKBENCH_TYPES.campaignJiraItems, WORKBENCH_TYPES.campaignJiraPairs, WORKBENCH_TYPES.document,
  ]);
  registered = true;
}
