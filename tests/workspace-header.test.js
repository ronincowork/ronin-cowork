import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceHeaderAppearance } from '../public/js/workspace-header.js';
import { workbenchView } from '../public/js/workspace-contract.js';
import { tabTitle } from '../public/js/workspace.js';

test('workspace header appearance comes from the active Workbench, never its route', () => {
  assert.equal(workspaceHeaderAppearance({ id: 'anything', view: { appearance: 'team' } }), 'team');
  assert.equal(workspaceHeaderAppearance({ id: 'team', param: 'sea_settle', view: {} }), '');
  assert.equal(workspaceHeaderAppearance({ id: 'cowork' }), '');
  assert.equal(workspaceHeaderAppearance(null), '');
});

test('the universal Workbench declaration owns appearance, capabilities and an optional island', () => {
  const declared = workbenchView('agent', { island: ({ param }) => param });
  assert.equal(declared.appearance, 'agent');
  assert.equal(declared.header.shape, true);
  assert.equal(declared.header.feedback, true);
  assert.equal(declared.island({ param: 'writer' }), 'writer');
  assert.throws(() => workbenchView('unknown'), /unknown Workbench appearance/);
});

test('browser tab titles leave Ronin identity to the favicon', () => {
  assert.equal(tabTitle('Campaign'), 'Campaign');
  assert.equal(tabTitle('Teams'), 'Teams');
  assert.equal(tabTitle('Last Minute'), 'Last Minute');
  assert.equal(tabTitle({ bare: 'Planning · Last Minute' }), 'Planning · Last Minute');
  assert.equal(tabTitle(''), '');
});
