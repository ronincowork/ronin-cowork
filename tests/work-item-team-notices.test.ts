/**
 * A TEAM'S ITEM TELLS ITS LEAD (KAN-307): a comment, a status change or a flag on an item a Team
 * holds reaches the Team's live lead(s), never the author. Leads are read from a private tmux server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-team-notices-'));
process.env.RONIN_DATA_ROOT = path.join(temp, 'data');
process.env.RONIN_USER_ROOT = path.join(temp, 'user');
delete process.env.RONIN_SOCKET;
process.env.RONIN_WORK_ITEMS_DIR = path.join(temp, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_SESSION_DIR = path.join(temp, 'sessions');

test('a comment, status change or flag on a Team-held item reaches its lead, not the author', async (t) => {
  const server = await openTestServer('work_item_team_notices', { onPath: true });
  t.after(async () => { await closeTestServer(server); await fs.rm(temp, { recursive: true, force: true }); });
  await server.run('new-session', '-d', '-s', 'boss');
  await server.run('set-option', '-t', 'boss', '@ronin-tags', 'crew');
  await server.run('set-option', '-t', 'boss', '@ronin-lead', 'crew');

  const items = await import('../src/work-items.js');
  const { createTeamRoster } = await import('../src/team-rosters.js');
  await createTeamRoster('crew', { objective: 'hold things' });
  const one = (await items.createItem({ title: 'one', holder: { kind: 'team', name: 'crew' } }, 'owner')).item;

  assert.deepEqual((await items.addComment(one.id, 'a word', 'owner')).notified, ['boss']);
  assert.deepEqual((await items.editItem(one.id, { status: 'In Progress' }, 'owner')).notified, ['boss']);
  assert.deepEqual((await items.flagItem(one.id, true, 'stuck', 'owner')).notified, ['boss']);
  // The lead's own change tells nobody.
  assert.equal((await items.addComment(one.id, 'mine', 'boss')).notified, undefined);
});
