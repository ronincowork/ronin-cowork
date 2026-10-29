import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('Work Record and Team are the only public names for their migrated surfaces', async () => {
  const work = await readFile(path.join(root, 'ronin_bin', 'work-record'), 'utf8');
  for (const route of ['read', 'update_record', 'workspace']) assert.match(work, new RegExp(`^  ${route}\\)`, 'm'));
  // Work items are the item tool's alone (docs/using-ronin/work-items.md): no item or document family here.
  for (const family of ['item', 'document']) assert.doesNotMatch(work, new RegExp(`^  ${family}\\)`, 'm'));
  assert.match(work, /add\|remove\)/);
  assert.match(work, /list\)/);

  const lead = await readFile(path.join(root, 'ronin_bin', 'team'), 'utf8');
  for (const route of ['roster:read', 'roster:write', 'member:status']) {
    assert.match(lead, new RegExp(`^  ${route}\\)`, 'm'));
  }
  assert.doesNotMatch(lead, /^  item:/m);
  // "project" is not a work item's name (owner, 2026-10-22): no alias keeps it.
  assert.doesNotMatch(lead, /^  project:/m);
  assert.doesNotMatch(work, /^  project\)/m);

  for (const retired of ['read_tegami', 'write_tegami', 'tejun-team-set', 'tejun-kanban']) {
    await assert.rejects(access(path.join(root, 'ronin_bin', retired)), `${retired} must not exist, even as an alias`);
  }
});
