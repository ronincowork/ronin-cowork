import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orderCoworkTeams } from '../public/js/cowork-workbench-contract.js';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Cowork roster keeps ordinary Teams readable and the special destinations last', () => {
  const noTeam = { name: '__none__', title: 'Ronin: no team' };
  const ordered = orderCoworkTeams([
    { name: 'helper', title: 'Ronin Helpers' },
    { name: 'zulu', title: 'Zulu' },
    { name: 'parked', title: 'Parked', holding: true },
    { name: 'alpha', title: 'Alpha' },
  ], { helperName: 'helper', noTeam });

  assert.deepEqual(ordered.map((team) => team.name), ['alpha', 'zulu', '__none__', 'helper']);
  assert.equal(ordered[2], noTeam, 'the no-team destination keeps its exact identity');
});

test('Cowork roster omits a held helper and does not invent a no-team destination', () => {
  const ordered = orderCoworkTeams([
    { name: 'helper', title: 'Ronin Helpers', holding: true },
    { name: 'plain', title: 'Plain' },
  ], { helperName: 'helper' });
  assert.deepEqual(ordered.map((team) => team.name), ['plain']);
});

test('Cowork discovery offers existing no-Team Agents as ordinary Agent destination doors', async () => {
  const [text, catalog] = await Promise.all([source('cowork-view.js'), source('workbench-catalog.js')]);
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.cowork, \[[^\]]*WORKBENCH_TYPES\.terminal/);
  assert.match(text, /sessions: \(\) => \(campaign \? unassignedSessions\(\) : membersOfTeam\(team\)\)\.map/);
  assert.match(text, /campaign \? \{ action: \(\) => openAgentWorkbench\(member\.name\) \} : \{\}/);
});

test('Cowork launches use the standalone handoff while Team launches retain in-page seating', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /connect: campaign \? null : \(name\) => connectSession\(name, id\)/);
});

test('Teams opens its roster and New Team form in the two default workspaces; Desk opens Work items second', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /seats: campaign \? \{ workspace1: WB_TYPES\.roster, workspace2: desk \? WB_TYPES\.workViews : WB_TYPES\.newTeamForm \} : \{\}/);
});

test('Cowork no longer offers Task Manager on its selector; all scopes can still place drill-down surfaces', async () => {
  const [text, catalog] = await Promise.all([source('cowork-view.js'), source('workbench-catalog.js')]);
  assert.match(text, /kind: 'desk', teams: \(\) => teamsFromState\(\)/);
  assert.match(text, /taskStatus: \(id, detail\)/);
  assert.match(text, /taskProject: \(id, detail\)/);
  assert.match(catalog, /taskStatus: 'task-manager\.status'/);
  assert.match(catalog, /taskProject: 'task-manager\.project'/);
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.cowork, \[[^\]]*WORKBENCH_TYPES\.taskStatus[^\]]*WORKBENCH_TYPES\.taskProject/);
  assert.doesNotMatch(catalog, /profiles\.define\(WORKBENCH_PROFILES\.cowork, \[[^\]]*WORKBENCH_TYPES\.kanban\b/);
});

test('Desk owns an operational destination and first-opens Teams beside Work items', async () => {
  const [main, deskView, view, catalog, contract, home] = await Promise.all([
    source('main.js'), source('desk-view.js'), source('cowork-view.js'), source('workbench-catalog.js'), source('workspace-contract.js'), source('campaign-home.js'),
  ]);
  assert.match(home, /key: 'desk', route: 'desk'/);
  assert.match(main, /import \{ createDeskView \} from '\.\/desk-view\.js'/);
  assert.match(main, /workspace\.register\('desk', createDeskView\(\)\)/);
  assert.match(deskView, /export function createDeskView\(\)/);
  assert.match(contract, /'campaign', 'desk', 'cowork'/);
  assert.match(catalog, /desk: 'desk'/);
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.desk/);
  assert.match(view, /const desk = options\.kind === 'desk'/);
  assert.match(view, /profile: desk \? WB_PROFILES\.desk : campaign \? WB_PROFILES\.cowork/);
  assert.match(view, /workspace1: WB_TYPES\.roster, workspace2: desk \? WB_TYPES\.workViews : WB_TYPES\.newTeamForm/);
  assert.match(view, /workbenchView\(desk \? 'desk' : campaign \? 'cowork' : 'team'\)/);
});
