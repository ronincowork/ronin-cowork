import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { orderCoworkTeams } from '../public/js/cowork-workbench-contract.js';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Cowork roster keeps ordinary Teams readable and the special destinations last', () => {
  const noTeam = { name: '__none__', title: 'Ronin: no team' };
  const ordered = orderCoworkTeams([
    { name: 'helper', title: 'Steerco' },
    { name: 'zulu', title: 'Zulu' },
    { name: 'parked', title: 'Parked', holding: true },
    { name: 'alpha', title: 'Alpha' },
  ], { helperName: 'helper', noTeam });

  assert.deepEqual(ordered.map((team) => team.name), ['alpha', 'zulu', '__none__', 'helper']);
  assert.equal(ordered[2], noTeam, 'the no-team destination keeps its exact identity');
});

test('Cowork roster omits a held helper and does not invent a no-team destination', () => {
  const ordered = orderCoworkTeams([
    { name: 'helper', title: 'Steerco', holding: true },
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

test('Teams opens its roster and New Team form in the two default workspaces', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /seats: campaign \? \{ workspace1: WB_TYPES\.roster, workspace2: WB_TYPES\.newTeamForm \} : \{\}/);
});

// The Desk workbench, a card-for-card duplicate of Cowork, is deleted (owner, 2026-10-20); the old
// Home's Desk door opens the Teams workbench at #/cowork. The desk PROFILE (skins, words) stays.
test('there is no Desk workbench: one Teams workbench at #/cowork (owner, 2026-10-20)', async () => {
  const [main, view, catalog, current] = await Promise.all([
    source('main.js'), source('cowork-view.js'), source('workbench-catalog.js'), source('current-home.js'),
  ]);
  assert.doesNotMatch(main, /desk-view|register\('desk'/);
  assert.doesNotMatch(catalog, /WORKBENCH_PROFILES\.desk|desk: 'desk'/);
  assert.doesNotMatch(view, /options\.kind === 'desk'/);
  assert.match(current, /key: 'desk', route: 'cowork'/, 'the old Home\u2019s Desk door opens the Teams workbench');
});
