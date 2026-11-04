// The item island (w271): a pill per held work item in the tile header, Jira's kind symbol, a
// status dot, the flag; it drops when an item moves, and its grip hides and recalls it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { kindKey, statusKey, noticeable } from '../public/js/tile-island.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('a kind folds to the Jira symbol it wears', () => {
  for (const [kind, key] of [['Epic', 'epic'], ['Story', 'story'], ['Task', 'task'], ['Bug', 'bug'], ['Feature', 'feature'],
    ['New Feature', 'feature'], ['Subtask', 'subtask'], ['Sub-task', 'subtask'], ['Spike', 'other'], [undefined, 'other']]) {
    assert.equal(kindKey(kind), key, String(kind));
  }
});

test('a status folds to the family its dot is coloured by', () => {
  assert.equal(statusKey('To Do'), 'todo');
  assert.equal(statusKey('In Progress'), 'progress');
  assert.equal(statusKey('In Review'), 'review');
  assert.equal(statusKey('Done'), 'done');
});

test('the island drops for an item new to the Agent, a moved status or a raised flag, never on the first reading', () => {
  const item = { id: 'w1', status: 'To Do', flagged: false };
  const before = new Map([['w1', { status: 'To Do', flagged: false }]]);
  assert.equal(noticeable(null, [item]), false);
  assert.equal(noticeable(before, [item]), false);
  assert.equal(noticeable(before, [{ ...item, status: 'In Progress' }]), true);
  assert.equal(noticeable(before, [{ ...item, flagged: true }]), true);
  assert.equal(noticeable(before, [item, { id: 'w2', status: 'To Do', flagged: false }]), true);
  assert.equal(noticeable(new Map([['w1', { status: 'To Do', flagged: true }]]), [item]), false, 'a lowered flag is not news');
});

test('the tile header carries the island, fed by the pushed work record, and a pill opens the item over the tile', async () => {
  const head = await read('public/js/tilehead.js');
  assert.match(head, /key: 'island', widget: \(tile\) => createItemIsland/);
  assert.match(head, /tile\.island\?\.update\?\.\(tile\.session, tile\.tegami\?\.items\)/);
  assert.match(head, /renderItemDetail\(detail, item/);
  const island = await read('public/js/tile-island.js');
  assert.doesNotMatch(island, /request\(|fetch\(|setInterval/, 'no polling: the push is the only reading');
});
