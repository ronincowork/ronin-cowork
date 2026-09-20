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
  const text = await source('cowork-view.js');
  assert.match(text, /profiles\.define\(WB_PROFILES\.cowork, \[[^\]]*WB_TYPES\.terminal/);
  assert.match(text, /sessions: \(\) => \(campaign \? unassignedSessions\(\) : membersOfTeam\(team\)\)\.map/);
  assert.match(text, /campaign \? \{ action: \(\) => openWorkspaceTab\('agent', member\.name\) \} : \{\}/);
});

test('Cowork launches use the standalone handoff while Team launches retain in-page seating', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /connect: campaign \? null : async \(name\) => \{[\s\S]*fetchSessions\(\);[\s\S]*connectSession\(name, id\)/);
});
