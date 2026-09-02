import test from 'node:test';
import assert from 'node:assert/strict';
import { conflictingAgentNames } from '../public/js/new-team-check.js';

test('the New Team cast gate catches live and repeated Agent names before any write', () => {
  assert.deepEqual(
    conflictingAgentNames(
      [{ name: 'coordinator' }, { name: 'positioning' }, { name: 'positioning' }, { name: 'writer' }],
      [{ name: 'coordinator' }, { name: 'someone_else' }],
    ),
    ['coordinator', 'positioning'],
  );
});

test('the New Team cast gate accepts a wholly free cast', () => {
  assert.deepEqual(
    conflictingAgentNames([{ name: 'coordinator-1' }, { name: 'positioning' }], [{ name: 'coordinator' }]),
    [],
  );
});
