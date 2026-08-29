#!/usr/bin/env node
import fs from 'node:fs';

const problems = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const league = read('public/js/cowork-view.js');
const team = read('public/js/cowork-view.js');
const controller = read('public/js/team-controller.js');
const kit = read('public/js/workspace-kit.js') + read('public/js/workspace-adapters.js');
const layouts = read('public/js/workspace-layouts.js');
const terminal = read('public/js/terminal-tile-host.js');
const primitives = read('public/js/workspace-primitives.js');
const newTeam = read('public/js/new-team.js');
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
// NEW TEAM CREATES A TEAM AND HANDS THE WORKSPACE TO IT (owner, 2026-08-29): one write
// through the canonical roster door, and no seat-building, launch or retry path of its
// own — staffing is the New Agent launcher's, which already names the Team at birth.
if (!newTeam.includes("patchViewState('new-team'")) problems.push('New Team must persist its draft through the typed view state.');
if (!newTeam.includes("request('/api/team-rosters'")) problems.push('New Team must create through the canonical roster door.');
for (const retired of ['new-team-launch.js', 'new-team-preflight.js', 'team-draft-controller.js', 'agent-config']) {
  if (newTeam.includes(`'./${retired}'`) || newTeam.includes(`'${retired}'`)) problems.push(`New Team retired ${retired}; a Team is created and then staffed with New Agent.`);
}
for (const gone of ['public/js/new-team-launch.js', 'public/js/new-team-preflight.js', 'public/js/team-draft-controller.js', 'public/js/agent-config.js', 'src/routes/launch-preflight.ts']) {
  if (fs.existsSync(gone)) problems.push(`${gone} is a retired New Team seat path; the surface creates a Team and stops.`);
}
if (!read('public/js/cowork-view.js').includes('createNewTeamView(WorkspaceKit, {')) problems.push('The Cowork space must own where New Team lands after a create.');
if (!rosters.includes("isReservedTeamName = (s: string): boolean => s === 'unassigned'")) problems.push('The canonical Team store must reserve the Unassigned holding token.');
for (const file of ['cowork-view.js', 'new-team.js']) {
  const source = read(`public/js/${file}`);
  if (/className\s*=\s*['"](?:action-bar|metadata)['"]/.test(source)) problems.push(`${file} copies a shared foundation primitive.`);
}
if (problems.length) { for (const problem of problems) console.log(`  ✗ ${problem}`); process.exit(1); }
console.log('  ok — prioritized views consume the one Workspace Kit foundation');
