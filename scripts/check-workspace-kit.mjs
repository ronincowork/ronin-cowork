#!/usr/bin/env node
import fs from 'node:fs';

const problems = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const league = read('public/js/league-view.js') + read('public/js/league-board.js');
const team = read('public/js/team-view.js');
const controller = read('public/js/team-controller.js');
const kit = read('public/js/workspace-kit.js') + read('public/js/workspace-adapters.js');
const terminal = read('public/js/terminal-tile-host.js');
const primitives = read('public/js/workspace-primitives.js');
const newTeam = read('public/js/new-team.js');
const styles = read('public/workspace-kit.css').replace(/\s+/g, ' ');
const preflight = read('src/routes/launch-preflight.ts');
const rosters = read('src/team-rosters.ts');
const leagueCards = /\.wk-league-board \[data-surface='cards'\] \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(auto-fill, minmax\(17rem, 1fr\)\);[^}]*gap: var\(--space-6\);[^}]*align-content: start;[^}]*\}/;
const leagueCardsPhone = /@media \(max-width: 680px\) \{[^}]*\.wk-league-board \[data-surface='cards'\] \{[^}]*grid-template-columns: 1fr;[^}]*\}/;
if (!leagueCards.test(styles)) problems.push('The Kit must own the complete League cards desktop grid geometry.');
if (!leagueCardsPhone.test(styles)) problems.push('The Kit must own the League cards phone single-column geometry.');
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
if (!team.includes('teamWorkspaceState(context.state)')) problems.push('Team must consume typed workspace state.');
if (!newTeam.includes("workspaceTarget('agent-config'")) problems.push('New Team must use typed navigation for seat configuration.');
if (!newTeam.includes('registerTeamDraft') || !newTeam.includes("patchViewState('new-team'")) problems.push('New Team must use the canonical persisted draft controller.');
if (!preflight.includes('proposedRoster') || !preflight.includes('isCreatableTeamName')) problems.push('Preflight must use proposed Team defaults and canonical name availability.');
if (!rosters.includes("isReservedTeamName = (s: string): boolean => s === 'unassigned'")) problems.push('The canonical Team store must reserve the Unassigned holding token.');
for (const file of ['league-board.js', 'team-view.js', 'new-team.js']) {
  const source = read(`public/js/${file}`);
  if (/className\s*=\s*['"](?:action-bar|metadata)['"]/.test(source)) problems.push(`${file} copies a shared foundation primitive.`);
}
if (problems.length) { for (const problem of problems) console.log(`  ✗ ${problem}`); process.exit(1); }
console.log('  ok — prioritized views consume the one Workspace Kit foundation');
