// The item island (w271, w272): a pill per held work item in the tile header, Jira's kind symbol,
// a status dot, the flag; its bar brings it down as a column of pills that read their status and
// flag (KAN-238); a pill opens and closes its item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { kindKey, statusKey } from '../public/js/tile-island.js';

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

test('the tile header carries the island, fed by the pushed work record, and a pill opens the item over the tile', async () => {
  const head = await read('public/js/tilehead.js');
  assert.match(head, /key: 'island', widget: \(tile\) => createItemIsland/);
  assert.match(head, /tile\.island\?\.update\?\.\(tile\.session, islandItems\(tile\.tegami\)\)/);
  assert.match(head, /renderItemDetail\(detail, item/);
  // w279: a lead's island adds the Epics its Teams hold after its own items.
  assert.match(head, /islandItems = \(letter\) => \[\.\.\.\(letter\?\.items \|\| \[\]\), \.\.\.\(letter\?\.teamEpics \|\| \[\]\)\]/);
  assert.match(head, /isOpen: \(id\) => !!openItemLayer\(tile, id\)/);
  const island = await read('public/js/tile-island.js');
  assert.doesNotMatch(island, /request\(|fetch\(|setInterval/, 'no polling: the push is the only reading');
  // w272: nothing moves on its own: no timer, no drop on a change, no notify light, no kept hide.
  assert.doesNotMatch(island, /setTimeout|noticeable|notify|localStorage/);
  assert.match(island, /if \(isOpen\(item\.id\)\) shut\(item\.id\);/);
  // KAN-238: an expanded pill reads <symbol> <status> <dot> <flag>, the flag solid or its outline; no legend.
  assert.match(island, /node\.append\(kindMark\(item\.kind\), words, dot, flag\)/);
  assert.match(island, /item\.flagged \? FLAG_MARK : FLAG_OUTLINE/);
  assert.doesNotMatch(island, /legend/i);
  const style = await read('public/style.css');
  assert.match(style, /\.item-island\[data-state='down'\] \.item-island-pills \{ flex-direction: column;/);
});

test('the tile menu\'s Docs lists the record\'s documents (tegami.docs), as the Commons Docs does, so a lead shows its own', async () => {
  const head = await read('public/js/tilehead.js');
  assert.match(head, /hint: String\(\(tile\.tegami\?\.docs \|\| \[\]\)\.length \|\| ''\)/, 'the count');
  assert.match(head, /list: \(\) => \(tile\.tegami\?\.docs \|\| \[\]\)\.map\(/, 'the list');
  assert.match(head, /t\('me\.docs_none', 'No documents on this Agent\\'s record\.'\)/);
  assert.doesNotMatch(head + await read('public/js/work-record.js'), /heldAttachments/, 'held items\' attachments alone are gone');
  assert.match(await read('ronin_catalogs/lexicons/professional_en.md'), /- \*\*me\.docs_none:\*\* No documents on this Agent's record\./);
});
