import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('Work Record and Team are the only public names for their migrated surfaces', async () => {
  const work = await readFile(path.join(root, 'ronin_bin', 'work-record'), 'utf8');
  for (const route of ['update_record', 'document', 'project']) assert.match(work, new RegExp(`^  ${route}\\)`, 'm'));
  assert.match(work, /add\)\s+\[/);
  assert.match(work, /remove\)\s+\[/);
  assert.match(work, /list\)/);

  const lead = await readFile(path.join(root, 'ronin_bin', 'team'), 'utf8');
  for (const route of ['roster:read', 'roster:write', 'project:create', 'project:read', 'project:write', 'project:list', 'project:assign', 'member:status']) {
    assert.match(lead, new RegExp(`^  ${route}\\)`, 'm'));
  }

  for (const retired of ['read_tegami', 'write_tegami', 'tejun-team-set', 'tejun-kanban']) {
    await assert.rejects(access(path.join(root, 'ronin_bin', retired)), `${retired} must not exist, even as an alias`);
  }
});
