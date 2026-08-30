import test from 'node:test';
import assert from 'node:assert/strict';
import { deskLabel, deskTip } from '../public/js/desks.js';

test('a single desk is named by its worktree, with branch and path in the detail', () => {
  const entry = { desks: [{ short: 'ronin-cowork', branch: 'team/campaign_config/workbench_doc', worktree: '/worktrees/ronin_cowork/team/campaign_config/workbench_doc' }] };
  assert.equal(deskLabel(entry), '⑂ workbench_doc');
  assert.match(deskTip(entry), /ronin-cowork — team\/campaign_config\/workbench_doc/);
  assert.match(deskTip(entry), /worktree \/worktrees\/ronin_cowork\/team\/campaign_config\/workbench_doc/);
});

test('a checkout with no known worktree falls back to its branch', () => {
  assert.equal(deskLabel({ desks: [{ branch: 'main', worktree: null }] }), '⑂ main');
});
