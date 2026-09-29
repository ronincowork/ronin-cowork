/**
 * THE WORK ITEM STORE — one item, stored once, every change a trail line.
 * Checks from WORK_ITEM_STORE.md cut 1: a write reads back; concurrent trail appends all
 * land; a reparent that would cycle is refused with the chain named; the routes answer with
 * the item as it now is plus the line appended.
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

test('a create with no common board makes one and files under it; the next create reuses it', async () => {
  assert.equal(await items.commonBoard(), null, 'a fresh store has no starting point');
  const first = await items.createItem({ title: 'First' }, 'probe');
  const common = (await items.commonBoard())!;
  assert.deepEqual([common.title, common.parent, first.item.parent], ['Common', null, common.id]);
  assert.notEqual(first.item.id, common.id);
  assert.deepEqual(await items.holdersOf(common.id), [], 'held by nobody');
  const second = await items.createItem({ title: 'Second' }, 'probe');
  assert.equal(second.item.parent, common.id);
  assert.equal((await items.listItems()).filter((item) => item.title === 'Common' && item.parent === null).length, 1);
  assert.equal(second.shape, `${second.item.id} is a project at idea, 0 legs`);
  assert.equal((await items.readItem(first.item.id)) && (await items.reparentItem(second.item.id, first.item.id, 'probe')).shape, `${second.item.id} is a project at idea, 0 legs`);
  assert.equal((await items.editItem(first.item.id, { title: 'First board' }, 'probe')).shape, `${first.item.id} is a board, 1 item`);
  // Deleted by hand: the next create makes another.
  await fs.unlink(path.join(temp, `${common.id}.json`));
  const third = await items.createItem({ title: 'Third' }, 'probe');
  const again = (await items.commonBoard())!;
  assert.notEqual(again.id, common.id);
  assert.equal(third.item.parent, again.id);
});

test('create → read round-trips the whole shape, with one create line', async () => {
  const { item, line } = await items.createItem({ title: 'Store', objective: 'Keep items once.' }, 'probe');
  assert.match(item.id, /^w[1-9][0-9]*$/);
  assert.equal(item.stage, 'IDEA');
  assert.equal(item.parent, (await items.commonBoard())!.id, 'born on the common board');
  assert.deepEqual(item.ladder, []);
  assert.deepEqual(item.docs, []);
  assert.deepEqual(item.external, {});
  assert.equal(line.op, 'create');
  assert.equal(line.by, 'probe');
  assert.deepEqual(await items.readItem(item.id), item);
  const onDisk = JSON.parse(await fs.readFile(path.join(temp, `${item.id}.json`), 'utf8'));
  assert.deepEqual(onDisk, item, 'one JSON file per item, trail inside it');
});

test('one global issuer: concurrent creates never share an id', async () => {
  const made = await Promise.all(Array.from({ length: 12 }, (_, i) => items.createItem({ title: `t${i}` }, 'probe')));
  assert.equal(new Set(made.map(({ item }) => item.id)).size, 12);
});

test('trail append is atomic under concurrent writers: every line lands', async () => {
  const { item } = await items.createItem({ title: 'Busy' }, 'probe');
  await Promise.all(Array.from({ length: 25 }, (_, i) => items.editItem(item.id, { evidence: `fact ${i}` }, `writer${i}`)));
  const back = (await items.readItem(item.id))!;
  assert.equal(back.trail.filter((line) => line.op === 'evidence').length, 25);
  assert.equal(new Set(back.trail.map((line) => line.note)).size, 26);
});

test('each edit call appends exactly one line, named by what changed', async () => {
  const { item } = await items.createItem({ title: 'Edits' }, 'probe');
  assert.equal((await items.editItem(item.id, { stage: 'BUILD' }, 'a')).line.op, 'stage');
  assert.equal((await items.editItem(item.id, { status: 'green', exit: 'lead' }, 'a')).line.op, 'status');
  assert.equal((await items.editItem(item.id, { exit: 'user' }, 'a')).line.op, 'exit');
  assert.equal((await items.editItem(item.id, { title: 'Edited', objective: 'o' }, 'a')).line.op, 'edit');
  const back = (await items.readItem(item.id))!;
  assert.equal(back.trail.length, 5);
  assert.deepEqual(back.trail.map((line) => line.op), ['create', 'stage', 'status', 'exit', 'edit']);
  assert.throws(() => items.editItem(item.id, { stage: 'SHIPPED' }, 'a'), /stage must be one of IDEA, PLAN, BUILD, REVIEW, LAND, DONE/);
});

test('a reparent that would form a cycle is refused and names the chain', async () => {
  const a = (await items.createItem({ title: 'A' }, 'p')).item;
  const b = (await items.createItem({ title: 'B', parent: a.id }, 'p')).item;
  const c = (await items.createItem({ title: 'C', parent: b.id }, 'p')).item;
  await assert.rejects(items.reparentItem(a.id, c.id, 'p'), (error: Error) => {
    assert.ok(error instanceof items.WorkItemRefused);
    assert.match(error.message, new RegExp(`^REFUSED: .*${a.id} → ${c.id} → ${b.id} → ${a.id}`));
    return true;
  });
  await assert.rejects(items.reparentItem(a.id, a.id, 'p'), items.WorkItemRefused);
  assert.equal((await items.readItem(a.id))!.parent, a.parent, 'a refusal writes nothing');
  const moved = await items.reparentItem(c.id, a.id, 'p');
  assert.equal(moved.item.parent, a.id);
  assert.deepEqual([moved.line.op, moved.line.from, moved.line.to], ['reparent', b.id, a.id]);
});

test('routes acknowledge with the item and the appended line; a cycle answers 409 REFUSED', async () => {
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
    const made = await call('POST', base, { title: 'Routed', objective: 'o', by: 'probe' });
    assert.equal(made.status, 200);
    const id = made.data.item.id as string;
    assert.equal(made.data.line.op, 'create');
    assert.match(made.data.acknowledgement, new RegExp(`Work item ${id}`));
    const staged = await call('POST', `${base}/${id}/stage`, { stage: 'PLAN', by: 'probe' });
    assert.equal(staged.data.item.stage, 'PLAN');
    assert.deepEqual([staged.data.line.op, staged.data.line.from, staged.data.line.to], ['stage', 'IDEA', 'PLAN']);
    const child = await call('POST', base, { title: 'Child', parent: id, by: 'probe' });
    const cycle = await call('POST', `${base}/${id}/reparent`, { parent: child.data.item.id, by: 'probe' });
    assert.equal(cycle.status, 409);
    assert.equal(cycle.data.refused, true);
    assert.match(cycle.data.error, /^REFUSED: .* → /);
    assert.equal((await call('GET', `${base}/w999999`)).status, 404);
    assert.equal((await call('POST', `${base}/${id}/stage`, { stage: 'nope' })).status, 400);
  } finally {
    server.close();
  }
});
