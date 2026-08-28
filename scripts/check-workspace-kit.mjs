#!/usr/bin/env node
import fs from 'node:fs';

const problems = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const league = read('public/js/league-view.js') + read('public/js/league-board.js');
const team = read('public/js/cowork-view.js');
const controller = read('public/js/team-controller.js');
const kit = read('public/js/workspace-kit.js') + read('public/js/workspace-adapters.js');
const layouts = read('public/js/workspace-layouts.js');
const terminal = read('public/js/terminal-tile-host.js');
const primitives = read('public/js/workspace-primitives.js');
const newTeam = read('public/js/new-team.js');
const agentConfig = read('public/js/agent-config.js');
const agentFields = read('public/js/agent-config-fields.js');
const agentPreview = read('public/js/agent-config-preview.js');
const agentStyles = read('public/css/agent-configuration.css').replace(/\s+/g, ' ');
const styles = read('public/workspace-kit.css').replace(/\s+/g, ' ');
const preflight = read('src/routes/launch-preflight.ts');
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
if (/createWorkbenchLayout\([^{)]/.test(team)) problems.push('Team must hand the Workbench a declaration, not positional surfaces.');
if (!team.includes('declaration:') || !team.includes('arrangement: workbench.arrangement')) problems.push('Team must declare its slots and expose its arrangement.');
for (const file of fs.readdirSync('public/js')) {
  if (file.startsWith('workspace-')) continue;
  const source = read(`public/js/${file}`);
  if (/gridTemplateColumns|wk-workbench-splitter/.test(source)) problems.push(`${file} reaches into Workbench geometry; only the Kit lays out slots.`);
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
if (!newTeam.includes("workspaceTarget('agent-config'")) problems.push('New Team must use typed navigation for seat configuration.');
if (!newTeam.includes('registerTeamDraft') || !newTeam.includes("patchViewState('new-team'")) problems.push('New Team must use the canonical persisted draft controller.');
for (const contract of ['createAction', 'createActionBar', 'fields.form.actions.append(actions.el)']) {
  if (!agentConfig.includes(contract)) problems.push(`Agent Configuration must consume the Kit form-action contract: ${contract}.`);
}
if (/document\.createElement\(['"]button['"]\)/.test(agentConfig)) problems.push('Agent Configuration must not construct feature-local action buttons.');
for (const contract of ['ac-form', 'ac-fields', 'ac-field', 'ac-control']) {
  if (!agentFields.includes(contract)) problems.push(`Agent Configuration fields are missing the governed feature hook ${contract}.`);
}
if (!agentPreview.includes('ac-preview-body')) problems.push('Agent Configuration preview is missing its governed feature hierarchy hook.');
if (!agentPreview.includes('resolved.stated_by?.[key]')) problems.push('Agent Configuration must render server-returned stated_by attribution.');
if (!agentPreview.includes('resolved.birth_reading')) problems.push('Agent Configuration must render the server-returned birth reading list.');
if (!preflight.includes('stated_by: resolved.stated_by')) problems.push('Launch preflight must publish canonical resolver attribution unchanged.');
if (!preflight.includes('birth_reading: resolved.birth_reading')) problems.push('Launch preflight must publish canonical birth readings unchanged.');
for (const contract of ['.ac-field {', '.ac-actions[data-dirty=', '.ac-preview-brief {', '.ac-preview-rows {']) {
  if (!agentStyles.includes(contract)) problems.push(`Agent Configuration feature styling is missing ${contract}.`);
}
if (!preflight.includes('proposedRoster') || !preflight.includes('isCreatableTeamName')) problems.push('Preflight must use proposed Team defaults and canonical name availability.');
if (!rosters.includes("isReservedTeamName = (s: string): boolean => s === 'unassigned'")) problems.push('The canonical Team store must reserve the Unassigned holding token.');
for (const file of ['league-board.js', 'cowork-view.js', 'new-team.js']) {
  const source = read(`public/js/${file}`);
  if (/className\s*=\s*['"](?:action-bar|metadata)['"]/.test(source)) problems.push(`${file} copies a shared foundation primitive.`);
}
if (problems.length) { for (const problem of problems) console.log(`  ✗ ${problem}`); process.exit(1); }
console.log('  ok — prioritized views consume the one Workspace Kit foundation');
