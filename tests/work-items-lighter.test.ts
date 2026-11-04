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
  const done = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r1', receipts: ['r1'] });
  assert.equal(done.item.status, 'In Review');
  assert.equal(done.item.handed_in?.by, 'mem');
  assert.deepEqual(await holding(item.id), ['team:crew']);
  assert.deepEqual((await said()).filter(([, text]) => text.includes(item.id)), [], 'the desk\'s own message is the one notice');
  const again = await items.handInItem(item.id, 'mem', { desk: true, note: 'hand-in r2', receipts: ['r2'] });
  assert.equal(again.line.note, 'hand-in r2; handed in again');
  assert.deepEqual(again.item.hand_ins!.map((one) => [one.receipt, one.by]), [['r1', 'mem'], ['r2', 'mem']], 'every hand-in is recorded, the status moved or not');
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

/* NOTICES (section 4; KAN-239 piece B): the five, nothing else, none twice, one per command. */

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

test('nothing else is a notice: create, assign, handoff, put back, edit, attach, link, rename, delete', async () => {
  await quiet();
  const made = await call('POST', '/api/work-items', { title: 'quiet one', parent: epic.id, team: 'crew', by: 'boss' });
  const id = made.data.item.id as string;
  const other = (await items.createItem({ title: 'quiet two', parent: epic.id }, 'boss')).item;
  await call('POST', `/api/work-items/${id}/assign`, { session: 'mem', by: 'boss' });
  await call('POST', `/api/work-items/${id}/handoff`, { session: 'cap', from: 'mem', by: 'boss' });
  await call('POST', `/api/work-items/${id}/handoff`, { none: true, from: 'cap', by: 'boss' });
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

test('a Ronin item put back tells nobody: only a Jira item goes to traffic_control', async () => {
  const { item } = await items.createItem({ title: 'put back', parent: epic.id, holder: mem }, 'boss');
  await quiet();
  const back = await call('POST', `/api/work-items/${item.id}/handoff`, { none: true, by: 'mem' });
  assert.equal(back.data.notified, undefined);
  assert.deepEqual(await said(), []);
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

test('Waiting on you splits: With the lead until on dev after the last hand-in; a checkout hand-in is ready at once', async () => {
  const { teamWork } = await import('../src/work-items-read.js');
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
  const all = await items.listItems();
  const held = all.filter((one) => [desk.id, checkout.id].includes(one.id)).map((one) => ({ ...one, holder: 'team:crew' }));
  const work = teamWork(held, all);
  assert.deepEqual([work.lead.map((one) => one.id), work.review.map((one) => one.id)], [[desk.id], [checkout.id]]);
});

test('a hand-in names its item under project management: the switch is read from the Agent\'s behaviours', async () => {
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
  assert.match(desk, /if \(!projectId && await projectManagementOn\(session\)\)/);
  assert.match(desk, /NEXT: worktree-desk hand-in \$\{positional\[0\] \?\? '<repo>'\}.*--item <id>/);
});

test('Waiting on you draws With the lead before Ready to accept, both with Accept and Send back', async () => {
  const ui = await fs.readFile(new URL('../public/js/team-waiting.js', import.meta.url), 'utf8');
  assert.match(ui, /if \(lead\.length\) groups\.append\(group\('lead', t\('team_waiting\.with_lead', 'With the lead'\), lead\)\);\n    if \(review\.length\)/);
  assert.match(ui, /if \(group === 'review' \|\| group === 'lead'\) \{/);
  const words = await fs.readFile(new URL('../ronin_catalogs/lexicons/professional_en.md', import.meta.url), 'utf8');
  assert.match(words, /- \*\*team_waiting\.with_lead:\*\* With the lead/);
});
