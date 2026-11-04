/**
 * WORK ITEMS, LIGHTER (WORK_ITEMS_DESIGN.md sections 3 and 5; KAN-239 piece A): every id an item
 * has had finds it; several ids per act; create's first line; search --text; a hand-in gives
 * the item to the Team and records who; Send back returns it to that Agent, or leaves it with
 * the Team when the Agent has ended; session_end's list of unfinished holds; an ending or a
 * crash puts items on their epic, held by nobody, silently; on a Jira-connected campaign the
 * shapes Jira refuses are refused; a delete of an item from Jira needs --in-jira, and every
 * delete emits the agreed event.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lighter-'));
// Every store under private roots: nothing reaches a live roster, letter or message queue.
const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-isolated-'));
process.env.RONIN_DATA_ROOT = path.join(isolated, 'data');
process.env.RONIN_USER_ROOT = path.join(isolated, 'user');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;
process.env.TMUX_TMPDIR = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lighter-tmux-'));
process.env.RONIN_WORK_ITEMS_DIR = path.join(temp, 'work-items');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_SESSION_DIR = path.join(temp, 'sessions');

// The live sessions, as a stub tmux answers them: cap leads crew, mem is its member.
const bin = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-lighter-bin-'));
const rows = path.join(bin, 'rows');
const live = (names: string[]) => fs.writeFile(rows, names.map((session) =>
  [session, '', '1', '0', '1', 'crew', session === 'cap' ? 'crew' : '', session, '', '', '', '0', ''].join('\t')).join('\n') + '\n');
await live(['cap', 'mem']);
await fs.writeFile(path.join(bin, 'tmux'), ['#!/bin/sh', 'case "$*" in', `  *list-sessions*ronin-key*) cat '${rows}';;`, '  *) exit 1;;', 'esac', ''].join('\n'), { mode: 0o755 });
process.env.PATH = `${bin}:${process.env.PATH ?? ''}`;

const items = await import('../src/work-items.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { seedTegami } = await import('../src/tegami.js');
const { listQueuedMessages, dismissMessages } = await import('../src/message-queue.js');
const { sockets } = await import('../src/sockets.js');
const { registerWorkItems } = await import('../src/routes/work-items-api.js');

await createTeamRoster('crew', { objective: 'hold things' });
await seedTegami('mem', { repo: '', branch: '' }, [{ team: 'crew', team_role: 'member', objective: '' }]);
const team = { kind: 'team', name: 'crew' } as const;
const mem = { kind: 'agent', name: 'mem' } as const;
const holding = async (id: string) => (await items.holdersOf(id)).map(items.holderLabel).sort();
const quiet = async () => dismissMessages((await listQueuedMessages()).map((message) => message.id));
const said = async () => (await listQueuedMessages()).map((message) => [message.target, message.text]);

const app = express();
app.use(express.json());
registerWorkItems(app);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());
const call = async (method: string, at: string, body?: unknown) => {
  const res = await fetch(`${base}${at}`, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, data: await res.json() as Record<string, any> };
};

const epic = (await items.createItem({ title: 'the epic', kind: 'Epic', holder: team }, 'boss')).item;

test('every id an item has had finds it: read, an act, --parent and the search by parent', async () => {
  const { item } = await items.createItem({ title: 'to be keyed', parent: epic.id, holder: mem }, 'boss');
  await items.renameItem(item.id, 'KAN-901', 'jira:Ronin');
  assert.equal((await call('GET', `/api/work-items/${item.id}`)).data.item.id, 'KAN-901');
  assert.equal((await call('POST', `/api/work-items/${item.id}/flag`, { by: 'boss' })).data.item.id, 'KAN-901');
  const child = await call('POST', '/api/work-items', { title: 'under the w id', parent: item.id, by: 'boss' });
  assert.equal(child.data.item.parent, 'KAN-901');
  assert.equal(child.data.acknowledgement.split('\n')[0], `created ${child.data.item.id} under KAN-901`, 'create says so on line 1');
  const found = await call('GET', `/api/work-items?parent=${item.id}`);
  assert.deepEqual(found.data.items.map((one: { id: string }) => one.id), [child.data.item.id]);
  await items.watchItem(item.id, mem, true);
  assert.ok((await items.watchedIds()).has('KAN-901'), 'a watch by the old id stores the id it goes by');
});

test('several ids in one act: each answered on its own line, a bad one named', async () => {
  const a = (await items.createItem({ title: 'many a', parent: epic.id }, 'boss')).item;
  const b = (await items.createItem({ title: 'many b', parent: epic.id }, 'boss')).item;
  const done = await call('POST', '/api/work-items/many/transition', { ids: [a.id, b.id, 'w99999'], status: 'In Progress', by: 'boss' });
  assert.equal(done.status, 200);
  assert.deepEqual(done.data.answers.map((one: { ok: boolean }) => one.ok), [true, true, false]);
  assert.equal(done.data.acknowledgement.split('\n')[2], 'w99999: No work item w99999.');
  assert.deepEqual([(await items.readItem(a.id))!.status, (await items.readItem(b.id))!.status], ['In Progress', 'In Progress']);
  const none = await call('POST', '/api/work-items/many/handoff', { ids: ['w99998'], none: true, by: 'boss' });
  assert.equal(none.status, 409, 'every id failing is the error path');
  assert.equal((await call('POST', '/api/work-items/many/comment', { ids: [a.id], by: 'boss' })).status, 400, 'comment takes one id');
});

test('search --text matches every word in the title or objective, any case', async () => {
  const hit = (await items.createItem({ title: 'Login page', objective: 'Done looks like: the Button works', parent: epic.id }, 'boss')).item;
  await items.createItem({ title: 'Login API', parent: epic.id }, 'boss');
  const found = await call('GET', `/api/work-items?text=${encodeURIComponent('login button')}`);
  assert.deepEqual(found.data.items.map((one: { id: string }) => one.id), [hit.id]);
});

test('a desk hand-in gives the item to the Team, records who, and the item tells nobody', async () => {
  const { item } = await items.createItem({ title: 'desk work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  const done = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r1' });
  assert.equal(done.item.status, 'In Review');
  assert.equal(done.item.handed_in?.by, 'mem');
  assert.deepEqual(await holding(item.id), ['team:crew']);
  assert.deepEqual((await said()).filter(([, text]) => text.includes(item.id)), [], 'the desk\'s own message is the one notice');
  const again = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r2' });
  assert.equal(again.line.note, 'hand-in r2; no change');
});

test('a move to In Review by its holder is a checkout hand-in: the Team takes it and its lead is told once', async () => {
  const { item } = await items.createItem({ title: 'checkout work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  await items.editItem(item.id, { status: 'In Review' }, 'mem');
  assert.deepEqual(await holding(item.id), ['team:crew']);
  const told = (await said()).filter(([, text]) => text.includes(item.id));
  assert.deepEqual(told.map(([to]) => to), ['cap']);
  assert.match(told[0]![1]!, /handed in by mem/);
});

test('Send back: In Progress with the comment, back to the Agent that handed it in, which is told', async () => {
  const { item } = await items.createItem({ title: 'sent back', parent: epic.id, holder: mem }, 'boss');
  await items.handInItem(item.id, 'mem', { desk: true });
  await quiet();
  const back = await call('POST', `/api/work-items/${item.id}/send-back`, { text: 'the tests fail', by: 'owner' });
  assert.equal(back.status, 200);
  assert.equal(back.data.item.status, 'In Progress');
  assert.equal(back.data.item.comments.at(-1).text, 'the tests fail');
  assert.deepEqual(await holding(item.id), ['agent:mem']);
  assert.deepEqual((await said()).filter(([, text]) => text.includes(item.id)).map(([to]) => to), ['mem']);
});

test('Send back to an Agent that has ended leaves the item with the Team', async () => {
  const { item } = await items.createItem({ title: 'orphaned hand-in', parent: epic.id, holder: mem }, 'boss');
  await items.handInItem(item.id, 'mem', { desk: true });
  await live(['cap']);
  try {
    await quiet();
    await items.sendBack(item.id, 'redo', 'owner');
    assert.deepEqual(await holding(item.id), ['team:crew']);
    assert.equal((await items.readItem(item.id))!.status, 'In Progress');
    assert.deepEqual(await said(), [], 'the lead sees it on Epics');
  } finally { await live(['cap', 'mem']); }
});

test('session_end\'s list: what the Agent holds To Do or In Progress, not In Review or Done', async () => {
  await seedTegami('ender');
  const ender = { kind: 'agent', name: 'ender' } as const;
  const todo = (await items.createItem({ title: 'todo', parent: epic.id, holder: ender }, 'boss')).item;
  const doing = (await items.createItem({ title: 'doing', parent: epic.id, holder: ender, status: 'In Progress' }, 'boss')).item;
  await items.createItem({ title: 'review', parent: epic.id, holder: ender, status: 'In Review' }, 'boss');
  await items.createItem({ title: 'done', parent: epic.id, holder: ender, status: 'Done' }, 'boss');
  assert.deepEqual((await items.unfinishedHolds('ender')).map((item) => item.id), [todo.id, doing.id]);
});

test('a crash: a record holding items whose session is gone is released on the second sweep, silently', async () => {
  await seedTegami('crashed');
  const { item } = await items.createItem({ title: 'crashed work', parent: epic.id, holder: { kind: 'agent', name: 'crashed' } }, 'boss');
  await quiet();
  assert.deepEqual(await items.releaseEndedHolders(), [], 'one miss is not an end');
  assert.deepEqual(await holding(item.id), ['agent:crashed']);
  assert.ok((await items.releaseEndedHolders()).includes('crashed'));
  assert.deepEqual(await holding(item.id), []);
  assert.equal((await items.readItem(item.id))!.parent, epic.id);
  assert.deepEqual(await said(), []);
});

test('on a Jira-connected campaign the shapes Jira refuses are refused, with the reason', async () => {
  items.setSpaceNames('jc', items.JIRA_NAMES);
  try {
    const jepic = (await items.createItem({ title: 'j epic', kind: 'Epic', campaign_id: 'jc' }, 'boss')).item;
    const task = (await items.createItem({ title: 'j task', parent: jepic.id, campaign_id: 'jc' }, 'boss')).item;
    await assert.rejects(items.createItem({ title: 'sub', kind: 'Subtask', parent: jepic.id, campaign_id: 'jc' }, 'boss'), /a Subtask goes only under a Task, Story, Bug or Feature/);
    await assert.rejects(items.createItem({ title: 'task in task', kind: 'Task', parent: task.id, campaign_id: 'jc' }, 'boss'), /goes only under an epic or nothing/);
    await assert.rejects(items.createItem({ title: 'epic in epic', kind: 'Epic', parent: jepic.id, campaign_id: 'jc' }, 'boss'), /an epic goes under nothing/);
    const sub = (await items.createItem({ title: 'fine sub', parent: task.id, campaign_id: 'jc' }, 'boss')).item;
    assert.equal(sub.kind, 'Subtask');
    await assert.rejects(items.editItem(sub.id, { parent: jepic.id, kind: 'Subtask' }, 'boss'), /a Subtask goes only under/);
    await assert.rejects(items.editItem(sub.id, { parent: null }, 'boss'), /a Subtask goes only under/, 'no parent leaves the level: refused');
    const pairedSub = (await items.createItem({ title: 'paired sub', parent: task.id, campaign_id: 'jc', jira: { id: '2', key: 'JC-2' } }, 'jira:x')).item;
    await assert.rejects(items.editItem(pairedSub.id, { parent: jepic.id }, 'boss'), /cannot change a work item's kind across levels/, 'the live failure: a Jira Subtask made a Task under an epic');
    const paired = (await items.createItem({ title: 'paired', parent: jepic.id, campaign_id: 'jc', jira: { id: '1', key: 'JC-1' } }, 'jira:x')).item;
    await assert.rejects(items.editItem(paired.id, { kind: 'Subtask' }, 'boss'), /cannot change a work item's kind across levels/);
    assert.equal((await items.editItem(paired.id, { kind: 'Story' }, 'boss')).item.kind, 'Story', 'a kind at the same level is fine');
    assert.equal((await items.editItem(paired.id, { kind: 'Subtask', parent: task.id }, 'jira:x')).item.kind, 'Subtask', 'Jira\'s own change is Jira\'s shape');
  } finally { items.setSpaceNames('jc', null); }
  const loose = (await items.createItem({ title: 'unconnected', kind: 'Subtask', parent: epic.id }, 'boss')).item;
  assert.equal(loose.kind, 'Subtask', 'an unconnected campaign is not checked');
});

test('delete: an item from Jira needs --in-jira; every delete emits one event per item, the named one first', async () => {
  const events: Array<[string, string, string | undefined, string | undefined, string]> = [];
  sockets.onItemChanged(({ item, line }) => { if (line.op === 'delete') events.push([item.id, line.by, line.to, line.from, item.external.jira?.key ?? '']); });
  const fromJira = (await items.createItem({ title: 'from Jira', parent: epic.id, jira: { id: '77', key: 'KAN-977' } }, 'jira:alice')).item;
  const sub = (await items.createItem({ title: 'its sub', parent: fromJira.id }, 'boss')).item;
  const refused = await call('DELETE', `/api/work-items/${fromJira.id}`, { by: 'mem' });
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, /came from Jira \(made by jira:alice\).*--in-jira/);
  assert.ok(await items.readItem(fromJira.id), 'nothing is deleted');
  assert.deepEqual(events, [], 'a refused delete emits nothing');
  const done = await call('DELETE', `/api/work-items/${fromJira.id}`, { by: 'mem', in_jira: true });
  assert.deepEqual(done.data.deleted, [fromJira.id, sub.id]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [[fromJira.id, 'mem', 'in-jira', undefined, 'KAN-977'], [sub.id, 'mem', 'in-jira', fromJira.id, '']]);
  const mine = (await items.createItem({ title: 'made here', parent: epic.id }, 'boss')).item;
  const other = (await items.createItem({ title: 'made here too', parent: epic.id }, 'boss')).item;
  const many = await call('POST', '/api/work-items/many/delete', { ids: [mine.id, other.id], by: 'mem' });
  assert.equal(many.data.ok, true, 'an item made in Ronin needs no flag');
  assert.equal(await items.readItem(mine.id), null);
});
