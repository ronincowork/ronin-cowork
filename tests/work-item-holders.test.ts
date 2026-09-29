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
// Every store under private roots, whoever runs this file: holder scans and arrival
// notices must never reach a live roster, letter or message queue.
const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-isolated-'));
process.env.RONIN_DATA_ROOT = path.join(isolated, 'data');
process.env.RONIN_USER_ROOT = path.join(isolated, 'user');
delete process.env.RONIN_SOCKET;
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
const { teamReading, unassignedReading } = await import('../src/work-items-read.js');

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

test('an ended Agent orphans nothing: each item gets holder-ended and is found under its parent or unassigned', async () => {
  await seedTegami('gone');
  const gone = { kind: 'agent', name: 'gone' } as const;
  const parent = (await items.createItem({ title: 'team overall', holder: team }, 'lead')).item;
  const child = (await items.createItem({ title: 'piece', parent: parent.id, holder: gone }, 'lead')).item;
  const loose = (await items.createItem({ title: 'loose', holder: gone }, 'lead')).item;
  const released = await items.releaseHolder('gone', 'gone', 'session ended');
  assert.deepEqual(released.map(({ line }) => [line.op, line.from, line.note]), [
    ['holder-ended', 'agent:gone', 'session ended'], ['holder-ended', 'agent:gone', 'session ended'],
  ]);
  assert.deepEqual((await readLetterHolds('gone'))!.holds, []);
  assert.deepEqual(await listsHolding(child.id), []);
  assert.deepEqual(await listsHolding(loose.id), []);
  assert.equal((await items.readItem(child.id))!.parent, parent.id, 'still found under its parent');
  assert.ok((await unassignedReading()).some((item) => item.id === loose.id), 'on the common board, held by nobody: unassigned');
  assert.deepEqual(await items.releaseHolder('gone', 'gone', 'again'), [], 'a second end finds nothing to release');
});

test('readings: the team reads its own holds and its members\' holds, children after parents; unassigned is the common board\'s unheld items', async () => {
  await createTeamRoster('readers', { objective: 'read us' });
  await seedTegami('reader_a');
  const readers = { kind: 'team', name: 'readers' } as const;
  const overall = (await items.createItem({ title: 'overall', holder: readers }, 'lead')).item;
  const other = (await items.createItem({ title: 'other', holder: readers }, 'lead')).item;
  const piece = (await items.createItem({ title: 'piece', parent: overall.id, holder: { kind: 'agent', name: 'reader_a' } }, 'lead')).item;
  const parked = (await items.createItem({ title: 'parked' }, 'lead')).item;
  const nested = (await items.createItem({ title: 'nested but unheld', parent: overall.id }, 'lead')).item;
  const reading = await teamReading('readers', [{ name: 'reader_a', key: 'reader_a', tags: ['readers'] }, { name: 'ann', key: 'ann', tags: ['crew'] }]);
  assert.equal(reading.objective, 'read us');
  assert.deepEqual(reading.items.map((item) => [item.id, item.holder]), [
    [overall.id, 'team:readers'], [piece.id, 'agent:reader_a'], [other.id, 'team:readers'],
  ]);
  const unassigned = (await unassignedReading()).map((item) => item.id);
  assert.ok(unassigned.includes(parked.id));
  assert.ok(!unassigned.includes(nested.id), 'an unheld child of another board is found under it, not unassigned');
  assert.ok(!unassigned.includes(overall.id));
});

test('nesting under a held board queues its holder exactly one message; under an unheld board, none', async () => {
  const { listQueuedMessages, dismissMessage } = await import('../src/message-queue.js');
  const clear = async () => { for (const message of await listQueuedMessages()) await dismissMessage(message.id); };
  await clear();
  await seedTegami('boarder');
  const held = (await items.createItem({ title: 'held board', holder: { kind: 'agent', name: 'boarder' } }, 'lead')).item;
  const unheld = (await items.createItem({ title: 'unheld board' }, 'lead')).item;
  await clear();

  const piece = (await items.createItem({ title: 'piece' }, 'lead')).item;
  assert.deepEqual(await listQueuedMessages(), [], 'the common board is held by nobody: nobody is told');
  const moved = await items.reparentItem(piece.id, held.id, 'lead');
  assert.deepEqual(moved.notified, ['boarder']);
  const queued = await listQueuedMessages();
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.target, 'boarder');
  assert.equal(queued[0]!.text, `${piece.id} piece was added under your board ${held.id}. Handle it as you see fit.`);
  await clear();

  assert.deepEqual((await items.reparentItem(piece.id, unheld.id, 'lead')).notified, []);
  assert.deepEqual(await listQueuedMessages(), [], 'a board held by nobody notifies nobody');
  const born = await items.createItem({ title: 'born under', parent: held.id }, 'lead');
  assert.deepEqual(born.notified, ['boarder'], 'a create with a parent is announced the same way');
  assert.equal((await listQueuedMessages()).length, 1);
  await clear();
});

test('a leaf\'s ladder folds into its first child, with a line on both; a second child takes nothing', async () => {
  const ladder = [{ phase: 'Build it', status: 'ACTIVE' as const, legs: [{ title: 'one', status: 'DONE' as const }, { title: 'two', status: 'PLANNED' as const }] }];
  const leaf = (await items.createItem({ title: 'leaf', ladder }, 'lead')).item;
  const own = [{ gate: 'go', status: 'PLANNED' as const }];
  const first = (await items.createItem({ title: 'first child', ladder: own }, 'lead')).item;
  const moved = await items.reparentItem(first.id, leaf.id, 'lead');
  assert.deepEqual(moved.item.ladder, [...ladder, ...own], 'the child takes the ladder, ahead of its own');
  assert.equal(moved.line.note, `ladder folded in from ${leaf.id}`);
  const board = (await items.readItem(leaf.id))!;
  assert.deepEqual(board.ladder, [], 'the parent\'s ladder empties');
  assert.equal(board.trail.at(-1)!.note, `ladder folded into ${first.id}, its first child`);
  assert.equal(moved.shape, `${first.id} is a project at idea, 2 legs`);
  const second = await items.createItem({ title: 'second child', parent: leaf.id }, 'lead');
  assert.deepEqual(second.item.ladder, []);
  assert.equal(await items.kindOf((await items.readItem(leaf.id))!), `${leaf.id} is a board, 2 items`);
});
