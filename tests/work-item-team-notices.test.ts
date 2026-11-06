/**
 * A TEAM IS TOLD THROUGH ITS LEAD (KAN-307): a comment, a status change or a flag on an item a Team
 * holds or watches reaches the Team's live lead(s), never the author; with no lead, no one. Leads are read from a private tmux server.
 */
import test, { after } from 'node:test';
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
after(() => fs.rm(temp, { recursive: true, force: true }));

test('a comment, status change or flag on a Team-held item reaches its lead, not the author', async (t) => {
  const server = await openTestServer('work_item_team_notices', { onPath: true });
  t.after(() => closeTestServer(server));
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

  // A Team watching an item hears a comment through its lead too; a Team with no lead alive, no one.
  await createTeamRoster('quiet', { objective: 'no lead' });
  const two = (await items.createItem({ title: 'two', holder: { kind: 'team', name: 'quiet' } }, 'owner')).item;
  assert.equal((await items.addComment(two.id, 'anyone?', 'owner')).notified, undefined);
  await items.watchItem(two.id, { kind: 'team', name: 'crew' }, true);
  assert.deepEqual((await items.addComment(two.id, 'now?', 'owner')).notified, ['boss']);
});

test('an item from Jira with no holder lands on the Team holding its parent, else on nobody (KAN-308)', async () => {
  const items = await import('../src/work-items.js');
  const holding = async (id: string) => (await items.holdersOf(id)).map(items.holderLabel);
  const epic = (await items.createItem({ title: 'epic', kind: 'Epic', holder: { kind: 'team', name: 'crew' } }, 'owner')).item;
  const child = (await items.createItem({ title: 'from Jira', parent: epic.id, jira: { id: '9001', key: 'KAN-9001' } }, 'jira:alice')).item;
  assert.deepEqual(await holding(child.id), ['team:crew']);
  const bare = (await items.createItem({ title: 'bare epic', kind: 'Epic' }, 'owner')).item;
  const orphan = (await items.createItem({ title: 'from Jira too', parent: bare.id, jira: { id: '9002', key: 'KAN-9002' } }, 'jira:alice')).item;
  assert.deepEqual(await holding(orphan.id), []);
  const made = (await items.createItem({ title: 'made here', parent: epic.id }, 'owner')).item;
  assert.deepEqual(await holding(made.id), [], 'a Ronin item is not Jira\'s arrival');
});
