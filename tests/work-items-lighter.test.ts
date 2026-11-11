/**
 * WORK ITEMS, LIGHTER (docs/using-ronin/project-management.md and docs/using-ronin/work-items.md; KAN-239 piece A): every id an item
 * has had finds it; several ids per act; create's first line; search --text; a hand-in gives
 * the item to the Team and records who; Send back returns it to that Agent, or leaves it with
 * the Team when the Agent has ended; session_end's list of unfinished holds; an ending or a
 * crash puts items on their epic, held by nobody, silently; on a Jira-connected campaign the
 * shapes Jira refuses are refused; a delete needs no flag, and every delete emits the agreed
 * event.
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
  const none = await call('POST', '/api/work-items/many/handoff', { ids: ['w99998'], session: 'mem', by: 'boss' });
  assert.equal(none.status, 409, 'every id failing is the error path');
  assert.equal((await call('POST', '/api/work-items/many/comment', { ids: [a.id], by: 'boss' })).status, 400, 'comment takes one id');
});

test('search --text matches every word in the title or objective, any case', async () => {
  const hit = (await items.createItem({ title: 'Login page', objective: 'Done looks like: the Button works', parent: epic.id }, 'boss')).item;
  await items.createItem({ title: 'Login API', parent: epic.id }, 'boss');
  const found = await call('GET', `/api/work-items?text=${encodeURIComponent('login button')}`);
  assert.deepEqual(found.data.items.map((one: { id: string }) => one.id), [hit.id]);
});

test('a desk hand-in keeps the Agent\'s hold, records who, and the item tells nobody', async () => {
  const { item } = await items.createItem({ title: 'desk work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  const done = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r1', receipts: ['r1'] });
  assert.equal(done.item.status, 'In Review');
  assert.equal(done.item.handed_in?.by, 'mem');
  assert.deepEqual(await holding(item.id), ['agent:mem'], 'handing in code does not hand in the item');
  assert.deepEqual((await said()).filter(([, text]) => text.includes(item.id)), [], 'the desk\'s own message is the one notice');
  const again = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r2', receipts: ['r2'] });
  assert.equal(again.line.note, 'hand-in r2; handed in again');
  assert.deepEqual(again.item.hand_ins!.map((one) => [one.receipt, one.by]), [['r1', 'mem'], ['r2', 'mem']], 'every hand-in is recorded, the status moved or not');
});

test('a move to In Review by its holder is a checkout hand-in: the Agent keeps it and its lead is told once', async () => {
  const { item } = await items.createItem({ title: 'checkout work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  await items.editItem(item.id, { status: 'In Review' }, 'mem');
  assert.deepEqual(await holding(item.id), ['agent:mem']);
  const told = (await said()).filter(([, text]) => text.includes(item.id));
  assert.deepEqual(told.map(([to]) => to), ['cap']);
  assert.equal(told[0]![1]!, `${item.id} 'checkout work' was handed in by mem; review and promote it.`);
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

test('Send back with nobody holding it (its Agent ended) leaves it where its ending put it; an old Team-held item still goes back', async () => {
  const { item } = await items.createItem({ title: 'orphaned hand-in', parent: epic.id, status: 'In Review' }, 'boss');
  await quiet();
  await items.sendBack(item.id, 'redo', 'owner');
  assert.deepEqual(await holding(item.id), []);
  assert.equal((await items.readItem(item.id))!.status, 'In Progress');
  assert.deepEqual(await said(), [], 'nobody holds it: nobody is told');
  const old = (await items.createItem({ title: 'team-held review', parent: epic.id, status: 'In Review', holder: team }, 'boss')).item;
  await items.sendBack(old.id, 'redo too', 'owner');
  assert.deepEqual(await holding(old.id), ['team:crew'], 'an existing Team-held item stays on the Team');
  assert.equal((await items.readItem(old.id))!.status, 'In Progress');
  assert.equal((await items.editItem(old.id, { status: 'Done' }, 'owner')).item.status, 'Done', 'and Accept still works');
});

/* AN ENDING HANDS OVER, NEVER DROPS (ITEM_HANDOVER; docs/using-ronin/project-management.md, How an item lives). */
test('session_end: To Do settles to the Team; In Progress and In Review are named for a handover; Done is left alone', async () => {
  await seedTegami('ender', { repo: '', branch: '' }, [{ team: 'crew', team_role: 'member', objective: '' }]);
  const ender = { kind: 'agent', name: 'ender' } as const;
  const todo = (await items.createItem({ title: 'todo', parent: epic.id, holder: ender }, 'boss')).item;
  const doing = (await items.createItem({ title: 'doing', parent: epic.id, holder: ender, status: 'In Progress' }, 'boss')).item;
  const review = (await items.createItem({ title: 'review', parent: epic.id, holder: ender, status: 'In Review' }, 'boss')).item;
  const done = (await items.createItem({ title: 'done', parent: epic.id, holder: ender, status: 'Done' }, 'boss')).item;
  assert.deepEqual((await items.unfinishedHolds('ender')).map((item) => item.id), [todo.id, doing.id, review.id], 'In Review stops session_end too');
  await quiet();
  const settled = await items.settleToDo('ender');
  assert.deepEqual(settled.map(({ item, line }) => [item.id, line.op, line.to]), [[todo.id, 'handoff', 'team:crew']]);
  assert.deepEqual(await holding(todo.id), ['team:crew'], 'To Do goes back to the Team, for its lead');
  assert.equal((await items.readItem(todo.id))!.status, 'To Do');
  const named = await items.unfinishedHolds('ender');
  assert.deepEqual(named.map((item) => [item.id, item.status, item.team]), [[doing.id, 'In Progress', 'crew'], [review.id, 'In Review', 'crew']], 'each named with its status and the Team NEXT names');
  // The handover, several ids with one note: the note a Handover comment, the holder moved, the status kept.
  const over = await call('POST', '/api/work-items/many/handover', { ids: [doing.id, review.id], team: 'crew', note: 'the store is done; the CSS is next', by: 'ender' });
  assert.equal(over.status, 200, JSON.stringify(over.data));
  for (const [id, status] of [[doing.id, 'In Progress'], [review.id, 'In Review']] as const) {
    const item = (await items.readItem(id))!;
    assert.equal(item.status, status, 'the status stays as it is');
    assert.equal(item.comments.at(-1)!.text, 'Handover from ender: the store is done; the CSS is next');
    assert.deepEqual(await holding(id), ['team:crew']);
  }
  assert.deepEqual(await items.unfinishedHolds('ender'), [], 'nothing left: session_end goes ahead');
  assert.deepEqual(await holding(done.id), ['agent:ender'], 'Done is untouched');
  assert.equal((await items.readItem(done.id))!.status, 'Done');
  assert.deepEqual(await said(), [], 'a handover without a flag tells nobody: the board shows it');
});

