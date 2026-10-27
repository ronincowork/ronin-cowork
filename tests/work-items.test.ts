/**
 * THE WORK ITEM STORE — one item, stored once, every change a trail line.
 * Checks against the Jira shape (Lab JIRA_SHAPE.md): a write reads back; concurrent trail
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

test('campaign is stored at creation; no parent is normal: level 0, kind blank, nothing made to hold it', async () => {
  const first = await items.createItem({ title: 'First', campaign_id: 'alpha' }, 'probe');
  assert.deepEqual([first.item.campaign_id, first.item.parent, first.item.level, first.item.kind, first.item.status, first.item.flagged], ['alpha', null, 0, undefined, 'IDEA', false]);
  assert.deepEqual((await items.listItems()).map((item) => item.id), [first.item.id], 'one create, one item');
});

test('level defaults one below the parent and adding a child never changes it', async () => {
  const epic = (await items.createItem({ title: 'Epic', level: 1 }, 'probe')).item;
  const story = (await items.createItem({ title: 'Story', parent: epic.id, kind: 'story' }, 'probe')).item;
  const sub = (await items.createItem({ title: 'Sub', parent: story.id }, 'probe')).item;
  assert.deepEqual([epic.level, story.level, sub.level], [1, 0, -1]);
  assert.equal((await items.readItem(story.id))!.level, 0, 'a story with a subtask is still level 0');
  const leaf = (await items.createItem({ title: 'Leaf' }, 'probe')).item;
  await items.createItem({ title: 'Under the leaf', parent: leaf.id }, 'probe');
  assert.equal((await items.readItem(leaf.id))!.level, 0);
});

test('edit --parent is the move: the level follows, other fields ride the same line', async () => {
  const epic = (await items.createItem({ title: 'Epic', level: 1 }, 'probe')).item;
  const story = (await items.createItem({ title: 'Story' }, 'probe')).item;
  assert.equal(items.didLine(await items.editItem(story.id, { parent: epic.id }, 'probe')), `${story.id} moved under ${epic.id}, level 0`);
  const both = await items.editItem(story.id, { parent: null, title: 'Story, loose' }, 'probe');
  assert.equal(items.didLine(both), `${story.id} changed: parent none, title`);
  assert.deepEqual([both.item.parent, both.item.level], [null, 0]);
});

test('comment --edit changes comment n; attach and remove a document; link blocks and relates', async () => {
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
  assert.equal(items.didLine(await items.linkItem(item.id, 'blocks', other.id, 'probe')), `${item.id} blocks ${other.id}`);
  assert.equal(items.didLine(await items.linkItem(item.id, 'relates', other.id, 'probe')), `${item.id} relates to ${other.id}`);
  assert.equal(items.didLine(await items.linkItem(item.id, 'blocks', other.id, 'probe', true)), `${item.id} blocks ${other.id}: link removed`);
  assert.deepEqual((await items.readItem(item.id))!.links, [{ type: 'relates', to: other.id }]);
  await assert.rejects(items.linkItem(item.id, 'duplicates', other.id, 'probe'), /blocks or relates/);
});

test('delete, as Jira: its subtasks go with it, an epic\'s children are left with no parent, links to it go', async () => {
  const epic = (await items.createItem({ title: 'Doomed epic', level: 1 }, 'probe')).item;
  const story = (await items.createItem({ title: 'Doomed story', parent: epic.id }, 'probe')).item;
  const sub = (await items.createItem({ title: 'Its subtask', parent: story.id }, 'probe')).item;
  const keeper = (await items.createItem({ title: 'Survives', parent: epic.id }, 'probe')).item;
  const linker = (await items.createItem({ title: 'Links in' }, 'probe')).item;
  await items.linkItem(linker.id, 'blocks', story.id, 'probe');
  assert.deepEqual(await items.deleteItem(story.id, 'probe'), { deleted: [story.id, sub.id], orphaned: [] });
  assert.equal(await items.readItem(sub.id), null);
  assert.deepEqual((await items.readItem(linker.id))!.links, []);
  assert.deepEqual(await items.deleteItem(epic.id, 'probe'), { deleted: [epic.id], orphaned: [keeper.id] });
  assert.equal((await items.readItem(keeper.id))!.parent, null);
});

test('kind is any work type name or blank; priority any name; the answer says only what the act changed', async () => {
  const bug = await items.createItem({ title: 'Crash', kind: 'bug' }, 'probe');
  assert.equal(items.didLine(bug), `${bug.item.id} was created`);
  assert.equal(items.didLine(await items.editItem(bug.item.id, { kind: 'story' }, 'probe')), `${bug.item.id} changed: kind story`);
  const flagged = await items.flagItem(bug.item.id, true, 'waiting on Ana', 'probe');
  assert.equal(items.didLine(flagged), `${bug.item.id} is flagged: waiting on Ana`);
  assert.deepEqual([flagged.item.flagged, flagged.item.comments.map((comment) => comment.text)], [true, ['waiting on Ana']], 'the reason is an ordinary comment');
  assert.equal(items.didLine(await items.flagItem(bug.item.id, false, undefined, 'probe')), `${bug.item.id} is unflagged`);
  assert.equal(items.didLine(await items.editItem(bug.item.id, { status: 'BUILD' }, 'probe')), `${bug.item.id} moved to BUILD`);
  assert.equal((await items.editItem(bug.item.id, { kind: '' }, 'probe')).item.kind, undefined);
  assert.equal((await items.createItem({ title: 'Odd', kind: 'feature' }, 'probe')).item.kind, 'feature');
  assert.equal(items.didLine(await items.editItem(bug.item.id, { priority: 'High' }, 'probe')), `${bug.item.id} changed: priority High`);
  assert.equal((await items.editItem(bug.item.id, { priority: '' }, 'probe')).item.priority, undefined);
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
  assert.deepEqual([(await items.editItem(item.id, { status: 'BUILD' }, 'a')).line.op], ['status']);
  const jira = await items.editItem(item.id, { jira: { id: '10012', key: 'RON-12' } }, 'a');
  assert.deepEqual(jira.item.external, { jira: { id: '10012', key: 'RON-12' } });
  assert.equal((await items.editItem(item.id, { title: 'Edited', objective: 'o' }, 'a')).line.op, 'edit');
  assert.deepEqual((await items.readItem(item.id))!.trail.map((line) => line.op), ['create', 'status', 'edit', 'edit']);
  assert.throws(() => items.editItem(item.id, { status: 'SHIPPED' }, 'a'), /status must be one of IDEA, PLAN, BUILD, REVIEW, LAND, DONE/);
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
  const a = (await items.createItem({ title: 'A', level: 1 }, 'p')).item;
  const b = (await items.createItem({ title: 'B', parent: a.id }, 'p')).item;
  const c = (await items.createItem({ title: 'C', parent: b.id }, 'p')).item;
  const other = (await items.createItem({ title: 'Other epic', level: 1 }, 'p')).item;
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
  const epic = (await items.createItem({ title: 'Inner epic', level: 1 }, 'p')).item;
  const inner = (await items.createItem({ title: 'Inner story', parent: epic.id }, 'p')).item;
  assert.equal((await items.editItem(epic.id, { parent: a.id }, 'p')).item.level, 0);
  const followed = (await items.readItem(inner.id))!;
  assert.deepEqual([followed.level, followed.trail.at(-1)!.note], [-1, `level -1, following ${epic.id}`]);
  // A level write: the children follow it too, and fail it below -1.
  assert.equal((await items.editItem(b.id, { level: 1 }, 'p')).item.level, 1);
  assert.equal((await items.readItem(c.id))!.level, 0);
  await assert.rejects(items.editItem(epic.id, { level: -1 }, 'p'), { message: `${epic.id} can't go there.` });
});

test('the one migration: stage → status, red → flagged, exit and ladder dropped, evidence a comment, levels from children, Unfiled out', async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-migrate-'));
  const old = (id: string, fields: Record<string, unknown>) => fs.writeFile(path.join(store, `${id}.json`), JSON.stringify({
    id, title: id, objective: '', stage: 'IDEA', exit: 'none', status: 'yellow', parent: null, ladder: [], docs: [], external: {}, trail: [], created: { at: '', by: '' }, ...fields,
  }));
  await old('w1', { title: 'Unfiled' });
  await old('w2', { parent: 'w1', stage: 'BUILD', status: 'red', kind: 'bug', docs: ['/plan.md'] });
  await old('w3', { stage: 'PLAN', trail: [{ at: '2026-10-01T00:00:00Z', by: 'ann', op: 'evidence', note: 'commit abc' }] });
  await old('w4', { parent: 'w3', status: 'green', exit: 'lead', ladder: [{ phase: 'Old', legs: [] }] });
  process.env.RONIN_WORK_ITEMS_DIR = store;
  try {
    const done = await items.migrateItems('probe');
    assert.deepEqual([done.before, done.after, done.removed, done.migrated], [4, 3, ['w1'], ['w2', 'w3', 'w4']]);
    const [w2, w3, w4] = await Promise.all(['w2', 'w3', 'w4'].map(async (id) => JSON.parse(await fs.readFile(path.join(store, `${id}.json`), 'utf8'))));
    assert.deepEqual([w2.campaign_id, w2.parent, w2.status, w2.flagged, w2.level, w2.kind, 'exit' in w2, 'stage' in w2, 'docs' in w2, w2.attachments], ['home_machine', null, 'BUILD', true, 0, 'bug', false, false, false, ['/plan.md']]);
    assert.deepEqual([w3.level, w3.status, w3.comments, w3.trail[0].op], [1, 'PLAN', [{ by: 'ann', at: '2026-10-01T00:00:00Z', text: 'commit abc' }], 'comment']);
    assert.deepEqual([w4.level, w4.flagged, w4.parent, 'ladder' in w4], [0, false, 'w3', false]);
    assert.deepEqual((await items.migrateItems('probe')).migrated, [], 'a second run changes nothing');
  } finally {
    process.env.RONIN_WORK_ITEMS_DIR = temp;
  }
});

test('the migration preserves an item already stamped with another campaign; a jira string becomes the pair', async () => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-migrate-campaign-'));
  process.env.RONIN_WORK_ITEMS_DIR = store;
  try {
    const created = await items.createItem({ title: 'Elsewhere', campaign_id: 'campaign_x' }, 'probe');
    assert.deepEqual((await items.migrateItems('probe')).migrated, []);
    assert.equal((await items.readItem(created.item.id))!.campaign_id, 'campaign_x');
    const file = path.join(store, `${created.item.id}.json`);
    await fs.writeFile(file, JSON.stringify({ ...JSON.parse(await fs.readFile(file, 'utf8')), external: { jira: 'PAY-7' } }));
    assert.deepEqual((await items.migrateItems('probe')).migrated, [created.item.id]);
    assert.deepEqual((await items.readItem(created.item.id))!.external, { jira: { id: '', key: 'PAY-7' } });
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
    const made = await call('POST', base, { title: 'Routed', objective: 'o', kind: 'task', by: 'probe' });
    assert.equal(made.status, 200);
    const id = made.data.item.id as string;
    assert.equal(made.data.acknowledgement, `${id} was created`);
    assert.ok((await call('GET', `${base}?holder=none`)).data.items.some((item: { id: string }) => item.id === id), 'holder none: the items nobody holds');
    assert.equal((await call('PUT', `${base}/${id}`, { jira: 'RON-1', by: 'probe' })).status, 400, 'jira is { id, key } or null');
    await call('PUT', `${base}/${id}`, { jira: { id: '10001', key: 'RON-1' }, by: 'probe' });
    assert.equal((await call('POST', `${base}/${id}/flag`, { by: 'probe' })).data.acknowledgement, `${id} is flagged`);
    const moved = await call('POST', `${base}/${id}/transition`, { status: 'PLAN', by: 'probe' });
    assert.equal(moved.data.acknowledgement, `${id} moved to PLAN`);
    assert.equal((await call('POST', `${base}/${id}/transition`, { status: 'IDEA', by: 'probe' })).data.item.status, 'IDEA', 'any status to any status');
    await call('POST', `${base}/${id}/transition`, { status: 'PLAN', by: 'probe' });
    assert.equal((await call('PUT', `${base}/${id}`, { status: 'DONE', by: 'probe' })).data.item.status, 'PLAN', 'edit does not set status');
    assert.deepEqual([moved.data.item.status, moved.data.item.flagged, moved.data.item.external.jira], ['PLAN', true, { id: '10001', key: 'RON-1' }]);
    assert.deepEqual((await call('PUT', `${base}/${id}`, { jira: null, by: 'probe' })).data.item.external, {}, 'null drops the pair');
    const child = await call('POST', base, { title: 'Child', parent: id, by: 'probe' });
    assert.equal(child.data.item.level, -1);
    assert.deepEqual((await call('GET', `${base}/${id}`)).data.children.map((item: { id: string }) => item.id), [child.data.item.id]);
    const peer = await call('POST', base, { title: 'Peer', by: 'probe' });
    const stuck = await call('PUT', `${base}/${id}`, { parent: peer.data.item.id, by: 'probe' });
    assert.deepEqual([stuck.status, stuck.data.error], [409, `${id} can't go there.`]);
    assert.equal((await call('POST', `${base}/${peer.data.item.id}/link`, { type: 'blocks', to: id, by: 'probe' })).data.acknowledgement, `${peer.data.item.id} blocks ${id}`);
    assert.deepEqual((await call('GET', `${base}/${id}`)).data.linked_from, [{ type: 'blocks', from: peer.data.item.id }]);
    assert.ok((await call('GET', `${base}?status=plan&kind=task`)).data.items.every((item: { status: string; kind: string }) => item.status === 'PLAN' && item.kind === 'task'));
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
