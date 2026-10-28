import test from 'node:test';
import assert from 'node:assert/strict';

// The Teams surface's rows from the pushed rosters: the Workspace question narrows, a Team
// with no board has no State, and the Agents come from the projection, not the roster.
const { teamsRows, workspaces } = await import('../public/js/teams-surface-rows.js');

const rosters = [
  { name: 'front', title: 'Front 2', objective: 'the surface', project_root: 'cowork', board: { id: 'w9', title: 'Surface', status: 'In Progress', flagged: false }, items: [{ id: 'w9', title: 'Surface' }, { id: 'w12', title: 'Home' }] },
  { name: 'back', title: '', objective: '', project_root: 'services', board: null, items: [] },
  { name: 'loose', title: 'Loose', objective: 'no folder', project_root: '', board: null, items: [] },
];
const membersOf = (team) => team === 'front' ? [{ name: 'lead_a', team_lead: true }, { name: 'tile' }] : [];

test('rows: name or title, Theme, State from the board, Agents from the projection, item titles', () => {
  assert.deepEqual(teamsRows(rosters, membersOf), [
    { id: 'front', label: 'Front 2', theme: 'the surface', state: 'In Progress', agents: ['lead_a', 'tile'], items: ['Surface', 'Home'] },
    { id: 'back', label: 'back', theme: '', state: '', agents: [], items: [] },
    { id: 'loose', label: 'Loose', theme: 'no folder', state: '', agents: [], items: [] },
  ]);
});

test('the Workspace question narrows to the Teams in those folders; none chosen is all', () => {
  assert.deepEqual(teamsRows(rosters, membersOf, { roots: ['services'] }).map((row) => row.id), ['back']);
  assert.deepEqual(teamsRows(rosters, membersOf, { roots: ['services', 'cowork'] }).map((row) => row.id), ['front', 'back']);
  assert.deepEqual(teamsRows(rosters, membersOf, { roots: [] }).map((row) => row.id), ['front', 'back', 'loose']);
});

test('the workspaces offered are the folders the rosters name, once each, a blank left out', () => {
  assert.deepEqual(workspaces(rosters), ['cowork', 'services']);
  assert.deepEqual(workspaces([...rosters, { name: 'again', project_root: 'cowork' }]), ['cowork', 'services']);
});
