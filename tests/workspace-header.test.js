import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceHeaderScope } from '../public/js/workspace-header.js';

test('workspace header scope follows the active customer-facing place', () => {
  assert.equal(workspaceHeaderScope({ id: 'campaign' }), 'campaign');
  assert.equal(workspaceHeaderScope({ id: 'launch' }), 'campaign');
  assert.equal(workspaceHeaderScope({ id: 'cowork' }), 'teams');
  assert.equal(workspaceHeaderScope({ id: 'team', param: 'sea_settle' }), 'team');
  assert.equal(workspaceHeaderScope({ id: 'team', param: '' }), '');
  assert.equal(workspaceHeaderScope({ id: 'home' }), '');
  assert.equal(workspaceHeaderScope(null), '');
});
