import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceHeaderScope } from '../public/js/workspace-header.js';
import { tabTitle } from '../public/js/workspace.js';

test('workspace header scope follows the active customer-facing place', () => {
  assert.equal(workspaceHeaderScope({ id: 'campaign' }), 'campaign');
  assert.equal(workspaceHeaderScope({ id: 'launch' }), 'campaign');
  assert.equal(workspaceHeaderScope({ id: 'cowork' }), 'teams');
  assert.equal(workspaceHeaderScope({ id: 'team', param: 'sea_settle' }), 'team');
  assert.equal(workspaceHeaderScope({ id: 'team', param: '' }), '');
  assert.equal(workspaceHeaderScope({ id: 'home' }), '');
  assert.equal(workspaceHeaderScope(null), '');
});

test('browser tab titles leave Ronin identity to the favicon', () => {
  assert.equal(tabTitle('Campaign'), 'Campaign');
  assert.equal(tabTitle('Teams'), 'Teams');
  assert.equal(tabTitle('Last Minute'), 'Last Minute');
  assert.equal(tabTitle({ bare: 'Planning · Last Minute' }), 'Planning · Last Minute');
  assert.equal(tabTitle(''), '');
});
