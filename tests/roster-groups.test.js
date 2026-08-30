import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterGroups } from '../public/js/roster-groups.js';

test('the roster offers durable empty Teams alongside live memberships', () => {
  const sessions = [{ name: 'a', tags: ['existing'] }, { name: 'b', tags: [] }];
  assert.deepEqual(rosterGroups(sessions, ['user_enroll', 'existing']), ['existing', 'user_enroll']);
});
