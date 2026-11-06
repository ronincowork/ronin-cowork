/**
 * HOLDING — lists of item ids on Teams and Agents, never copies of items.
 * Checks: concurrent handoffs add holders; handoff removes only the giver; release leaves
 * it on none.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

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

test('two concurrent handoffs of one id add every holder', async () => {
  for (let round = 0; round < 5; round++) {
    const { item } = await items.createItem({ title: `race ${round}` }, 'lead');
    await Promise.all([items.handoffItem(item.id, ann, 'lead'), items.handoffItem(item.id, bo, 'lead'), items.handoffItem(item.id, team, 'lead')]);
    const held = await listsHolding(item.id);
    assert.deepEqual(held, ['agent:ann', 'agent:bo', 'team:crew'], `round ${round}`);
    const trail = (await items.readItem(item.id))!.trail.filter((line) => line.op === 'handoff');
    assert.equal(trail.length, 3, 'every call acknowledged with its own line');
    assert.equal(trail.at(-1)!.to, 'team:crew', 'the last line names the added holder');
  }
});

test('handoff moves only the giver; content and parent stay put', async () => {
  const parent = (await items.createItem({ title: 'overall' }, 'lead')).item;
  const { item } = await items.createItem({ title: 'piece', parent: parent.id }, 'lead');
  await items.handoffItem(item.id, team, 'lead');
  assert.ok((await readTeamRoster('crew'))!.holds.includes(item.id));
  await items.handoffItem(item.id, ann, 'lead');
  assert.deepEqual(await listsHolding(item.id), ['agent:ann', 'team:crew']);
  const moved = await items.handoffItem(item.id, bo, 'lead', { from: team });
  assert.deepEqual([moved.line.from, moved.line.to], ['team:crew', 'agent:bo']);
  assert.deepEqual(await listsHolding(item.id), ['agent:ann', 'agent:bo']);
  assert.equal(moved.item.parent, parent.id);
  assert.equal(moved.item.title, 'piece');
});

test('release leaves the id on no list; the other held item stays', async () => {
  const first = (await items.createItem({ title: 'first' }, 'lead')).item;
  const second = (await items.createItem({ title: 'second' }, 'lead')).item;
  await items.handoffItem(first.id, bo, 'lead');
  await items.handoffItem(second.id, bo, 'lead');
  const released = await items.releaseItem(first.id, 'bo');
  assert.equal(released.line.op, 'release');
  assert.deepEqual(await listsHolding(first.id), []);
  assert.ok((await readLetterHolds('bo'))!.holds.includes(second.id));
});

test('no permission: anyone may hand off or release, and it is on the trail', async () => {
  const { item } = await items.createItem({ title: 'open' }, 'lead');
  await items.handoffItem(item.id, ann, 'somebody_else');
  const back = await items.releaseItem(item.id, 'a_passer_by');
  assert.equal(back.line.by, 'a_passer_by');
});

test('the 2026-09-24 duplicate cannot recur: concurrent holding changes never copy the item', async () => {
  // Old shape: a return wrote its stale Inbox back over a concurrent assignment and the
  // assigned Project existed twice (Inbox and the holder's record). Here there is one file
  // per id and holding is a list of ids, moved under one lock.
  const one = (await items.createItem({ title: 'surface/1', holder: team }, 'lead')).item;
  const two = (await items.createItem({ title: 'surface/2', holder: team }, 'lead')).item;
  await items.handoffItem(two.id, bo, 'lead');
  const before = (await items.listItems()).length;
  await Promise.all([items.handoffItem(two.id, team, 'bo'), items.handoffItem(one.id, ann, 'lead')]);
  assert.deepEqual(await listsHolding(one.id), ['agent:ann', 'team:crew']);
  assert.deepEqual(await listsHolding(two.id), ['team:crew'], 'bo gave it to the Team and came off');
  const all = await items.listItems();
  assert.equal(all.length, before, 'no second item was made');
  assert.equal(all.filter((item) => item.title === 'surface/1').length, 1);
});

test('an ended Agent orphans nothing: each item gets holder-ended, to the Team above it, or unassigned with no Team found', async () => {
  await seedTegami('gone');
  const gone = { kind: 'agent', name: 'gone' } as const;
  const parent = (await items.createItem({ title: 'team overall', holder: team }, 'lead')).item;
  const child = (await items.createItem({ title: 'piece', parent: parent.id, holder: gone }, 'lead')).item;
  const loose = (await items.createItem({ title: 'loose', holder: gone }, 'lead')).item;
  const released = await items.releaseHolder('gone', 'gone', 'session ended');
  assert.deepEqual(released.map(({ line }) => [line.op, line.from, line.to, line.note]), [
    ['holder-ended', 'agent:gone', 'team:crew', 'session ended'], ['holder-ended', 'agent:gone', 'none', 'session ended'],
  ]);
  assert.deepEqual((await readLetterHolds('gone'))!.holds, []);
  assert.deepEqual(await listsHolding(child.id), ['team:crew'], 'To Do goes to the Team holding the item above it');
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

test('session_create\'s caller survives the launch filter, so a lead is not told of its own birth', async () => {
  const { acceptedLaunchBody } = await import('../src/routes/launch.js');
  assert.equal(acceptedLaunchBody({ name: 'member', caller: 'lead' }).body.caller, 'lead');
});

test('renameItem moves the id: the file, a child\'s parent, a link to it, every holder\'s holds, one trail line, nobody told', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('renamer');
  const renamer = { kind: 'agent', name: 'renamer' } as const;
  const { item } = await items.createItem({ title: 'made in Ronin', holder: renamer }, 'lead');
  await items.handoffItem(item.id, team, 'lead');
  const child = (await items.createItem({ title: 'under it', parent: item.id }, 'lead')).item;
  const other = (await items.createItem({ title: 'blocks it' }, 'lead')).item;
  await items.linkItem(other.id, 'Blocks', item.id, 'lead');
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));

  const done = await items.renameItem(item.id, 'KAN-65', 'jira:Ronin');
  assert.equal(done.item.id, 'KAN-65');
  assert.equal(existsSync(path.join(process.env.RONIN_WORK_ITEMS_DIR!, `${item.id}.json`)), false, 'the old file is gone');
  assert.equal((await items.readItem(item.id))!.id, 'KAN-65', 'every id an item has had still finds it');
  assert.equal((await items.editItem(item.id, { title: 'made in Ronin' }, 'lead')).item.id, 'KAN-65', 'an act by the old id acts on the item');
  assert.equal((await items.createItem({ title: 'under the old id', parent: item.id }, 'lead')).item.parent, 'KAN-65', '--parent by the old id');
  assert.equal((await items.readItem('KAN-65'))!.title, 'made in Ronin');
  assert.equal((await items.readItem(child.id))!.parent, 'KAN-65');
  assert.deepEqual((await items.readItem(other.id))!.links, [{ type: 'Blocks', to: 'KAN-65' }]);
  assert.deepEqual(await listsHolding('KAN-65'), ['agent:renamer', 'team:crew']);
  assert.deepEqual(await listsHolding(item.id), []);
  const trail = (await items.readItem('KAN-65'))!.trail;
  assert.equal(trail.filter((line) => line.op === 'rename').length, 1);
  assert.equal(trail.find((line) => line.op === 'rename')!.note, `renamed from ${item.id}`);
  assert.ok((await items.listItems()).some((one) => one.id === 'KAN-65'), 'a key is listed');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'renamer'), [], 'a rename tells nobody');
  assert.match((await items.createItem({ title: 'next' }, 'lead')).item.id, /^w[0-9]+$/, 'the issuer counts w ids only');
});

/* ONE RECIPIENT RULE — holders are the Agents and the Teams holding an item; watchers are the
 * Agents watching it or above, the Teams whose roster watches it or above, and the Teams whose
 * members hold it. A Team hears through its lead, found at send time. A fake tmux on PATH lists
 * the sessions in its rows file: cap, lead of crew, cap2 and mem, in crew; lead(name, teams)
 * makes that session the lead of those teams. */
