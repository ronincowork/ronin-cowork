/**
 * THE WORK ITEM STORE — one item, stored once, every change a trail line.
 * Checks against the Jira shape (docs/using-ronin/work-items.md): a write reads back; concurrent trail
 * appends all land; level defaults one below the parent; a move that would put anything
 * below -1 is refused ("can't go there"), children following; the one migration; the
 * routes answer with the item as it now is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-work-items-'));
// Every store under private roots, whoever runs this file: holder scans and arrival
// notices must never reach a live roster, letter or message queue.
const isolated = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-isolated-'));
process.env.RONIN_DATA_ROOT = path.join(isolated, 'data');
process.env.RONIN_USER_ROOT = path.join(isolated, 'user');
delete process.env.RONIN_SOCKET;
process.env.RONIN_WORK_ITEMS_DIR = temp;

const items = await import('../src/work-items.js');
const { registerWorkItems } = await import('../src/routes/work-items-api.js');

test('campaign is stored at creation; no parent is normal: level 0, kind Task, To Do, nothing made to hold it', async () => {
  const first = await items.createItem({ title: 'First', campaign_id: 'alpha' }, 'probe');
  assert.deepEqual([first.item.campaign_id, first.item.parent, first.item.level, first.item.kind, first.item.status, first.item.flagged], ['alpha', null, 0, 'Task', 'To Do', false]);
  assert.deepEqual((await items.listItems()).map((item) => item.id), [first.item.id], 'one create, one item');
});

test('an item can be born paired with its Jira item', async () => {
  const born = await items.createItem({ title: 'Fix login', campaign_id: 'alpha', jira: { id: '10007', key: 'PAY-7' } }, 'jira:Alice');
  assert.deepEqual(born.item.external.jira, { id: '10007', key: 'PAY-7' });
  assert.deepEqual((await items.readItem(born.item.id))!.external.jira, { id: '10007', key: 'PAY-7' });
  assert.equal(born.item.trail.length, 1, 'one write, one line');
});

test('level defaults one below the parent and adding a child never changes it', async () => {
  const epic = (await items.createItem({ title: 'Epic', kind: 'Epic' }, 'probe')).item;
  const story = (await items.createItem({ title: 'Story', parent: epic.id, kind: 'Story' }, 'probe')).item;
  const sub = (await items.createItem({ title: 'Sub', parent: story.id }, 'probe')).item;
  assert.deepEqual([epic.level, story.level, sub.level], [1, 0, -1]);
  assert.equal((await items.readItem(story.id))!.level, 0, 'a story with a subtask is still level 0');
  const leaf = (await items.createItem({ title: 'Leaf' }, 'probe')).item;
  await items.createItem({ title: 'Under the leaf', parent: leaf.id }, 'probe');
  assert.equal((await items.readItem(leaf.id))!.level, 0);
});

test('edit --parent is the move: the level follows, other fields ride the same line', async () => {
  const epic = (await items.createItem({ title: 'Epic', kind: 'Epic' }, 'probe')).item;
  const story = (await items.createItem({ title: 'Story' }, 'probe')).item;
  assert.equal(items.didLine(await items.editItem(story.id, { parent: epic.id }, 'probe')), `${story.id} moved under ${epic.id}, level 0`);
  const both = await items.editItem(story.id, { parent: null, title: 'Story, loose' }, 'probe');
  assert.equal(items.didLine(both), `${story.id} changed: parent none, title`);
  assert.deepEqual([both.item.parent, both.item.level], [null, 0]);
});

test('comment --edit changes comment n; attach and remove a document or a link; link by the link type\'s name', async () => {
  const { item } = await items.createItem({ title: 'Linked' }, 'probe');
  const other = (await items.createItem({ title: 'Held up' }, 'probe')).item;
  await items.addComment(item.id, 'first', 'ann');
  assert.equal(items.didLine(await items.editComment(item.id, 1, 'first, fixed', 'bo')), `${item.id} comment 1 was edited`);
  assert.equal((await items.readItem(item.id))!.comments[0]!.text, 'first, fixed');
  await assert.rejects(items.editComment(item.id, 2, 'x', 'bo'), /there is no comment 2/);
  const doc = path.join(temp, 'attached.md');
  await fs.writeFile(doc, '# doc\n');
  assert.equal(items.didLine(await items.attachDoc(item.id, doc, 'probe')), `${item.id} has ${doc} attached`);
  assert.equal(items.didLine(await items.attachDoc(item.id, doc, 'probe', true)), `${item.id} has ${doc} removed`);
  assert.deepEqual((await items.readItem(item.id))!.attachments, []);
  const link = 'https://pay.example.test/secure/attachment/1/receipt.pdf';
  assert.deepEqual((await items.attachDoc(item.id, link, 'probe')).item.attachments, [link], 'a file kept in Jira, by its link');
  assert.equal(items.didLine(await items.linkItem(item.id, 'Blocks', other.id, 'probe')), `${item.id} Blocks ${other.id}`);
  assert.equal(items.didLine(await items.linkItem(item.id, 'Relates', other.id, 'probe')), `${item.id} Relates ${other.id}`);
  assert.equal(items.didLine(await items.linkItem(item.id, 'Blocks', other.id, 'probe', true)), `${item.id} Blocks ${other.id}: link removed`);
  assert.deepEqual((await items.readItem(item.id))!.links, [{ type: 'Relates', to: other.id }]);
  await assert.rejects(items.linkItem(item.id, 'blocks', other.id, 'probe'), /a link is one of Blocks, Relates, Duplicate, Cloners; not "blocks"/);
});

test('delete, as Jira: its subtasks go with it, an epic\'s children are left with no parent, links to it go', async () => {
  const epic = (await items.createItem({ title: 'Doomed epic', kind: 'Epic' }, 'probe')).item;
  const story = (await items.createItem({ title: 'Doomed story', parent: epic.id }, 'probe')).item;
  const sub = (await items.createItem({ title: 'Its subtask', parent: story.id }, 'probe')).item;
  const keeper = (await items.createItem({ title: 'Survives', parent: epic.id }, 'probe')).item;
  const linker = (await items.createItem({ title: 'Links in' }, 'probe')).item;
  await items.linkItem(linker.id, 'Blocks', story.id, 'probe');
  assert.deepEqual(await items.deleteItem(story.id, 'probe'), { deleted: [story.id, sub.id], orphaned: [] });
  assert.equal(await items.readItem(sub.id), null);
  assert.deepEqual((await items.readItem(linker.id))!.links, []);
  assert.deepEqual(await items.deleteItem(epic.id, 'probe'), { deleted: [epic.id], orphaned: [keeper.id] });
  assert.equal((await items.readItem(keeper.id))!.parent, null);
});

test('status, kind and priority are the space\'s names exactly, the rest refused naming the set; the kind sets the level', async () => {
  const bug = await items.createItem({ title: 'Crash', kind: 'Bug' }, 'probe');
  assert.equal(items.didLine(bug), `${bug.item.id} was created`);
  assert.equal(bug.item.priority, 'Medium', 'a new item holds the default priority');
  assert.equal(items.didLine(await items.editItem(bug.item.id, { kind: 'Story' }, 'probe')), `${bug.item.id} changed: kind Story`);
  await assert.rejects(items.createItem({ title: 'Odd', kind: 'bug' }, 'probe'), /kind is one of Epic, Task, Story, Bug, Feature, Subtask; not "bug"/);
  await assert.rejects(items.editItem(bug.item.id, { status: 'BUILD' }, 'probe'), /status is one of To Do, In Progress, In Review, Done; not "BUILD"/);
  await assert.rejects(items.editItem(bug.item.id, { priority: 'high' }, 'probe'), /priority is one of Highest, High, Medium, Low, Lowest; not "high"/);
  const flagged = await items.flagItem(bug.item.id, true, 'waiting on Ana', 'probe');
  assert.equal(items.didLine(flagged), `${bug.item.id} is flagged: waiting on Ana`);
  assert.deepEqual([flagged.item.flagged, flagged.item.comments.map((comment) => comment.text)], [true, ['waiting on Ana']], 'the reason is an ordinary comment');
  assert.equal(items.didLine(await items.flagItem(bug.item.id, false, undefined, 'probe')), `${bug.item.id} is unflagged`);
  assert.equal(items.didLine(await items.editItem(bug.item.id, { status: 'In Progress' }, 'probe')), `${bug.item.id} moved to In Progress`);
  assert.equal(items.didLine(await items.editItem(bug.item.id, { priority: 'High' }, 'probe')), `${bug.item.id} changed: priority High`);
  const space: items.SpaceNames = { ...items.JIRA_NAMES, statuses: ['Backlog', 'Doing'] };
  items.setSpaceNames('paired', space);
  const paired = (await items.createItem({ title: 'In a space', campaign_id: 'paired' }, 'probe')).item;
  assert.equal(paired.status, 'Backlog', 'a connected campaign starts at its space\'s first status');
  await assert.rejects(items.editItem(paired.id, { status: 'To Do' }, 'probe'), /status is one of Backlog, Doing/);
  items.setSpaceNames('paired', null);
});

test('a comment is { by, at, text } on the item, with one trail line', async () => {
  const { item } = await items.createItem({ title: 'Talked about' }, 'probe');
  const done = await items.addComment(item.id, 'Looks right to me.', 'reviewer');
  assert.equal(items.didLine(done), `${item.id} has a comment from reviewer: Looks right to me.`);
  const back = (await items.readItem(item.id))!;
  assert.deepEqual(back.comments.map(({ by, text }) => [by, text]), [['reviewer', 'Looks right to me.']]);
  assert.match(back.comments[0]!.at, /^\d{4}-/);
  assert.deepEqual(back.trail.map((line) => line.op), ['create', 'comment']);
  await assert.rejects(items.addComment(item.id, '  ', 'reviewer'), { message: 'a comment needs its text.' });
});

test('create → read round-trips the whole shape, with one create line', async () => {
  const { item, line } = await items.createItem({ title: 'Store', objective: 'Keep items once.' }, 'probe');
  assert.match(item.id, /^w[1-9][0-9]*$/);
  assert.deepEqual(item.external, {});
  assert.equal(line.op, 'create');
  assert.equal(line.by, 'probe');
  assert.deepEqual(await items.readItem(item.id), item);
  const onDisk = JSON.parse(await fs.readFile(path.join(temp, `${item.id}.json`), 'utf8'));
  assert.deepEqual(onDisk, item, 'one JSON file per item, trail inside it');
  assert.equal('stage' in onDisk || 'exit' in onDisk, false);
});

test('one global issuer: concurrent creates never share an id', async () => {
  const made = await Promise.all(Array.from({ length: 12 }, (_, i) => items.createItem({ title: `t${i}` }, 'probe')));
  assert.equal(new Set(made.map(({ item }) => item.id)).size, 12);
});

test('trail append is atomic under concurrent writers: every line lands', async () => {
  const { item } = await items.createItem({ title: 'Busy' }, 'probe');
  await Promise.all(Array.from({ length: 25 }, (_, i) => items.addComment(item.id, `fact ${i}`, `writer${i}`)));
  const back = (await items.readItem(item.id))!;
  assert.equal(back.trail.filter((line) => line.op === 'comment').length, 25);
  assert.equal(back.comments.length, 25);
  assert.equal(new Set(back.trail.map((line) => line.note)).size, 26);
});

test('each write appends exactly one line; external is writable', async () => {
  const { item } = await items.createItem({ title: 'Edits' }, 'probe');
  assert.deepEqual([(await items.editItem(item.id, { status: 'In Progress' }, 'a')).line.op], ['status']);
  const jira = await items.editItem(item.id, { jira: { id: '10012', key: 'RON-12' } }, 'a');
  assert.deepEqual(jira.item.external, { jira: { id: '10012', key: 'RON-12' } });
  assert.equal((await items.editItem(item.id, { title: 'Edited', objective: 'o' }, 'a')).line.op, 'edit');
  assert.deepEqual((await items.readItem(item.id))!.trail.map((line) => line.op), ['create', 'status', 'edit', 'edit']);
  await assert.rejects(items.editItem(item.id, { status: ' ' }, 'a'), /status is one of/, 'only the space\'s names');
});

test('the ITEM socket hears every saved write once per trail line; a throwing hook never fails the write', async () => {
  const { sockets } = await import('../src/sockets.js');
  const heard: string[] = [];
  sockets.onItemChanged(() => { throw new Error('hook down'); });
  sockets.onItemChanged(({ item, line }) => { heard.push(`${item.id} ${line.op}`); });
  const made = await items.createItem({ title: 'Heard' }, 'a');
  await items.addComment(made.item.id, 'hello', 'a');
  assert.deepEqual(heard, [`${made.item.id} create`, `${made.item.id} comment`]);
});

test('the one rule: nothing goes below -1; the item takes its level and its children follow', async () => {
  const a = (await items.createItem({ title: 'A', kind: 'Epic' }, 'p')).item;
  const b = (await items.createItem({ title: 'B', parent: a.id }, 'p')).item;
  const c = (await items.createItem({ title: 'C', parent: b.id }, 'p')).item;
  const other = (await items.createItem({ title: 'Other epic', kind: 'Epic' }, 'p')).item;
  const story = await items.editItem(b.id, { parent: other.id }, 'p');
  assert.deepEqual([story.item.parent, story.item.level, (await items.readItem(c.id))!.parent], [other.id, 0, b.id], 'a story moves to another epic, its subtasks with it');
  assert.equal((await items.editItem(a.id, { parent: null }, 'p')).item.level, 1, 'no parent keeps the level: an epic stays an epic');
  const story2 = (await items.createItem({ title: 'Story', parent: a.id }, 'p')).item;
  await assert.rejects(items.editItem(b.id, { parent: story2.id }, 'p'), { message: `${b.id} can't go there.` }, 'its subtask would land at -2');
  assert.deepEqual([(await items.readItem(b.id))!.parent, (await items.readItem(c.id))!.level], [other.id, -1], 'a refusal writes nothing');
  await assert.rejects(items.createItem({ title: 'Under a subtask', parent: c.id }, 'p'), /^Error: w\d+ can't go there\.$/);
  const loose = (await items.createItem({ title: 'Loose' }, 'p')).item;
  await assert.rejects(items.editItem(loose.id, { parent: c.id }, 'p'), { message: `${loose.id} can't go there.` });
  await assert.rejects(items.editItem(loose.id, { parent: loose.id }, 'p'), { message: `${loose.id} can't go there.` }, 'under itself it is its own child, and the levels fall past -1');
  await assert.rejects(items.editItem(other.id, { parent: c.id }, 'p'), { message: `${other.id} can't go there.` }, 'nothing goes under its own descendant');
  const moved = await items.editItem(loose.id, { parent: a.id }, 'p');
  assert.deepEqual([moved.item.parent, moved.item.level, moved.line.op], [a.id, 0, 'move']);
  const back = await items.editItem(loose.id, { parent: null }, 'p');
  assert.deepEqual([back.item.parent, back.item.level], [null, 0]);

  // An epic with stories moved under an epic: the epic becomes 0, its stories -1.
  const epic = (await items.createItem({ title: 'Inner epic', kind: 'Epic' }, 'p')).item;
  const inner = (await items.createItem({ title: 'Inner story', parent: epic.id }, 'p')).item;
  assert.equal((await items.editItem(epic.id, { parent: a.id }, 'p')).item.level, 0);
  const followed = (await items.readItem(inner.id))!;
  assert.deepEqual([followed.level, followed.kind, followed.trail.at(-1)!.note], [-1, 'Subtask', `level -1, kind Subtask, following ${epic.id}`]);
  // A kind write sets the level: the children follow it too, and fail it below -1.
  assert.equal((await items.editItem(b.id, { kind: 'Epic' }, 'p')).item.level, 1);
  assert.deepEqual([(await items.readItem(c.id))!.level, (await items.readItem(c.id))!.kind], [0, 'Task']);
  await assert.rejects(items.editItem(epic.id, { kind: 'Subtask' }, 'p'), { message: `${epic.id} can't go there.` });
});

test('the one migration: kind, priority and link type take Jira\'s names; no priority is Medium; a second run changes nothing', async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-migrate-'));
  const item = (id: string, fields: Record<string, unknown>) => fs.writeFile(path.join(store, `${id}.json`), JSON.stringify({
    id, campaign_id: 'home_machine', title: id, objective: '', level: 0, kind: 'Task', status: 'To Do', flagged: false, priority: 'Medium',
    comments: [], parent: null, attachments: [], links: [], external: {}, trail: [], created: { at: '', by: '' }, ...fields,
  }));
  await item('w1', { kind: 'task', priority: 'high' });
  await item('w2', { kind: 'bug', priority: undefined, links: [{ type: 'blocks', to: 'w1' }] });
  await item('w3', {});
  process.env.RONIN_WORK_ITEMS_DIR = store;
  try {
    assert.deepEqual((await items.migrateItems('probe')).migrated, ['w1', 'w2']);
    const [w1, w2] = await Promise.all(['w1', 'w2'].map(async (id) => JSON.parse(await fs.readFile(path.join(store, `${id}.json`), 'utf8'))));
    assert.deepEqual([w1.kind, w1.priority, w2.kind, w2.priority, w2.links], ['Task', 'High', 'Bug', 'Medium', [{ type: 'Blocks', to: 'w1' }]]);
    assert.deepEqual((await items.migrateItems('probe')).migrated, [], 'a second run changes nothing');
  } finally {
    process.env.RONIN_WORK_ITEMS_DIR = temp;
  }
});

test('routes acknowledge with the item and the appended line; refusals answer 409', async () => {
  const app = express();
  app.use(express.json());
  registerWorkItems(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/work-items`;
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json() as Record<string, any> };
  };
  try {
    const made = await call('POST', base, { title: 'Routed', objective: 'o', kind: 'Task', by: 'probe' });
    assert.equal(made.status, 200);
    const id = made.data.item.id as string;
    assert.equal(made.data.acknowledgement, `${id} was created`);
    assert.ok((await call('GET', `${base}?holder=none`)).data.items.some((item: { id: string }) => item.id === id), 'holder none: the items nobody holds');
    assert.equal((await call('PUT', `${base}/${id}`, { jira: 'RON-1', by: 'probe' })).status, 400, 'jira is { id, key } or null');
    await call('PUT', `${base}/${id}`, { jira: { id: '10001', key: 'RON-1' }, by: 'probe' });
    assert.equal((await call('POST', `${base}/${id}/flag`, { by: 'probe' })).data.acknowledgement, `${id} is flagged`);
    const moved = await call('POST', `${base}/${id}/transition`, { status: 'In Review', by: 'probe' });
    assert.equal(moved.data.acknowledgement, `${id} moved to In Review`);
    assert.equal((await call('POST', `${base}/${id}/transition`, { status: 'To Do', by: 'probe' })).data.item.status, 'To Do', 'any status to any status');
    await call('POST', `${base}/${id}/transition`, { status: 'In Review', by: 'probe' });
    assert.equal((await call('PUT', `${base}/${id}`, { status: 'Done', by: 'probe' })).data.item.status, 'In Review', 'edit does not set status');
    assert.deepEqual([moved.data.item.status, moved.data.item.flagged, moved.data.item.external.jira], ['In Review', true, { id: '10001', key: 'RON-1' }]);
    assert.deepEqual((await call('PUT', `${base}/${id}`, { jira: null, by: 'probe' })).data.item.external, {}, 'null drops the pair');
    const child = await call('POST', base, { title: 'Child', parent: id, by: 'probe' });
    assert.equal(child.data.item.level, -1);
    assert.deepEqual((await call('GET', `${base}/${id}`)).data.children.map((item: { id: string }) => item.id), [child.data.item.id]);
    const peer = await call('POST', base, { title: 'Peer', by: 'probe' });
    const stuck = await call('PUT', `${base}/${id}`, { parent: peer.data.item.id, by: 'probe' });
    assert.deepEqual([stuck.status, stuck.data.error], [409, `${id} can't go there.`]);
    assert.equal((await call('POST', `${base}/${peer.data.item.id}/link`, { type: 'Blocks', to: id, by: 'probe' })).data.acknowledgement, `${peer.data.item.id} Blocks ${id}`);
    assert.deepEqual((await call('GET', `${base}/${id}`)).data.linked_from, [{ type: 'Blocks', from: peer.data.item.id }]);
    assert.ok((await call('GET', `${base}?status=in%20review&kind=Task`)).data.items.every((item: { status: string; kind: string }) => item.status === 'In Review' && item.kind === 'Task'));
    const alpha = (await call('GET', `${base}?campaign=alpha`)).data.items as Array<{ campaign_id: string }>;
    assert.ok(alpha.length && alpha.every((item) => item.campaign_id === 'alpha'));
    assert.equal((await call('DELETE', `${base}/${id}`, { by: 'probe' })).data.acknowledgement, `${id} was deleted; with its subtasks ${child.data.item.id}`);
    assert.equal((await call('GET', `${base}/${id}`)).status, 404);
    const kept = await call('POST', base, { title: 'Kept', by: 'probe' });
    const keptId = kept.data.item.id as string;
    assert.equal((await call('POST', `${base}/${keptId}/comment`, { text: 'a fact', by: 'probe' })).data.line.op, 'comment');
    assert.equal((await call('POST', `${base}/${keptId}/comment`, { edit: '1', text: 'a fact, fixed', by: 'probe' })).data.acknowledgement, `${keptId} comment 1 was edited`);
    assert.ok((await call('GET', `${base}?no_parent=1`)).data.items.some((item: { id: string }) => item.id === keptId));
    assert.equal((await call('GET', `${base}/w999999`)).status, 404);
    assert.equal((await call('POST', `${base}/${keptId}/transition`, { status: 'nope' })).status, 400);
  } finally {
    server.close();
  }
});
