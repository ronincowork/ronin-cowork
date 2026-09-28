/**
 * HOLDING — lists of item ids on Teams and Agents, never copies of items.
 * Checks from WORK_ITEM_STORE.md cut 2: two concurrent assigns of one id leave it on
 * exactly one list; release leaves it on none; the Agent's focus follows what it holds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-holders-'));
// No tmux server answers in here: an empty socket dir that exists, and no inherited
// $TMUX, so a session key is its name and nothing reaches the live server.
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-holders-tmux-'));
process.env.RONIN_WORK_ITEMS_DIR = path.join(temp, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_SESSION_DIR = path.join(temp, 'sessions');

const items = await import('../src/work-items.js');
const { createTeamRoster, readTeamRoster } = await import('../src/team-rosters.js');
const { readLetterHolds, seedTegami } = await import('../src/tegami.js');

await createTeamRoster('crew', { objective: 'hold things' });
await seedTegami('ann');
await seedTegami('bo');
const team = { kind: 'team', name: 'crew' } as const;
const ann = { kind: 'agent', name: 'ann' } as const;
const bo = { kind: 'agent', name: 'bo' } as const;

async function listsHolding(id: string): Promise<string[]> {
  return (await items.holdersOf(id)).map(items.holderLabel).sort();
}

test('two concurrent assigns of one id leave it on exactly one list', async () => {
  for (let round = 0; round < 5; round++) {
    const { item } = await items.createItem({ title: `race ${round}` }, 'lead');
    await Promise.all([items.assignItem(item.id, ann, 'lead'), items.assignItem(item.id, bo, 'lead'), items.assignItem(item.id, team, 'lead')]);
    const held = await listsHolding(item.id);
    assert.equal(held.length, 1, `round ${round}: ${held.join(', ')}`);
    const trail = (await items.readItem(item.id))!.trail.filter((line) => line.op === 'assign');
    assert.equal(trail.length, 3, 'every call acknowledged with its own line');
    assert.equal(trail.at(-1)!.to, held[0], 'the last line names the holder that stands');
  }
});

test('assign moves the id and never the item: content and parent stay put', async () => {
  const parent = (await items.createItem({ title: 'overall' }, 'lead')).item;
  const { item } = await items.createItem({ title: 'piece', parent: parent.id }, 'lead');
  await items.assignItem(item.id, team, 'lead');
  assert.ok((await readTeamRoster('crew'))!.holds.includes(item.id));
  const moved = await items.assignItem(item.id, ann, 'lead');
  assert.deepEqual([moved.line.from, moved.line.to], ['team:crew', 'agent:ann']);
  assert.ok(!(await readTeamRoster('crew'))!.holds.includes(item.id));
  assert.equal(moved.item.parent, parent.id);
  assert.equal(moved.item.title, 'piece');
});

test('release leaves the id on no list, and the focus follows what is held', async () => {
  const first = (await items.createItem({ title: 'first' }, 'lead')).item;
  const second = (await items.createItem({ title: 'second' }, 'lead')).item;
  await items.assignItem(first.id, bo, 'lead');
  await items.assignItem(second.id, bo, 'lead');
  let letter = (await readLetterHolds('bo'))!;
  const focus = letter.at?.item;
  assert.ok(focus === first.id || letter.holds.includes(String(focus)), 'focus is a held item');
  const released = await items.releaseItem(String(focus), 'bo');
  assert.equal(released.line.op, 'release');
  assert.deepEqual(await listsHolding(String(focus)), []);
  letter = (await readLetterHolds('bo'))!;
  assert.ok(!letter.holds.includes(String(focus)));
  assert.ok(letter.holds.includes(String(letter.at?.item)), 'focus moved to an item still held');
});

test('no permission: anyone may assign or release, and it is on the trail', async () => {
  const { item } = await items.createItem({ title: 'open' }, 'lead');
  await items.assignItem(item.id, ann, 'somebody_else');
  const back = await items.releaseItem(item.id, 'a_passer_by');
  assert.equal(back.line.by, 'a_passer_by');
});

test('the 2026-09-24 duplicate cannot recur: a return racing an assign leaves one item on one list', async () => {
  // Old shape: a return wrote its stale Inbox back over a concurrent assignment and the
  // assigned Project existed twice (Inbox and the holder's record). Here there is one file
  // per id and holding is a list of ids, moved under one lock.
  const one = (await items.createItem({ title: 'surface/1', holder: team }, 'lead')).item;
  const two = (await items.createItem({ title: 'surface/2', holder: team }, 'lead')).item;
  await items.assignItem(two.id, bo, 'lead');
  const before = (await items.listItems()).length;
  await Promise.all([items.returnItem(two.id, 'bo', 'bo', 'crew'), items.assignItem(one.id, ann, 'lead')]);
  assert.deepEqual(await listsHolding(one.id), ['agent:ann']);
  assert.deepEqual(await listsHolding(two.id), ['team:crew']);
  const all = await items.listItems();
  assert.equal(all.length, before, 'no second item was made');
  assert.equal(all.filter((item) => item.title === 'surface/1').length, 1);
});