test('a handover: --to-do puts it back in the same line; --flag asks the lead, told once; a handover with neither note nor flag is refused', async () => {
  const back = (await items.createItem({ title: 'not finishing', parent: epic.id, holder: mem, status: 'In Progress' }, 'boss')).item;
  await quiet();
  const one = await call('POST', `/api/work-items/${back.id}/handover`, { team: 'crew', note: 'not started on the UI', to_do: true, by: 'mem' });
  assert.equal(one.status, 200);
  assert.equal(one.data.item.status, 'To Do');
  assert.equal(one.data.line.op, 'handoff');
  assert.match(one.data.line.note, /In Progress → To Do/);
  const stuck = (await items.createItem({ title: 'cannot decide', parent: epic.id, holder: mem, status: 'In Review' }, 'boss')).item;
  const asked = await call('POST', `/api/work-items/${stuck.id}/handover`, { team: 'crew', flag: 'Waiting on cap: keep or delete?', by: 'mem' });
  assert.equal(asked.status, 200);
  assert.equal(asked.data.item.flagged, true);
  assert.deepEqual(await holding(stuck.id), ['team:crew']);
  const told = (await said()).filter(([, text]) => text.includes(stuck.id));
  assert.deepEqual(told.map(([to]) => to), ['cap'], 'the lead is told, once');
  assert.match(told[0]![1]!, /needs help: Waiting on cap: keep or delete\?/);
  const blank = await call('POST', `/api/work-items/${back.id}/handover`, { team: 'crew', by: 'mem' });
  assert.equal(blank.status, 400);
  assert.match(blank.data.error, /where .* stands and what is next/);
});

