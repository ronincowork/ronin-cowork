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
process.env.RONIN_WORK_ITEMS_DIR = temp;

const items = await import('../src/work-items.js');
const { registerWorkItems } = await import('../src/routes/work-items-api.js');

test('create → read round-trips the whole shape, with one create line', async () => {
  const { item, line } = await items.createItem({ title: 'Store', objective: 'Keep items once.' }, 'probe');
  assert.match(item.id, /^w[1-9][0-9]*$/);
  assert.equal(item.stage, 'IDEA');
  assert.equal(item.parent, null);
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
  await Promise.all(Array.from({ length: 25 }, (_, i) => items.addEvidence(item.id, `fact ${i}`, `writer${i}`)));
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
  assert.throws(() => items.editItem(item.id, { stage: 'LANDING' }, 'a'), /stage must be one of IDEA, PLAN, BUILD, REVIEW, LAND, DONE/);
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
  assert.equal((await items.readItem(a.id))!.parent, null, 'a refusal writes nothing');
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
