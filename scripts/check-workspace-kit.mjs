#!/usr/bin/env node
import fs from 'node:fs';

const problems = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const league = read('public/js/cowork-view.js');
const team = read('public/js/cowork-view.js');
const controller = read('public/js/team-controller.js');
const kit = read('public/js/workspace-kit.js') + read('public/js/workspace-adapters.js');
const layouts = read('public/js/workspace-layouts.js');
const arrangement = read('public/js/workspace-arrangement.js');
const campaign = read('public/js/campaign-view.js');
const projectRoots = read('public/js/projectroots.js');
const addAgent = read('public/js/add-agent.js');
const newAgent = read('public/js/new-agent.js');
const campaignRoutines = read('public/js/campaign-routines.js');
const teamConfiguration = read('public/js/team-configuration.js');
const coworkCommons = read('public/js/cowork-commons.js');
const workbench = read('public/js/workbench.js');
const terminal = read('public/js/terminal-tile-host.js');
const primitives = read('public/js/workspace-primitives.js');
const newTeam = read('public/js/new-team-form.js');
const styles = read('public/workspace-kit.css').replace(/\s+/g, ' ');
const rosters = read('src/team-rosters.ts');
const leagueCards = /\.wk-league-board \[data-surface='cards'\] \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(auto-fill, minmax\(17rem, 1fr\)\);[^}]*gap: var\(--space-6\);[^}]*align-content: start;[^}]*\}/;
const leagueCardsPhone = /@media \(max-width: 680px\) \{[^}]*\.wk-league-board \[data-surface='cards'\] \{[^}]*grid-template-columns: 1fr;[^}]*\}/;
if (!leagueCards.test(styles)) problems.push('The Kit must own the complete League cards desktop grid geometry.');
if (!leagueCardsPhone.test(styles)) problems.push('The Kit must own the League cards phone single-column geometry.');
// The managed Workbench is a slot ARRANGEMENT (workspace-arrangement.js): a declaration
// in, N slots out, the layout map in the bar as its control. No chevron rails, no fixed
// slot names, no per-combination column table anywhere.
for (const contract of ['wk-workbench-host', 'wk-workbench-splitter', 'onStateChange', "addEventListener('pointerdown'", "addEventListener('keydown'", "from './workspace-arrangement.js'", 'declareArrangement(', 'arrangement']) {
  if (!layouts.includes(contract) && !styles.includes(contract)) problems.push(`The Kit managed Workbench contract is missing ${contract}.`);
}
for (const geometry of ['.wk-workbench-host {', '.wk-workbench-splitter {', '.wk-layout-map {', '.wk-layout-map-slot {', '.wk-view-map:empty {']) {
  if (!styles.includes(geometry)) problems.push(`The Kit must own managed Workbench geometry for ${geometry}`);
}
for (const retired of ['wk-workbench-rails', 'wk-workbench-expand', 'wk-workbench-collapse', "data-open='"]) {
  if (layouts.includes(retired) || styles.includes(retired) || read('public/style.css').includes(retired)) problems.push(`The Workbench retired ${retired}; the layout map is the one control.`);
}
if (!primitives.includes('createLayoutMap')) problems.push('The Kit primitives must own the layout map.');
if (!read('public/js/workspace.js').includes('createLayoutMap')) problems.push('The ViewHost must draw the layout map for a view that exposes an arrangement.');
if (!layouts.includes('createSurfaceHeader') || !layouts.includes('dataset.workbenchHeader')) problems.push('The Workbench layout must own the permanent header of every ordinary declared slot.');
if (!arrangement.includes('composite: slot.composite === true')) problems.push('The Workbench declaration must preserve composite workspace stacks so the frame cannot double-head them.');
for (const contract of ['WorkbenchLibrary', 'WorkbenchProfiles', 'WORKBENCH_IDS', "['workspace1', 'workspace2', 'workspace3', 'workspace4']", 'tenant', 'profile.types', 'definition.create']) if (!workbench.includes(contract)) problems.push(`The sealed Workbench is missing ${contract}.`);
if (!/name: 'workspace1'[\s\S]*name: 'selector'[\s\S]*name: 'workspace2'/.test(workbench)) problems.push('The fixed Workbench opening order must be workspace1, selector, workspace2.');
if (/team_arrangement|profileOrder/.test(team)) problems.push('A desk profile must not move the fixed Workbench columns; saved instance state is the only arrangement override.');
for (const [name, source] of [['Campaign', campaign], ['Cowork/Team', team]]) {
  if (!source.includes('WorkspaceKit.workbench.create({')) problems.push(`${name} must instantiate the one high-level Workbench.`);
  if (/createWorkbenchLayout|\b(?:cv-selector-head|tw-roster-head|tw-column|tw-cell)\b/.test(source)) problems.push(`${name} owns Workbench frame/header geometry instead of supplying a profile and tenant.`);
}
if (read('public/js/workspace-kit.js').includes('createWorkbenchLayout')) problems.push('The low-level Workbench layout must not be exposed to consumers; only WorkspaceKit.workbench.create is public.');
for (const file of fs.readdirSync('public/js')) {
  if (['workspace-layouts.js', 'workbench.js'].includes(file)) continue;
  const source = read(`public/js/${file}`);
  if (/createWorkbenchLayout|gridTemplateColumns|wk-workbench-(?:splitter|column|cell|selector)/.test(source)) problems.push(`${file} reaches into Workbench construction; only workbench.js owns it.`);
}
if (!/@media \(max-width: 680px\) \{.*\.wk-workbench-host \{[^}]*flex-direction: column;/.test(styles)) problems.push('The Kit must own managed Workbench phone composition.');
if (!league.includes("'./team-controller.js'")) problems.push('League must consume the shared Team controller.');
if (!controller.includes("request('/api/team-rosters'")) problems.push('The Team controller must own durable roster refresh.');
if (/request\(`?\/api\/teams\//.test(team)) problems.push('Team must not create a feature-local live Team projection.');
if (fs.existsSync('public/js/teams-store.js')) problems.push('teams-store.js is a parallel Team projection; use team-controller.js.');
if (!kit.includes('createTerminalTileHost') || !team.includes('createTerminalTileHost')) problems.push('Team must consume the one Kit terminal Tile host.');
for (const method of ['mount', 'switchSession', 'park', 'destroy', 'fit', 'send']) {
  if (!terminal.includes(`const ${method} =`) && !terminal.includes(`${method}:`)) problems.push(`Terminal Tile host is missing ${method}().`);
}
for (const hook of ['mount', 'enter', 'leave', 'destroy']) {
  if (!primitives.includes(`invoke('${hook}'`)) problems.push(`Channel services are missing ${hook} lifecycle.`);
}
if (!team.includes('teamWorkspaceState(context.state,')) problems.push('Team must consume typed workspace state.');
// NEW TEAM CREATES A TEAM AND HANDS THE WORKSPACE TO IT (owner, 2026-08-29): one write
// through the canonical roster door, and no seat-building, launch or retry path of its
// own — staffing is the New Agent launcher's, which already names the Team at birth.
if (!newTeam.includes("request('/api/team-rosters'")) problems.push('New Team must create through the canonical roster door.');
for (const retired of ['new-team-launch.js', 'new-team-preflight.js', 'team-draft-controller.js', 'agent-config']) {
  if (newTeam.includes(`'./${retired}'`) || newTeam.includes(`'${retired}'`)) problems.push(`New Team retired ${retired}; a Team is created and then staffed with New Agent.`);
}
for (const gone of ['public/js/new-team-launch.js', 'public/js/new-team-preflight.js', 'public/js/team-draft-controller.js', 'public/js/agent-config.js', 'src/routes/launch-preflight.ts', 'public/js/new-team.js', 'public/js/launcher.js', 'public/js/rolefamilies.js']) {
  if (fs.existsSync(gone)) problems.push(`${gone} is a retired New Team seat path; the surface creates a Team and stops.`);
}
if (!read('public/js/cowork-view.js').includes('createNewTeamFormView(WorkspaceKit, {')) problems.push('The Cowork space must own where New Team lands after a create.');
// CAMPAIGN MACHINE SETTINGS — Desk profile remains a restorable library type while its
// beta card stays out of discovery. Ronin Desk takes that default seat; Themes leads its
// tabs and Desk closes them.
if (!campaign.includes('type !== TYPES.create && type !== TYPES.profile')) problems.push('Campaign discovery must hide the beta Desk profile card without removing its registered surface.');
// The default view (owner, 2026-09-03): Ronin Desk, Templates, Agent defaults, Project roots — in that order.
if (!campaign.includes('workspace1: TYPES.machine, workspace2: TYPES.templates, workspace3: TYPES.defaults, workspace4: TYPES.roots')) problems.push('Campaign default view must be Ronin Desk · Templates · Agent defaults · Project roots, four up.');
if (!campaign.includes("['themes', 'account', 'archives', 'messages', 'help', 'keypad', 'health']")) problems.push('Ronin Desk tabs must put Themes first and Desk last.');
for (const contract of ["pane('themes'", "'Desktop'", "'Mobile'", "save('theme')", "save('theme_mobile')"]) {
  if (!coworkCommons.includes(contract)) problems.push(`Ronin Desk Themes is missing ${contract}.`);
}
// WORKTREES HAS TWO VISIBLE, INDEPENDENT ANSWERS. Campaign seeds future repository
// permission; Project Roots owns each repository answer; Add Agent reports the resolved
// Routine capability. None may fall back to the retired desks/coordination vocabulary.
for (const contract of ['Worktrees for new project roots', 'Allow Ronin Worktrees', 'separate working folder and branch', 'without clobbering each other', 'Team lead to merge deliberately', 'change an existing repository on its Project Root card']) {
  if (!campaign.includes(contract)) problems.push(`Campaign Project Roots is missing the Worktrees seed teaching: ${contract}.`);
}
for (const contract of ['repo needs Worktrees on', 'Agent needs Worktrees on', "group_root', 'Project Root", "group_repository', 'Repository workflow", 'This controls the repo', 'Repository: Worktrees allowed', 'Repository: use checkout']) {
  if (!projectRoots.includes(contract)) problems.push(`Project Root UI is missing the Worktrees information hierarchy: ${contract}.`);
}
if (!read('public/style.css').includes('.pr-f[hidden]')) problems.push('Project Root direct publishing must actually hide the reviewed-only working branch field.');
for (const retired of ['New projects use desks?', "'Desks'", "'None'", 'desks box', "'coordination'"]) {
  if (campaign.includes(retired) || projectRoots.includes(retired)) problems.push(`Campaign/Project Root UI still exposes retired Worktrees wording: ${retired}.`);
}
for (const [surface, source] of [['Campaign', campaignRoutines], ['New Team', newTeam], ['Team configuration', teamConfiguration]]) {
  if (!source.includes('working folder and branch') || !source.includes('repo have Worktrees on') || !source.includes('managed hand-in and Team-lead merge process')) problems.push(`${surface} must explain Worktrees isolation, the Agent/repo condition, and managed hand-in.`);
}
if (!newAgent.includes('routineOverrides') || !newAgent.includes("routines: { ...draft.routineOverrides }") || !newAgent.includes('file changes do not collide') || !newAgent.includes('managed hand-in and Team-lead merge process')) problems.push('New Agent must submit sparse Worktrees overrides and explain isolation, both switches, and managed hand-in.');
if (!addAgent.includes('worktreesOverride') || !addAgent.includes('file changes do not collide') || !addAgent.includes('both the Agent and repo have Worktrees on')) problems.push('Add Agent must allow the Worktrees choice and explain isolation plus the Agent/repo condition.');
if (!rosters.includes("isReservedTeamName = (s: string): boolean => s === 'unassigned'")) problems.push('The canonical Team store must reserve the Unassigned holding token.');
for (const file of ['cowork-view.js', 'new-team-form.js', 'new-agent.js', 'launch-view.js']) {
  const source = read(`public/js/${file}`);
  if (/className\s*=\s*['"](?:action-bar|metadata)['"]/.test(source)) problems.push(`${file} copies a shared foundation primitive.`);
}
if (problems.length) { for (const problem of problems) console.log(`  ✗ ${problem}`); process.exit(1); }
console.log('  ok — prioritized views consume the one Workspace Kit foundation');