test('a crash: on the second sweep each item goes by its status, never to nobody; the unfinished flagged, the lead told once', async () => {
  await seedTegami('crashed', { repo: '', branch: '' }, [{ team: 'crew', team_role: 'member', objective: '' }]);
  const crashed = { kind: 'agent', name: 'crashed' } as const;
  const todo = (await items.createItem({ title: 'crash todo', parent: epic.id, holder: crashed }, 'boss')).item;
  const doing = (await items.createItem({ title: 'crash doing', parent: epic.id, holder: crashed, status: 'In Progress' }, 'boss')).item;
  const review = (await items.createItem({ title: 'crash review', parent: epic.id, holder: crashed, status: 'In Review' }, 'boss')).item;
  const done = (await items.createItem({ title: 'crash done', parent: epic.id, holder: crashed, status: 'Done' }, 'boss')).item;
  await quiet();
  assert.deepEqual(await items.releaseEndedHolders(), [], 'one miss is not an end');
  assert.deepEqual(await holding(doing.id), ['agent:crashed']);
  assert.ok((await items.releaseEndedHolders()).includes('crashed'));
  for (const id of [todo.id, doing.id, review.id]) assert.deepEqual(await holding(id), ['team:crew'], `${id} is on the Team`);
  assert.deepEqual(await holding(done.id), [], 'Done is off every list');
  assert.equal((await items.readItem(todo.id))!.flagged, false, 'To Do goes back as it is');
  for (const [id, status] of [[doing.id, 'In Progress'], [review.id, 'In Review']] as const) {
    const item = (await items.readItem(id))!;
    assert.equal(item.flagged, true);
    assert.equal(item.status, status);
    assert.equal(item.comments.at(-1)!.text, `Ended without handover: crashed, ${status}`);
  }
  const told = await said();
  assert.deepEqual(told.map(([to]) => to), ['cap'], 'one notice, to the lead');
  assert.match(told[0]![1]!, new RegExp(`crashed ended without a handover .*${doing.id}.*${review.id}`));
  assert.ok(!told[0]![1]!.includes(todo.id), 'To Do needs no decision');
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

test('delete: an item from Jira goes with no flag; every delete emits one event per item, the named one first', async () => {
  const events: Array<[string, string, string | undefined, string | undefined, string]> = [];
  sockets.onItemChanged(({ item, line }) => { if (line.op === 'delete') events.push([item.id, line.by, line.to, line.from, item.external.jira?.key ?? '']); });
  const fromJira = (await items.createItem({ title: 'from Jira', parent: epic.id, jira: { id: '77', key: 'KAN-977' } }, 'jira:alice')).item;
  const sub = (await items.createItem({ title: 'its sub', parent: fromJira.id }, 'boss')).item;
  const done = await call('DELETE', `/api/work-items/${fromJira.id}`, { by: 'mem' });
  assert.deepEqual(done.data.deleted, [fromJira.id, sub.id]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [[fromJira.id, 'mem', undefined, undefined, 'KAN-977'], [sub.id, 'mem', undefined, fromJira.id, '']]);
  const mine = (await items.createItem({ title: 'made here', parent: epic.id }, 'boss')).item;
  const other = (await items.createItem({ title: 'made here too', parent: epic.id }, 'boss')).item;
  const many = await call('POST', '/api/work-items/many/delete', { ids: [mine.id, other.id], by: 'mem' });
  assert.equal(many.data.ok, true);
  assert.equal(await items.readItem(mine.id), null);
});

/* NOTICES (section 4; KAN-239 piece B): the six, nothing else, none twice, one per command. */

test('a call for help goes to the lead of the Team above; a flag cleared tells nobody', async () => {
  const { item } = await items.createItem({ title: 'stuck work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  await call('POST', `/api/work-items/${item.id}/flag`, { comment: 'Waiting on cap: which API', by: 'mem' });
  assert.deepEqual(await said(), [['cap', `${item.id} 'stuck work' needs help: Waiting on cap: which API (flagged by mem).`]]);
  await quiet();
  await call('POST', `/api/work-items/${item.id}/unflag`, { by: 'mem' });
  assert.deepEqual(await said(), []);
});

test('a call for help under an epic an Agent holds goes to that Agent (an epic_lead)', async () => {
  await seedTegami('elead');
  const own = (await items.createItem({ title: 'led epic', kind: 'Epic', holder: { kind: 'agent', name: 'elead' } }, 'boss')).item;
  const { item } = await items.createItem({ title: 'under the epic_lead', parent: own.id, holder: mem }, 'boss');
  await quiet();
  await items.flagItem(item.id, true, 'Waiting on elead: scope', 'mem');
  assert.deepEqual((await said()).map(([to]) => to), ['elead']);
});

test('a status change reaches a watcher of that item only; not its holder, not the Team of its member', async () => {
  await seedTegami('eye');
  await seedTegami('far');
  const { item } = await items.createItem({ title: 'watched work', parent: epic.id, holder: mem }, 'boss');
  await items.watchItem(item.id, { kind: 'agent', name: 'eye' }, true);
  await items.watchItem(epic.id, { kind: 'agent', name: 'far' }, true);
  await quiet();
  await call('POST', `/api/work-items/${item.id}/transition`, { status: 'In Progress', by: 'boss' });
  assert.deepEqual(await said(), [['eye', `${item.id}: status To Do → In Progress by boss.`]]);
  await items.watchItem(epic.id, { kind: 'agent', name: 'far' }, false);
});

test('a comment by someone else reaches the Agent working the item, and nobody else', async () => {
  const { item } = await items.createItem({ title: 'commented work', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  await call('POST', `/api/work-items/${item.id}/comment`, { text: 'try the other port', by: 'cap' });
  assert.deepEqual(await said(), [['mem', `${item.id}: a comment from cap: try the other port`]]);
  await quiet();
  await call('POST', `/api/work-items/${item.id}/comment`, { text: 'done that', by: 'mem' });
  assert.deepEqual(await said(), [], 'nobody hears their own change');
});

test('nothing else is a notice: create, handoff, edit, attach, link, rename, delete', async () => {
  await quiet();
  const made = await call('POST', '/api/work-items', { title: 'quiet one', parent: epic.id, team: 'crew', by: 'boss' });
  const id = made.data.item.id as string;
  const other = (await items.createItem({ title: 'quiet two', parent: epic.id }, 'boss')).item;
  await call('POST', `/api/work-items/${id}/handoff`, { session: 'mem', by: 'boss' });
  await call('POST', `/api/work-items/${id}/handoff`, { session: 'cap', from: 'mem', by: 'boss' });
  await call('PUT', `/api/work-items/${id}`, { title: 'quiet one, renamed', by: 'boss' });
  await call('POST', `/api/work-items/${id}/attach`, { path: 'https://example.com/a.md', by: 'boss' });
  await call('POST', `/api/work-items/${id}/link`, { type: 'Blocks', to: other.id, by: 'boss' });
  await items.renameItem(id, 'KAN-902', 'jira:Ronin');
  await call('DELETE', `/api/work-items/${other.id}`, { by: 'boss' });
  assert.deepEqual(await said(), []);
});

test('one notice per person per command: several items, or one reached twice, is one message', async () => {
  await seedTegami('both');
  const both = { kind: 'agent', name: 'both' } as const;
  const a = (await items.createItem({ title: 'pair a', parent: epic.id, holder: both }, 'boss')).item;
  const b = (await items.createItem({ title: 'pair b', parent: epic.id }, 'boss')).item;
  await items.watchItem(a.id, both, true);
  await items.watchItem(b.id, both, true);
  await quiet();
  await call('POST', '/api/work-items/many/transition', { ids: [a.id, b.id], status: 'In Progress', by: 'boss' });
  assert.deepEqual(await said(), [['both', `${a.id}: status To Do → In Progress by boss.\n${b.id}: status To Do → In Progress by boss.`]]);
});

/* THE THREE SIGNALS (section 6a; KAN-239 piece E). */

test('the promotion signal: on dev is not a status, a paired item too, and it tells nobody', async () => {
  const { item } = await items.createItem({ title: 'promoted work', parent: epic.id, holder: mem }, 'boss');
  await items.handInItem(item.id, 'mem', { desk: true, receipts: ['hi_a'] });
  await quiet();
  const marked = await call('POST', `/api/work-items/${item.id}/on-dev`, { promotion: 'promo_a', by: 'cap' });
  assert.equal(marked.status, 200);
  assert.deepEqual([marked.data.item.status, marked.data.item.on_dev.promotion], ['In Review', 'promo_a']);
  assert.deepEqual(await said(), []);
  const paired = (await items.createItem({ title: 'paired promoted', parent: epic.id, jira: { id: '88', key: 'KAN-988' } }, 'jira:x')).item;
  assert.equal((await items.markOnDev(paired.id, 'promo_a', 'cap')).item.on_dev?.promotion, 'promo_a');
  assert.equal((await call('POST', `/api/work-items/${item.id}/on-dev`, { by: 'cap' })).status, 400, 'the promotion is named');
});

test('a hand-in is with the lead until on dev after the last hand-in; a checkout hand-in is ready at once', async () => {
  const desk = (await items.createItem({ title: 'desk signal', parent: epic.id, holder: mem }, 'boss')).item;
  const checkout = (await items.createItem({ title: 'checkout signal', parent: epic.id, holder: mem }, 'boss')).item;
  await items.handInItem(desk.id, 'mem', { desk: true, receipts: ['hi_1'] });
  await items.editItem(checkout.id, { status: 'In Review' }, 'mem');
  const stage = async (id: string) => items.handInStage((await items.readItem(id))!);
  assert.equal(await stage(desk.id), 'lead', 'handed in, not on dev');
  assert.equal(await stage(checkout.id), 'ready', 'a checkout has no code to promote');
  await items.markOnDev(desk.id, 'promo_1', 'cap');
  assert.equal(await stage(desk.id), 'ready', 'on dev after the last hand-in');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await items.handInItem(desk.id, 'mem', { desk: true, receipts: ['hi_2'] });
  assert.equal(await stage(desk.id), 'lead', 'a new hand-in waits for its own promotion');
});

test('project management is read from the Agent\'s behaviours; a hand-in never needs an item under it (w415)', async () => {
  const { projectManagementOn } = await import('../src/agent-composition.js');
  const { sessionDir } = await import('../src/session-dir.js');
  for (const [name, books] of [['pm_on', ['base-agent', 'project-management']], ['pm_off', ['base-agent']]] as const) {
    const dir = sessionDir(name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'birth-receipt.json'), JSON.stringify({ behaviours: books.map((book) => ({ book, file: `/x/${book}.md` })) }));
  }
  assert.equal(await projectManagementOn('pm_on'), true);
  assert.equal(await projectManagementOn('pm_off'), false);
  assert.equal(await projectManagementOn('pm_nobody'), false, 'no record: not under it');
  const desk = await fs.readFile(new URL('../src/commands/desk.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(desk, /under project management a hand-in names its work item/);
  assert.match(desk, /consider your work items/);
});

test('an item In Review with no hand-ins recorded (handed in before the signals) is ready to accept, not with the lead', async () => {
  assert.equal(items.handInStage({}), 'ready', 'no hand_ins at all');
  assert.equal(items.handInStage({ hand_ins: [] }), 'ready', 'an empty list too');
  assert.equal(items.handInStage({ hand_ins: [{ receipt: 'hi_1', by: 'mem', at: '2026-11-04T10:00:00Z' }] }), 'lead', 'a desk hand-in, not on dev');
  assert.equal(items.handInStage({ hand_ins: [{ receipt: 'hi_1', by: 'mem', at: '2026-11-04T10:00:00Z' }], on_dev: { promotion: 'p', at: '2026-11-04T09:00:00Z' } }), 'lead', 'on dev before the last hand-in');
});

/* THE HAND-IN NOTE: one short comment for the user, headed Handed in (ITEM_HANDOVER). */
test('a hand-in carries a note for the user: the Handed in comment, at most 280 characters', async () => {
  const { item } = await items.createItem({ title: 'noted work', objective: 'A lead sees the note first.', parent: epic.id, holder: mem }, 'boss');
  await items.addComment(item.id, 'decided with the lead: no receipts in the note', 'cap');
  const long = await call('POST', `/api/work-items/${item.id}/transition`, { status: 'In Review', note: 'x'.repeat(281), by: 'mem' });
  assert.equal(long.status, 409);
  assert.match(long.data.error, /^Keep it for the user: what they can try\. The detail is in the diff\./);
  assert.equal((await items.readItem(item.id))!.status, 'To Do', 'refused: nothing moved');
  const ok = await call('POST', `/api/work-items/${item.id}/transition`, { status: 'In Review', note: 'Open the item; the note reads first.', by: 'mem' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.item.comments.at(-1).text, 'Handed in: Open the item; the note reads first.');
  assert.equal(items.handedInNote(ok.data.item), 'Open the item; the note reads first.');
  // A desk's hand-in carries it the same way.
  const desk = (await items.createItem({ title: 'desk noted', parent: epic.id, holder: mem }, 'boss')).item;
  const handed = await items.handInItem(desk.id, 'mem', { desk: true, note: 'hand-in r9', receipts: ['r9'], forUser: 'Try the tile.' });
  assert.equal(handed.item.comments.at(-1)!.text, 'Handed in: Try the tile.');
  assert.equal(handed.line.note, 'hand-in r9; handed in by mem', 'the receipt stays on the trail, not in the note');
  await assert.rejects(items.handInItem(desk.id, 'mem', { desk: true, forUser: 'y'.repeat(281) }), /Keep it for the user/);
  assert.equal(items.handInNoteProblem('z'.repeat(280)), null);
});

test('under project management a move to In Review without a note is refused, NEXT showing --note; with one it goes', async () => {
  const { sessionDir } = await import('../src/session-dir.js');
  const dir = sessionDir('pmer');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'birth-receipt.json'), JSON.stringify({ behaviours: [{ book: 'project-management', file: '/x/project-management.md' }] }));
  await seedTegami('pmer', { repo: '', branch: '' }, [{ team: 'crew', team_role: 'member', objective: '' }]);
  await live(['cap', 'mem', 'pmer']);
  try {
    const { item } = await items.createItem({ title: 'pm checkout', parent: epic.id, holder: { kind: 'agent', name: 'pmer' } }, 'boss');
    const bare = await call('POST', `/api/work-items/${item.id}/transition`, { status: 'In Review', by: 'pmer' });
    assert.equal(bare.status, 409);
    assert.match(bare.data.error, new RegExp(`NEXT: item transition ${item.id} "In Review" --note "<what they can try>"`));
    const noted = await call('POST', `/api/work-items/${item.id}/transition`, { status: 'In Review', note: 'Try it.', by: 'pmer' });
    assert.equal(noted.status, 200);
    assert.equal(noted.data.item.status, 'In Review');
  } finally { await live(['cap', 'mem']); }
  const desk = await fs.readFile(new URL('../src/commands/desk.ts', import.meta.url), 'utf8');
  assert.match(desk, /if \(projectId && !forUser && await projectManagementOn\(session\)\)/, 'a desk hand-in under project management needs --note too');
  assert.match(desk, /const long = handInNoteProblem\(forUser\);\n\s+if \(long\) die/, 'a long note is refused before any code is handed in');
});

test('session_end\'s refusal: To Do settled first, each item named with status and title, NEXT the handover, never a drop', async () => {
  const route = await fs.readFile(new URL('../src/routes/sessions-api.ts', import.meta.url), 'utf8');
  const harakiri = route.slice(route.indexOf("app.post('/api/harakiri'"), route.indexOf("app.get('/api/sessions/:name/project-root'"));
  assert.ok(harakiri.indexOf('await settleToDo(name)') < harakiri.indexOf('await unfinishedHolds(name)'));
  assert.match(harakiri, /you hold \$\{item\.id\} \(\$\{item\.status\}\) \$\{item\.title\}/);
  assert.match(harakiri, /item handover \$\{items\.map\(\(item\) => item\.id\)\.join\(' '\)\}/);
  assert.doesNotMatch(harakiri, /handoff .* none/, 'no way out that drops the item');
});

/* NOTICE 6 (w300): a move to Done tells the Agent that handed the item in, once. */
test('a move to Done tells the Agent that handed it in, once; not the Team\'s lead; an Agent that ended hears nothing', async () => {
  const { item } = await items.createItem({ title: 'to be accepted', parent: epic.id, holder: mem }, 'boss');
  await items.handInItem(item.id, 'mem', { desk: true, receipts: ['a1'] });
  await items.handInItem(item.id, 'mem', { desk: true, receipts: ['a2'] });
  await items.watchItem(item.id, mem, true);
  await quiet();
  const accept = await call('POST', `/api/work-items/${item.id}/transition`, { status: 'Done', by: 'owner' });
  assert.equal(accept.status, 200);
  assert.deepEqual(await said(), [['mem', `${item.id} 'to be accepted' is Done (accepted by owner).`]], 'once, though it handed in twice and watches it; cap is not told');
  assert.deepEqual(accept.data.notified, ['mem']);
  await items.watchItem(item.id, mem, false);
  // Handed in by an Agent that has since ended: nobody is told.
  const gone = (await items.createItem({ title: 'accepted after its end', parent: epic.id, holder: mem }, 'boss')).item;
  await items.handInItem(gone.id, 'mem', { desk: true, receipts: ['g1'] });
  await quiet();
  await live(['cap']);
  try {
    await items.editItem(gone.id, { status: 'Done' }, 'jira:someone');
    assert.deepEqual(await said(), []);
  } finally { await live(['cap', 'mem']); }
  // The Agent that moves it itself hears nothing.
  const own = (await items.createItem({ title: 'self done', parent: epic.id, holder: mem }, 'boss')).item;
  await items.handInItem(own.id, 'mem', { desk: true, receipts: ['s1'] });
  await quiet();
  await items.editItem(own.id, { status: 'Done' }, 'mem');
  assert.deepEqual(await said(), []);
});

test('notice 6 by Done\'s name: on a space that lists Done second, a move to In Review tells nobody it is Done', async () => {
  items.setSpaceNames('jorder6', { ...items.JIRA_NAMES, statuses: ['To Do', 'Done', 'In Progress', 'In Review'] });
  try {
    const { item } = await items.createItem({ title: 'ordered', holder: mem, campaign_id: 'jorder6' }, 'boss');
    await items.handInItem(item.id, 'mem', { desk: true, receipts: ['o1'] });
    await items.editItem(item.id, { status: 'In Progress' }, 'owner');
    await quiet();
    await items.editItem(item.id, { status: 'In Review' }, 'owner');
    assert.deepEqual(await said(), [], 'In Review is not Done');
    await items.editItem(item.id, { status: 'Done' }, 'owner');
    assert.deepEqual((await said()).map(([to]) => to), ['mem']);
  } finally { items.setSpaceNames('jorder6', null); }
});

/* HANDING IN CODE DOESN'T HAND IN THE ITEM (owner, 2026-11-05; KAN-269). */
test('a hand-in keeps the holder; Send back goes to the holder, who hears it; Done tells the holder once and it stays on its list', async () => {
  const { item } = await items.createItem({ title: 'kept work', parent: epic.id, holder: mem }, 'boss');
  await items.handInItem(item.id, 'mem', { desk: true, receipts: ['k1'], forUser: 'Try it.' });
  assert.deepEqual(await holding(item.id), ['agent:mem']);
  assert.equal((await items.readItem(item.id))!.status, 'In Review');
  await quiet();
  const back = await call('POST', `/api/work-items/${item.id}/send-back`, { text: 'one more thing', by: 'owner' });
  assert.equal(back.status, 200);
  assert.equal(back.data.item.status, 'In Progress');
  assert.deepEqual(await holding(item.id), ['agent:mem'], 'no holder moves');
  assert.deepEqual((await said()).map(([to, text]) => [to, text]), [['mem', `${item.id} 'kept work' was sent back to you by owner: one more thing. It is In Progress again.`]]);
  await items.handInItem(item.id, 'mem', { desk: true, receipts: ['k2'] });
  await quiet();
  await call('POST', `/api/work-items/${item.id}/transition`, { status: 'Done', by: 'owner' });
  assert.deepEqual(await said(), [['mem', `${item.id} 'kept work' is Done (accepted by owner).`]], 'the holder is told once');
  assert.deepEqual(await holding(item.id), ['agent:mem'], 'Done stays on its list until the archive');
});

