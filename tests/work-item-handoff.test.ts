/**
 * HANDOFF, THE ONE TOOL (KAN-290): the giver comes off and the receiver goes on. The default
 * giver is the caller, with the caller's Teams and the receiver's Teams that hold the item (an
 * Agent's Teams are its session's tags, read here from a private tmux server); --from names it;
 * --keep-holding keeps it on; any other holder stays.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-handoff-'));
process.env.RONIN_DATA_ROOT = path.join(temp, 'data');
process.env.RONIN_USER_ROOT = path.join(temp, 'user');
delete process.env.RONIN_SOCKET;
process.env.RONIN_WORK_ITEMS_DIR = path.join(temp, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_SESSION_DIR = path.join(temp, 'sessions');

test('handoff: the giver and the Teams around it come off; the receiver goes on; others stay', async (t) => {
  const server = await openTestServer('work_item_handoff', { onPath: true });
  t.after(async () => { await closeTestServer(server); await fs.rm(temp, { recursive: true, force: true }); });
  for (const name of ['lead', 'ann', 'bo']) await server.run('new-session', '-d', '-s', name);
  for (const name of ['lead', 'ann', 'bo']) await server.run('set-option', '-t', name, '@ronin-tags', 'crew');

  const items = await import('../src/work-items.js');
  const { createTeamRoster } = await import('../src/team-rosters.js');
  const { seedTegami } = await import('../src/tegami.js');
  await createTeamRoster('crew', { objective: 'hold things' });
  await createTeamRoster('other', { objective: 'hold other things' });
  for (const name of ['lead', 'ann', 'bo']) await seedTegami(name);
  const crew = { kind: 'team', name: 'crew' } as const;
  const other = { kind: 'team', name: 'other' } as const;
  const ann = { kind: 'agent', name: 'ann' } as const;
  const bo = { kind: 'agent', name: 'bo' } as const;
  const holding = async (id: string) => (await items.holdersOf(id)).map(items.holderLabel).sort();

  // A lead giving out its Team's work takes the Team off.
  const one = (await items.createItem({ title: 'one', holder: crew }, 'owner')).item;
  const given = await items.handoffItem(one.id, ann, 'lead');
  assert.deepEqual([given.line.op, given.line.from, given.line.to], ['handoff', 'team:crew', 'agent:ann']);
  assert.deepEqual(await holding(one.id), ['agent:ann']);
  assert.equal(items.didLine(given), `${one.id} was handed from team:crew to agent:ann`);

  // A second Agent: only the giver comes off, never the first Agent.
  await items.handoffItem(one.id, bo, 'lead');
  assert.deepEqual(await holding(one.id), ['agent:ann', 'agent:bo']);

  // The owner, in no Team, giving a Team's item to a member: the receiver's Team comes off;
  // a Team that is neither the caller's nor the receiver's stays.
  const two = (await items.createItem({ title: 'two', holder: crew }, 'owner')).item;
  await items.handoffItem(two.id, other, 'owner');
  await items.handoffItem(two.id, ann, 'owner');
  assert.deepEqual(await holding(two.id), ['agent:ann', 'team:other']);

  // --from names the giver; --keep-holding keeps it on.
  await items.handoffItem(two.id, bo, 'owner', { from: other });
  assert.deepEqual(await holding(two.id), ['agent:ann', 'agent:bo']);
  const kept = await items.handoffItem(two.id, crew, 'owner', { from: ann, keepHolding: true });
  assert.equal(kept.line.from, 'none');
  assert.equal(items.didLine(kept), `${two.id} is held by team:crew`);
  assert.deepEqual(await holding(two.id), ['agent:ann', 'agent:bo', 'team:crew']);
});