async function withLead(t: { after(fn: () => void): void }): Promise<(name: string, teams?: string) => Promise<void>> {
  const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-holders-bin-'));
  const rows = path.join(bin, 'rows');
  const lead = (name: string, teams = 'crew') => fs.writeFile(rows, ['cap', 'cap2', 'mem'].map((session) =>
    [session, '', '1', '0', '1', 'crew', session === name ? teams : '', session, '', '', '', '0', ''].join('\t')).join('\n') + '\n');
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

test('the unheld list is held by nobody and watched by nobody: an Agent\'s or a Team\'s watch takes an item off it', async () => {
  const express = (await import('express')).default;
  const { registerWorkItems } = await import('../src/routes/work-items-api.js');
  const app = express();
  registerWorkItems(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const unheld = async () => ((await (await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/work-items?holder=none`)).json()) as { items: Array<{ id: string }> }).items.map((item) => item.id);
  try {
    await seedTegami('follower');
    await createTeamRoster('followers', { objective: 'follow things' });
    const [loose, mine, ours] = await Promise.all(['loose', 'agent-watched', 'team-watched'].map(async (title) => (await items.createItem({ title }, 'lead')).item.id));
    await items.watchItem(mine!, { kind: 'agent', name: 'follower' }, true);
    await items.watchItem(ours!, { kind: 'team', name: 'followers' }, true);
    const list = await unheld();
    assert.ok(list.includes(loose!));
    assert.deepEqual([list.includes(mine!), list.includes(ours!)], [false, false]);
  } finally {
    server.close();
  }
});

test('a watcher is not told of its own move', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('self');
  const { item } = await items.createItem({ title: 'watched' }, 'lead');
  await items.watchItem(item.id, { kind: 'agent', name: 'self' }, true);
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  await items.editItem(item.id, { status: 'In Progress' }, 'self');
  await items.flagItem(item.id, true, undefined, 'self');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'self'), []);
  await items.editItem(item.id, { status: 'In Review' }, 'lead');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'self').map((message) => message.text),
    [`${item.id}: status In Progress → In Review by lead.`], 'watching the item itself: no "(under …)"');
});

test('a lead\'s create lands on its Team, a member\'s on itself, and neither is told nor put on the unheld list', async (t) => {
  await withLead(t);
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('mem');
  const epic = (await items.createItem({ title: 'the team epic', kind: 'Epic' }, 'cap')).item;
  assert.deepEqual(await listsHolding(epic.id), ['team:crew'], 'an Epic needs no epic above it');
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  const mine = (await items.createItem({ title: 'my piece', parent: epic.id }, 'mem')).item;
  assert.deepEqual(await listsHolding(mine.id), ['agent:mem']);
  assert.equal(mine.trail[0]!.to, 'agent:mem');
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'mem'), [], 'not told of its own create');
  const led = (await items.createItem({ title: 'team piece', parent: epic.id }, 'cap')).item;
  assert.deepEqual(await listsHolding(led.id), ['team:crew']);
  assert.deepEqual((await listQueuedMessages()).filter((message) => message.target === 'cap'), [], 'a new item is no notice');
  const named = (await items.createItem({ title: 'for ann', parent: epic.id, holder: ann }, 'cap')).item;
  assert.deepEqual(await listsHolding(named.id), ['agent:ann'], 'a holder named wins');
});

test('an Agent\'s new item needs an epic above it; the owner, Ronin and Jira are not refused', async (t) => {
  await withLead(t);
  const story = (await items.createItem({ title: 'a loose story' }, 'boss')).item;
  await assert.rejects(items.createItem({ title: 'no epic' }, 'mem'), (error: Error) => error instanceof items.WorkItemRefused && /needs an epic above it/.test(error.message));
  await assert.rejects(items.createItem({ title: 'under a story with no epic', parent: story.id }, 'cap'), /needs an epic above it/);
  const paired = (await items.createItem({ title: 'from Jira', jira: { id: '99001', key: 'KAN-901' } }, 'mem')).item;
  assert.equal(paired.id, 'KAN-901', 'a paired item is the bridge\'s');
  assert.ok((await items.createItem({ title: 'owner\'s' }, 'owner')).item.id);
});

test('KAN-295: an Epic made by a member goes to its Team, not itself; a create with no epic names the Team\'s open epics', async (t) => {
  await withLead(t);
  const epic = (await items.createItem({ title: 'member made epic', kind: 'Epic' }, 'mem')).item;
  assert.deepEqual(await listsHolding(epic.id), ['team:crew'], 'an epic is the lead\'s: it lands on the Team');
  assert.equal(epic.trail[0]!.to, 'team:crew');
  const done = (await items.createItem({ title: 'finished epic', kind: 'Epic', status: 'Done', holder: team }, 'boss')).item;
  await assert.rejects(items.createItem({ title: 'loose piece' }, 'mem'), (error: Error) => error instanceof items.WorkItemRefused
    && /needs an epic above it: name one with --parent <id>\. Team crew's open epics: /.test(error.message)
    && error.message.includes(`${epic.id} 'member made epic'`) && !error.message.includes(done.id));
});

test('a lead of several teams names one; without it the create is refused naming its teams', async (t) => {
  const lead = await withLead(t);
  await createTeamRoster('second', { objective: 'another' });
  await lead('cap', 'crew,second');
  const epic = (await items.createItem({ title: 'second epic', kind: 'Epic', holder: { kind: 'team', name: 'second' } }, 'cap')).item;
  assert.deepEqual(await listsHolding(epic.id), ['team:second']);
  await assert.rejects(items.createItem({ title: 'which team', kind: 'Epic' }, 'cap'), /You lead crew, second; name one with --team/);
});

/* AN AGENT ENDS — its items go back to its one Team, Done ones to nobody; To Do tells nobody. */
test('an ending member\'s To Do goes to its Team, Done to nobody, and nobody is told (crash, archive, Shut down)', async (t) => {
  await withLead(t);
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('leaver', { repo: '', branch: '' }, [{ team: 'crew', team_role: 'member', objective: '' }]);
  const leaver = { kind: 'agent', name: 'leaver' } as const;
  const epic = (await items.createItem({ title: 'leaver epic', kind: 'Epic', holder: team }, 'boss')).item;
  const open = (await items.createItem({ title: 'still open', parent: epic.id, holder: leaver }, 'boss')).item;
  const done = (await items.createItem({ title: 'finished', status: 'Done', holder: leaver }, 'boss')).item;
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  const released = await items.releaseHolder('leaver', 'leaver', 'session ended');
  assert.deepEqual(released.map(({ item, line }) => [item.id, line.op, line.to]), [[open.id, 'holder-ended', 'team:crew'], [done.id, 'holder-ended', 'none']]);
  assert.deepEqual(await listsHolding(open.id), ['team:crew']);
  assert.deepEqual(await listsHolding(done.id), []);
  assert.equal((await items.readItem(open.id))!.parent, epic.id, 'it sits on its epic');
  assert.deepEqual((await listQueuedMessages()).map((message) => message.text), [], 'nobody is told');
});

test('a lead\'s reading shows its Team\'s items: what the Team holds and watches, and what each member holds and watches', async (t) => {
  await withLead(t);
  const { agentReading } = await import('../src/work-items-read.js');
  await seedTegami('mem');
  const epic = (await items.createItem({ title: 'read epic', kind: 'Epic', holder: team }, 'boss')).item;
  const watched = (await items.createItem({ title: 'team watched', kind: 'Epic' }, 'boss')).item;
  const piece = (await items.createItem({ title: 'member piece', parent: epic.id, holder: { kind: 'agent', name: 'mem' } }, 'boss')).item;
  await items.watchItem(watched.id, team, true);
  await items.watchItem(watched.id, { kind: 'agent', name: 'mem' }, true);
  await items.attachDoc(epic.id, 'https://example.com/team-plan.md', 'boss');
  const reading = await agentReading('cap');
  assert.deepEqual(reading.attachments, ['https://example.com/team-plan.md'], 'the Team\'s docs are the lead\'s');
  const crew = reading.teams.find((one) => one.team === 'crew')!;
  assert.ok(crew.items.some((item) => item.id === epic.id));
  assert.deepEqual(crew.watching.map((item) => item.id), [watched.id]);
  const mem = crew.members.find((member) => member.name === 'mem')!;
  assert.ok(mem.items.some((item) => item.id === piece.id));
  assert.deepEqual(mem.watching.map((item) => item.id), [watched.id]);
  assert.deepEqual((await agentReading('mem')).teams, [], 'a member leads nothing');
  await items.watchItem(watched.id, team, false);
});

test('a promotion of an item already Done tells nobody; its line stays on the trail', async () => {
  const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
  await seedTegami('finisher');
  await seedTegami('follower');
  const { item } = await items.createItem({ title: 'finished', status: 'Done', holder: { kind: 'agent', name: 'finisher' } }, 'lead');
  await items.watchItem(item.id, { kind: 'agent', name: 'follower' }, true);
  await dismissMessages((await listQueuedMessages()).map((message) => message.id));
  // As src/promotion/promote.ts moves it: the transition route, status Done, the receipt as note.
  await items.editItem(item.id, { status: 'Done' }, 'promotion', 'promotion 20261030T112406Z-promote-x');
  assert.deepEqual((await listQueuedMessages()).filter((message) => ['finisher', 'follower'].includes(message.target)), []);
  assert.equal((await items.readItem(item.id))!.trail.at(-1)!.note, 'promotion 20261030T112406Z-promote-x; no change');
  await items.editItem(item.id, { status: 'In Progress' }, 'promotion');
  assert.deepEqual((await listQueuedMessages()).map((message) => message.target).sort(), ['follower'], 'a real move is told to its watcher');
});

test('a w id is never issued twice: renamed to its Jira key, its number stays used', async () => {
  const { item } = await items.createItem({ title: 'goes to Jira' }, 'lead');
  await items.renameItem(item.id, 'KAN-301', 'jira:ronin_machine');
  const next = (await items.createItem({ title: 'the next one' }, 'lead')).item.id;
  assert.notEqual(next, item.id);
  assert.ok(Number(next.slice(1)) > Number(item.id.slice(1)));
  // A store with no issued file yet starts past every renamed w id, from the trail.
  await items.renameItem(next, 'KAN-302', 'jira:ronin_machine');
  await fs.rm(path.join(process.env.RONIN_WORK_ITEMS_DIR!, 'issued'));
  const after = (await items.createItem({ title: 'after a fresh start' }, 'lead')).item.id;
  assert.ok(Number(after.slice(1)) > Number(next.slice(1)), `${after} after ${next}`);
});

/* KAN-261: Done leaves every list, however it got there; no id twice on a list. */
test('a move to Done keeps its holders, however it went Done: the record shows it Done', async () => {
  for (const [way, by] of [['Accept', 'owner'], ['item transition', 'lead'], ['Jira', 'jira:someone']]) {
    const { item } = await items.createItem({ title: `done by ${way}`, holder: team }, 'lead');
    await items.handoffItem(item.id, ann, 'lead');
    const done = await items.editItem(item.id, { status: 'Done' }, by!);
    assert.equal(done.line.note, undefined, `${way}: the status line names no holder taken off`);
    assert.deepEqual(await listsHolding(item.id), ['agent:ann', 'team:crew'], `${way}: still on its lists`);
  }
});

test('Done by its name on a Jira space that lists Done second: a move to In Review keeps its holders', async () => {
  items.setSpaceNames('jorder', { ...items.JIRA_NAMES, statuses: ['To Do', 'Done', 'In Progress', 'In Review'] });
  try {
    const { item } = await items.createItem({ title: 'jira order', holder: team, campaign_id: 'jorder' }, 'lead');
    await items.editItem(item.id, { status: 'In Review' }, 'owner');
    assert.deepEqual(await listsHolding(item.id), ['team:crew'], 'In Review keeps its holders');
    assert.equal(items.DONE, 'Done');
  } finally { items.setSpaceNames('jorder', null); }
});

test('the work record shows a Done item as "Done · <how long ago>" while it waits', async () => {
  const read = await fs.readFile(new URL('../libexec/work-record-read', import.meta.url), 'utf8');
  assert.match(read, /return "Done · %s" % when if when else "Done"/);
  assert.match(read, /line = lambda i: "- %s %s · %s%s" % \(i\["id"\], i\["title"\], status\(i\)/);
});

test('an id is on a holds list once: a doubled list reads once, and writes back once', async () => {
  const { writeTeamRoster } = await import('../src/team-rosters.js');
  const { writeLetterHolds } = await import('../src/tegami.js');
  const { item } = await items.createItem({ title: 'twice' }, 'lead');
  const roster = (await readTeamRoster('crew'))!;
  await writeTeamRoster('crew', { holds: [...roster.holds, item.id, item.id] }, roster.campaign_id);
  assert.equal((await readTeamRoster('crew'))!.holds.filter((id) => id === item.id).length, 1);
  await writeLetterHolds('bo', [item.id, item.id]);
  assert.deepEqual((await readLetterHolds('bo'))!.holds, [item.id]);
  await items.handoffItem(item.id, team, 'lead');
  await items.handInItem(item.id, 'ann', { desk: true, receipts: ['r1'] });
  await items.handInItem(item.id, 'ann', { desk: true, receipts: ['r2'] });
  assert.equal((await readTeamRoster('crew'))!.holds.filter((id) => id === item.id).length, 1, 'a second hand-in adds no second copy');
});

test('a work record seeded with the old watches line is corrected on its next write: a status change only', async () => {
  const { tegamiPath, writeLetterWatches } = await import('../src/tegami.js');
  await seedTegami('oldrec');
  const file = tegamiPath('oldrec');
  const fresh = await fs.readFile(file, 'utf8');
  assert.match(fresh, /you hear\n>   of a status change on that item, nothing else\./);
  await fs.writeFile(file, fresh.replace('>   of a status change on that item, nothing else.', '>   the moves under each (status, flag, a new child, a holder change).'));
  await writeLetterWatches('oldrec', []);
  const after = await fs.readFile(file, 'utf8');
  assert.doesNotMatch(after, /a new child, a holder change/);
  assert.match(after, /of a status change on that item, nothing else\./);
});

test('a list holding an item under its old w id and its Jira key reads it once, and writes back once', async () => {
  const { writeTeamRoster } = await import('../src/team-rosters.js');
  const { item } = await items.createItem({ title: 'keyed twice', holder: team }, 'lead');
  const was = item.id;
  await items.renameItem(was, 'KAN-9261', 'jira:Ronin');
  const roster = (await readTeamRoster('crew'))!;
  assert.ok(roster.holds.includes('KAN-9261') && !roster.holds.includes(was), 'a rename rewrites the old id on the list');
  // A write from elsewhere brings the old id back beside the key, as on the live roster.
  await writeTeamRoster('crew', { holds: [...roster.holds, was] }, roster.campaign_id);
  assert.deepEqual(await listsHolding('KAN-9261'), ['team:crew'], 'the store reads the old id as the key');
  assert.deepEqual((await readTeamRoster('crew'))!.holds.filter((id) => id === 'KAN-9261' || id === was), ['KAN-9261'], 'and writes the list back clean at once');
  const reading = await teamReading('crew');
  assert.equal(reading.items.filter((one) => one.id === 'KAN-9261').length, 1, 'the Team reading shows it once');
});

/* THE ARCHIVE (KAN-266): Done five days is off every list, the Epics push and default search. */
test('Done five days is archived, however it went Done: off every list, the Epics push and search; read finds it; leaving Done brings it back', async () => {
  const day = 24 * 60 * 60 * 1000;
  const { epicsPush, everyItemReading } = await import('../src/work-items-read.js');
  const epic = (await items.createItem({ title: 'archive epic', kind: 'Epic', holder: team }, 'lead')).item;
  const ways: Array<[string, (id: string) => Promise<unknown>]> = [
    ['Accept', (id) => items.editItem(id, { status: 'Done' }, 'owner')],
    ['item transition', (id) => items.editItem(id, { status: 'Done' }, 'lead')],
    ['Jira', (id) => items.editItem(id, { status: 'Done', title: 'renamed by Jira too' }, 'jira:someone')],
  ];
  const ids: string[] = [];
  for (const [way, done] of ways) {
    const { item } = await items.createItem({ title: `archive by ${way}`, parent: epic.id, holder: team }, 'lead');
    await items.handoffItem(item.id, ann, 'lead');
    await done(item.id);
    ids.push(item.id);
  }
  const at = Date.parse(items.doneSince((await items.readItem(ids[0]!))!));
  assert.deepEqual((await items.archiveDone(at + 4 * day)).filter((id) => ids.includes(id)), [], 'four days on: still on its lists');
  for (const id of ids) assert.deepEqual(await listsHolding(id), ['agent:ann', 'team:crew']);
  assert.deepEqual((await items.archiveDone(at + 5 * day + 60_000)).filter((id) => ids.includes(id)), ids, 'five days on: every way out is archived');
  for (const id of ids) {
    const item = (await items.readItem(id))!;
    assert.ok(item.archived, `${id} read still finds it, archived`);
    assert.equal(item.status, 'Done');
    assert.deepEqual(await listsHolding(id), [], 'off every list');
    assert.deepEqual([item.trail.at(-1)!.op, item.trail.at(-1)!.note, item.trail.at(-1)!.from], ['release', 'archived: Done 5 days', 'team:crew, agent:ann']);
    assert.ok(item.external.jira === undefined, 'Ronin only: no pair made or changed');
  }
  const push = epicsPush(await everyItemReading());
  assert.ok(!push.items.some((one) => ids.includes(one.id)), 'off the Epics workbench');
  assert.equal(push.epics.find((one) => one.id === epic.id)!.archived_under, 3, 'its Epic counts them');
  assert.deepEqual(await items.archiveDone(at + 9 * day), [], 'a second sweep finds nothing');
  // Leaving Done brings it back.
  await items.editItem(ids[2]!, { status: 'In Progress' }, 'jira:someone');
  assert.equal((await items.readItem(ids[2]!))!.archived, undefined, 'a Jira reopen brings it back');
  assert.ok(epicsPush(await everyItemReading()).items.some((one) => one.id === ids[2]));
});

test('item search leaves archived items out unless --archived', async () => {
  const express = (await import('express')).default;
  const { registerWorkItems } = await import('../src/routes/work-items-api.js');
  const app = express(); app.use(express.json()); registerWorkItems(app);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const { item } = await items.createItem({ title: 'searchable archive', holder: team }, 'lead');
    await items.editItem(item.id, { status: 'Done' }, 'owner');
    await items.archiveDone(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const ids = async (q: string) => ((await (await fetch(`${base}/api/work-items?text=searchable${q}`)).json()) as { items: Array<{ id: string }> }).items.map((one) => one.id);
    assert.deepEqual(await ids(''), []);
    assert.deepEqual(await ids('&archived=1'), [item.id]);
    assert.equal(((await (await fetch(`${base}/api/work-items/${item.id}`)).json()) as { item: { id: string } }).item.id, item.id, 'item read finds it');
  } finally { server.close(); }
});
