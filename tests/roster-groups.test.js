import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRosterGroups, rosterGroups, teamTag } from '../public/js/roster-groups.js';

test('the roster offers only real Team records and does not synthesize orphan tags', () => {
  const sessions = [{ name: 'a', tags: ['existing'] }, { name: 'b', tags: [] }];
  assert.deepEqual(rosterGroups(sessions, ['user_enroll']), ['user_enroll']);
});

test('the helper Team uses its ordinary exact tmux membership tag', () => {
  assert.equal(teamTag('ronin_helpers'), 'ronin_helpers');
});

test('ronin_helpers is pinned last even when it is only an empty durable Team', () => {
  assert.deepEqual(rosterGroups([{ tags: ['zebra'] }], ['ronin_helpers', 'alpha']),
    ['alpha', 'ronin_helpers']);
});

test('roster composition partitions an existing helper after ordinary and no-team rows', () => {
  const groups = rosterGroups([{ tags: ['zebra', 'ronin_helpers'] }], ['ronin_helpers', 'alpha']);
  assert.deepEqual(groups, ['alpha', 'ronin_helpers']);
  assert.deepEqual(partitionRosterGroups(groups), { ordinary: ['alpha'], helper: 'ronin_helpers' });
});

test('only the exact helper id sorts last; differently named Teams stay ordinary', () => {
  const groups = rosterGroups([], ['RONIN_HELPERS', 'ronin_helpers', 'zeta']);
  assert.deepEqual(groups, ['RONIN_HELPERS', 'zeta', 'ronin_helpers']);
  assert.equal(teamTag('RONIN_HELPERS'), 'RONIN_HELPERS');
});
