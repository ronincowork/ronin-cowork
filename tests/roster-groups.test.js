import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionRosterGroups, rosterGroups, teamTag } from '../public/js/roster-groups.js';

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
