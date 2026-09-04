import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesRepoBranchSelector, parseRepoBranchSelector } from '../src/desks/selector.js';

test('repo:branch selectors preserve the complete branch and distinguish same-repo desks', () => {
  assert.deepEqual(parseRepoBranchSelector('cowork'), { repo: 'cowork', branch: '' });
  assert.deepEqual(parseRepoBranchSelector('cowork:team/a/topic:part'), {
    repo: 'cowork', branch: 'team/a/topic:part',
  });
  const selected = parseRepoBranchSelector('cowork:team/b/session');
  assert.equal(matchesRepoBranchSelector({ repo: 'cowork', branch: 'team/a/session' }, selected), false);
  assert.equal(matchesRepoBranchSelector({ repo: 'cowork', branch: 'team/b/session' }, selected), true);
});
