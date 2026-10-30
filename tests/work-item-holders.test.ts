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
  const acks = async () => (await listQueuedMessages()).filter((message) => message.target === 'keeper' && /Your work record changed|^w\d+: /.test(message.text)).length;
  await items.assignItem(item.id, { kind: 'agent', name: 'keeper' }, 'lead');
  assert.equal(await acks(), 1, 'an assign by someone else: one ack, not two');
  await clear();
  await items.editItem(item.id, { status: 'In Progress' }, 'lead');
  assert.equal(await acks(), 1);
  await clear();
  await items.editItem(item.id, { status: 'In Review' }, 'keeper');
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

test('renameItem moves the id: the file, a child\'s parent, a link to it, every holder\'s holds, one trail line, the holder told', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('renamer');
  const renamer = { kind: 'agent', name: 'renamer' } as const;
  const { item } = await items.createItem({ title: 'made in Ronin', holder: renamer }, 'lead');
  await items.assignItem(item.id, team, 'lead');
  const child = (await items.createItem({ title: 'under it', parent: item.id }, 'lead')).item;
  const other = (await items.createItem({ title: 'blocks it' }, 'lead')).item;
  await items.linkItem(other.id, 'Blocks', item.id, 'lead');
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));

  const done = await items.renameItem(item.id, 'KAN-65', 'jira:Ronin');
  assert.equal(done.item.id, 'KAN-65');
  assert.equal(await items.readItem(item.id), null, 'the old file is gone');
  assert.equal((await items.readItem('KAN-65'))!.title, 'made in Ronin');
  assert.equal((await items.readItem(child.id))!.parent, 'KAN-65');
  assert.deepEqual((await items.readItem(other.id))!.links, [{ type: 'Blocks', to: 'KAN-65' }]);
  assert.deepEqual(await listsHolding('KAN-65'), ['agent:renamer', 'team:crew']);
  assert.deepEqual(await listsHolding(item.id), []);
  const trail = (await items.readItem('KAN-65'))!.trail;
  assert.equal(trail.filter((line) => line.op === 'rename').length, 1);
  assert.equal(trail.at(-1)!.note, `renamed from ${item.id}`);
  assert.ok((await items.listItems()).some((one) => one.id === 'KAN-65'), 'a key is listed');
  const told = (await listQueuedMessages()).find((message) => message.target === 'renamer');
  assert.equal(told?.text, `${item.id} is now KAN-65 (its Jira key); nothing to do.`);
  assert.match((await items.createItem({ title: 'next' }, 'lead')).item.id, /^w[0-9]+$/, 'the issuer counts w ids only');
});

/* ONE RECIPIENT RULE — holders are the Agents holding an item; watchers are the Agents
 * watching it or above, and each watching Team's lead. A Team watches what it and its Agents
 * hold, found at send time. A fake tmux on PATH lists the sessions in its rows file: cap, lead
 * of crew, and mem, in crew; lead(name) makes another session crew's lead. */
