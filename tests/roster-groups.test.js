import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listedTeam, partitionRosterGroups, rosterGroups, teamTag } from '../public/js/roster-groups.js';

test('the roster offers only real Team records and does not synthesize orphan tags', () => {
  const sessions = [{ name: 'a', tags: ['existing'] }, { name: 'b', tags: [] }];
  assert.deepEqual(rosterGroups(sessions, ['user_enroll']), ['user_enroll']);
});

test('the helper Team uses its ordinary exact tmux membership tag', () => {
  assert.equal(teamTag('steerco'), 'steerco');
});

test('steerco is pinned last even when it is only an empty durable Team', () => {
  assert.deepEqual(rosterGroups([{ tags: ['zebra'] }], ['steerco', 'alpha']),
    ['alpha', 'steerco']);
});

test('roster composition partitions an existing helper after ordinary and no-team rows', () => {
  const groups = rosterGroups([{ tags: ['zebra', 'steerco'] }], ['steerco', 'alpha']);
  assert.deepEqual(groups, ['alpha', 'steerco']);
  assert.deepEqual(partitionRosterGroups(groups), { ordinary: ['alpha'], helper: 'steerco' });
});

test('only the exact helper id sorts last; differently named Teams stay ordinary', () => {
  const groups = rosterGroups([], ['STEERCO', 'steerco', 'zeta']);
  assert.deepEqual(groups, ['STEERCO', 'zeta', 'steerco']);
  assert.equal(teamTag('STEERCO'), 'STEERCO');
});

// KAN-305: one rule hides the house Teams from every Teams list, desktop and phone.
test('listedTeam: Steerco and the leftover Ronin Helpers are not listed; other Teams are', async () => {
  assert.deepEqual(['steerco', 'ronin_helpers', 'system', 'boot'].map((name) => listedTeam({ name })), [false, false, true, true]);
  for (const file of ['phone.js', 'team-roster-surface.js']) {
    const src = await readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.match(src, /import \{ listedTeam \} from '\.\/roster-groups\.js';/, `${file} uses the shared rule`);
    assert.match(src, /teamsFromState\(\)\.filter\(\(team\) => [^\n]*listedTeam\(team\)/, `${file} filters its Teams by it`);
    assert.doesNotMatch(src, /'ronin_helpers'|'steerco'/, `${file} keeps no list of names of its own`);
  }
});
