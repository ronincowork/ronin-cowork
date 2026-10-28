/**
 * HOLDING — lists of item ids on Teams and Agents, never copies of items.
 * Checks: concurrent assigns add holders; handoff removes only the giver; release leaves
 * it on none.
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
const { everyItemReading, teamBoard, teamReading } = await import('../src/work-items-read.js');

await createTeamRoster('crew', { objective: 'hold things' });
await seedTegami('ann');
await seedTegami('bo');
const team = { kind: 'team', name: 'crew' } as const;
const ann = { kind: 'agent', name: 'ann' } as const;
const bo = { kind: 'agent', name: 'bo' } as const;

async function listsHolding(id: string): Promise<string[]> {
  return (await items.holdersOf(id)).map(items.holderLabel).sort();
}

test('two concurrent assigns of one id add every holder', async () => {
  for (let round = 0; round < 5; round++) {
    const { item } = await items.createItem({ title: `race ${round}` }, 'lead');
    await Promise.all([items.assignItem(item.id, ann, 'lead'), items.assignItem(item.id, bo, 'lead'), items.assignItem(item.id, team, 'lead')]);
    const held = await listsHolding(item.id);
    assert.deepEqual(held, ['agent:ann', 'agent:bo', 'team:crew'], `round ${round}`);
    const trail = (await items.readItem(item.id))!.trail.filter((line) => line.op === 'assign');
    assert.equal(trail.length, 3, 'every call acknowledged with its own line');
    assert.equal(trail.at(-1)!.to, 'team:crew', 'the last line names the added holder');
  }
});

test('assign adds a holder and handoff moves only the giver; content and parent stay put', async () => {
  const parent = (await items.createItem({ title: 'overall' }, 'lead')).item;
  const { item } = await items.createItem({ title: 'piece', parent: parent.id }, 'lead');
  await items.assignItem(item.id, team, 'lead');
  assert.ok((await readTeamRoster('crew'))!.holds.includes(item.id));
  await items.assignItem(item.id, ann, 'lead');
  assert.deepEqual(await listsHolding(item.id), ['agent:ann', 'team:crew']);
  const moved = await items.handoffItem(item.id, team, bo, 'lead');
  assert.deepEqual([moved.line.from, moved.line.to], ['team:crew', 'agent:bo']);
  assert.deepEqual(await listsHolding(item.id), ['agent:ann', 'agent:bo']);
  assert.equal(moved.item.parent, parent.id);
  assert.equal(moved.item.title, 'piece');
});

test('release leaves the id on no list; the other held item stays', async () => {
  const first = (await items.createItem({ title: 'first' }, 'lead')).item;
  const second = (await items.createItem({ title: 'second' }, 'lead')).item;
  await items.assignItem(first.id, bo, 'lead');
  await items.assignItem(second.id, bo, 'lead');
  const released = await items.releaseItem(first.id, 'bo');
  assert.equal(released.line.op, 'release');
  assert.deepEqual(await listsHolding(first.id), []);
  assert.ok((await readLetterHolds('bo'))!.holds.includes(second.id));
});

test('no permission: anyone may assign or release, and it is on the trail', async () => {
  const { item } = await items.createItem({ title: 'open' }, 'lead');
  await items.assignItem(item.id, ann, 'somebody_else');
  const back = await items.releaseItem(item.id, 'a_passer_by');
  assert.equal(back.line.by, 'a_passer_by');
});

test('the 2026-09-24 duplicate cannot recur: concurrent holding changes never copy the item', async () => {
  // Old shape: a return wrote its stale Inbox back over a concurrent assignment and the
  // assigned Project existed twice (Inbox and the holder's record). Here there is one file
  // per id and holding is a list of ids, moved under one lock.
  const one = (await items.createItem({ title: 'surface/1', holder: team }, 'lead')).item;
  const two = (await items.createItem({ title: 'surface/2', holder: team }, 'lead')).item;
  await items.assignItem(two.id, bo, 'lead');
  const before = (await items.listItems()).length;
  await Promise.all([items.assignItem(two.id, team, 'bo'), items.assignItem(one.id, ann, 'lead')]);
  assert.deepEqual(await listsHolding(one.id), ['agent:ann', 'team:crew']);
  assert.deepEqual(await listsHolding(two.id), ['agent:bo', 'team:crew']);
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
  assert.deepEqual(await items.releaseHolder('gone', 'gone', 'again'), [], 'a second end finds nothing to release');
});

test('readings: the team reads its own holds and its members\' holds, children after parents', async () => {
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
  const every = new Map((await everyItemReading()).map((item) => [item.id, item.holder]));
  assert.deepEqual([overall.id, piece.id, parked.id, nested.id].map((id) => every.get(id)), ['team:readers', 'agent:reader_a', '', ''], 'every item names the holder it is found on');
});

test('the Team\'s board: the root the Team holds, else the root its lead holds, else null; an item under a board is never it', async () => {
  await createTeamRoster('boarders', { objective: 'board us' });
  await seedTegami('cap');
  await seedTegami('deck');
  const boarders = { kind: 'team', name: 'boarders' } as const;
  const sessions = [{ name: 'cap', key: 'cap', tags: ['boarders'] }, { name: 'deck', key: 'deck', tags: ['boarders'] }];
  const top = (await items.createItem({ title: 'top' }, 'lead')).item;
  await items.createItem({ title: 'filed under top', parent: top.id, holder: boarders }, 'lead');
  assert.equal(teamBoard(await teamReading('boarders', sessions), 'cap'), null, 'an item with a parent is not a Team epic');
  const capBoard = (await items.createItem({ title: 'cap board', holder: { kind: 'agent', name: 'cap' } }, 'lead')).item;
  assert.equal(teamBoard(await teamReading('boarders', sessions), 'deck'), null, 'another member\'s root is not the lead\'s');
  assert.equal(teamBoard(await teamReading('boarders', sessions), 'cap')?.id, capBoard.id, 'no Team root: the lead\'s root');
  const teamBoardItem = (await items.createItem({ title: 'team board', holder: boarders }, 'lead')).item;
  assert.equal(teamBoard(await teamReading('boarders', sessions), 'cap')?.id, teamBoardItem.id, 'the Team\'s own root comes first');
});

test('nesting under a held board queues its holder exactly one message; under an unheld board, none', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  const clear = async () => { await dismissMessages((await listQueuedMessages()).map((message) => message.id)); };
  await clear();
  await seedTegami('boarder');
  const held = (await items.createItem({ title: 'held board', holder: { kind: 'agent', name: 'boarder' } }, 'lead')).item;
  const unheld = (await items.createItem({ title: 'unheld board' }, 'lead')).item;
  await clear();

  const piece = (await items.createItem({ title: 'piece' }, 'lead')).item;
  assert.deepEqual(await listQueuedMessages(), [], 'no parent: nobody is told');
  const moved = await items.editItem(piece.id, { parent: held.id }, 'lead');
  assert.deepEqual(moved.notified, ['boarder']);
  const queued = await listQueuedMessages();
  assert.equal(queued.length, 1);
  assert.equal(queued[0]!.target, 'boarder');
  assert.equal(queued[0]!.text, `${piece.id} piece was added under ${held.id}, which you hold. Handle it as you see fit.`);
  await clear();

  assert.deepEqual((await items.editItem(piece.id, { parent: unheld.id }, 'lead')).notified, []);
  assert.deepEqual(await listQueuedMessages(), [], 'a board held by nobody notifies nobody');
  const born = await items.createItem({ title: 'born under', parent: held.id }, 'lead');
  assert.deepEqual(born.notified, ['boarder'], 'a create with a parent is announced the same way');
  assert.equal((await listQueuedMessages()).length, 1);
  await clear();
});

test('a change by anyone but the holding Agent acks that Agent once; its own change, never', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  const clear = async () => { await dismissMessages((await listQueuedMessages()).map((message) => message.id)); };
  await seedTegami('keeper');
  const item = (await items.createItem({ title: 'kept' }, 'lead')).item;
  await clear();
  const acks = async () => (await listQueuedMessages()).filter((message) => message.target === 'keeper' && /Your work record changed|\(item read w\d+\)/.test(message.text)).length;
  await items.assignItem(item.id, { kind: 'agent', name: 'keeper' }, 'lead');
  assert.equal(await acks(), 1, 'an assign by someone else: one ack, not two');
  await clear();
  await items.editItem(item.id, { status: 'BUILD' }, 'lead');
  assert.equal(await acks(), 1);
  await clear();
  await items.editItem(item.id, { status: 'REVIEW' }, 'keeper');
  assert.equal(await acks(), 0, 'its own write is not acked');
  await clear();
  await items.addComment(item.id, 'over to you', 'lead');
  assert.equal(await acks(), 1, 'a comment by someone else is a change like any other');
  await clear();
  await items.addComment(item.id, 'noted', 'keeper');
  assert.equal(await acks(), 0);
  await clear();
});

test('an arrival made by the holder itself tells nobody', async () => {
  await seedTegami('maker');
  const parent = (await items.createItem({ title: 'mine', holder: { kind: 'agent', name: 'maker' } }, 'lead')).item;
  assert.deepEqual((await items.createItem({ title: 'my own child', parent: parent.id }, 'maker')).notified, []);
  assert.deepEqual((await items.createItem({ title: 'someone else\'s', parent: parent.id }, 'lead')).notified, ['maker']);
});

test('session_create\'s caller survives the launch filter, so a lead is not told of its own birth', async () => {
  const { acceptedLaunchBody } = await import('../src/routes/launch.js');
  assert.equal(acceptedLaunchBody({ name: 'member', caller: 'lead' }).body.caller, 'lead');
});