async function withLead(t: { after(fn: () => void): void }): Promise<(name: string) => Promise<void>> {
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-holders-bin-'));
  const rows = path.join(bin, 'rows');
  const lead = (name: string) => fs.writeFile(rows, ['cap', 'cap2', 'mem'].map((session) =>
    [session, '', '1', '0', '1', 'crew', session === name ? 'crew' : '', session, '', '', '', '0', ''].join('\t')).join('\n') + '\n');
  await lead('cap');
  await fs.writeFile(path.join(bin, 'tmux'), [
    '#!/bin/sh',
    'case "$*" in',
    `  *list-sessions*ronin-key*) cat '${rows}';;`,
    '  *) exit 1;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  const before = process.env.PATH;
  process.env.PATH = `${bin}:${before ?? ''}`;
  t.after(() => { process.env.PATH = before; });
  return lead;
}

test('a member\'s status move reaches its lead as a watcher message, and the member as its holder', async (t) => {
  await withLead(t);
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('mem');
  const { item } = await items.createItem({ title: 'member work', holder: { kind: 'agent', name: 'mem' } }, 'boss');
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  await items.editItem(item.id, { status: 'In Progress' }, 'boss');
  assert.deepEqual((await listQueuedMessages()).map((message) => [message.target, message.text]).sort(), [
    ['cap', `${item.id}: status To Do → In Progress by boss.`],
    ['mem', `${item.id}: status To Do → In Progress by boss.`],
  ]);
});

test('the Team is the watcher: a new lead hears the next member move, the old lead nothing, and nobody\'s watches changed', async (t) => {
  const lead = await withLead(t);
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('mem');
  const { item } = await items.createItem({ title: 'member move', holder: { kind: 'agent', name: 'mem' } }, 'boss');
  await lead('cap2');
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  await items.editItem(item.id, { status: 'In Progress' }, 'mem');
  assert.deepEqual((await listQueuedMessages()).map((message) => [message.target, message.text]), [['cap2', `${item.id}: status To Do → In Progress by mem.`]]);
  assert.deepEqual((await readLetterHolds('mem'))!.watches, [], 'derived at send time, never written');
});

test('a Team-held item: its lead hears a status move and a new child as a watcher, never a comment', async (t) => {
  await withLead(t);
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  const clear = async () => { await dismissMessages((await listQueuedMessages()).map((message) => message.id)); };
  const heard = async () => (await listQueuedMessages()).filter((message) => message.target === 'cap').map((message) => message.text);
  const { item } = await items.createItem({ title: 'team work', holder: team }, 'boss');
  await clear();
  await items.editItem(item.id, { status: 'In Progress' }, 'boss');
  assert.deepEqual(await heard(), [`${item.id}: status To Do → In Progress by boss.`]);
  await clear();
  await items.addComment(item.id, 'a remark', 'boss');
  assert.deepEqual(await heard(), [], 'a Team holding an item puts nobody on the holders list');
  const child = (await items.createItem({ title: 'piece', parent: item.id }, 'boss')).item;
  assert.deepEqual(await heard(), [`${child.id} (under ${item.id}, which you watch): piece was added under ${item.id}.`]);
  await clear();
  await items.editItem(item.id, { status: 'In Review' }, 'cap');
  assert.deepEqual(await heard(), [], 'the lead\'s own move');
});

test('a watcher of an epic hears a grandchild\'s status move and a new child, not a comment; watching holds nothing', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  const clear = async () => { await dismissMessages((await listQueuedMessages()).map((message) => message.id)); };
  const heard = async () => (await listQueuedMessages()).filter((message) => message.target === 'watcher').map((message) => message.text);
  await seedTegami('watcher');
  const epic = (await items.createItem({ title: 'topic', kind: 'Epic' }, 'lead')).item;
  const story = (await items.createItem({ title: 'story', parent: epic.id }, 'lead')).item;
  const step = (await items.createItem({ title: 'step', parent: story.id }, 'lead')).item;
  assert.deepEqual((await items.watchItem(epic.id, 'watcher', true)).watches, [epic.id]);
  assert.deepEqual(await listsHolding(epic.id), [], 'watching is not holding');
  await clear();

  await items.editItem(step.id, { status: 'In Progress' }, 'lead');
  assert.deepEqual(await heard(), [`${step.id} (under ${epic.id}, which you watch): status To Do → In Progress by lead.`]);
  await clear();
  await items.addComment(step.id, 'a note', 'lead');
  await items.editItem(step.id, { title: 'renamed step' }, 'lead');
  assert.deepEqual(await heard(), [], 'comments and edits stay the holders\'');
  const more = (await items.createItem({ title: 'more', parent: story.id }, 'lead')).item;
  assert.deepEqual(await heard(), [`${more.id} (under ${epic.id}, which you watch): more was added under ${story.id}.`]);
  await clear();

  await items.watchItem(epic.id, 'watcher', false);
  await items.editItem(step.id, { status: 'Done' }, 'lead');
  assert.deepEqual(await heard(), [], 'unwatched, nothing');
});

test('a watcher is not told of its own move', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('self');
  const { item } = await items.createItem({ title: 'watched' }, 'lead');
  await items.watchItem(item.id, 'self', true);
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  await items.editItem(item.id, { status: 'In Progress' }, 'self');
  await items.flagItem(item.id, true, undefined, 'self');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'self'), []);
  await items.editItem(item.id, { status: 'In Review' }, 'lead');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'self').map((message) => message.text),
    [`${item.id}: status In Progress → In Review by lead.`], 'watching the item itself: no "(under …)"');
});

test('an Agent that holds and watches an item gets each list\'s message', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('both');
  const { item } = await items.createItem({ title: 'held and watched', holder: { kind: 'agent', name: 'both' } }, 'lead');
  await items.watchItem(item.id, 'both', true);
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  await items.editItem(item.id, { status: 'In Progress' }, 'lead');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'both').map((message) => message.text),
    [`${item.id}: status To Do → In Progress by lead.`, `${item.id}: status To Do → In Progress by lead.`]);
});
