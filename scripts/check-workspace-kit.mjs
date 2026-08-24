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
for (const file of ['league-board.js', 'team-view.js', 'new-team.js']) {
  const source = read(`public/js/${file}`);
  if (/className\s*=\s*['"](?:action-bar|metadata)['"]/.test(source)) problems.push(`${file} copies a shared foundation primitive.`);
}
if (problems.length) { for (const problem of problems) console.log(`  ✗ ${problem}`); process.exit(1); }
console.log('  ok — prioritized views consume the one Workspace Kit foundation');
