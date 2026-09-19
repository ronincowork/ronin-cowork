import test from 'node:test';
import assert from 'node:assert/strict';
import { orderCoworkTeams } from '../public/js/cowork-workbench-contract.js';

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
