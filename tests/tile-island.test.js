// The item island (w271, w272): a pill per held work item in the tile header, Jira's kind symbol,
// a status dot, the flag; its bar brings it down as a column of pills that read their status and
// flag (KAN-238); a pill opens and closes its item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handInSignal, handInWords, kindKey, pillWords, statusKey } from '../public/js/tile-island.js';

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
  // Piece E: then what the Agent handed in that still waits In Review, before a lead's Epics.
  assert.match(head, /islandHeld = \(letter\) => \[\.\.\.new Map\(\[\.\.\.\(letter\?\.items \|\| \[\]\), \.\.\.\(letter\?\.teamItems \|\| \[\]\)\]\.map\(\(item\) => \[item\.id, item\]\)\)\.values\(\)\]/);
  // Owner, 2026-11-05: Done leaves the island; a Task's reading still lists all its Subtasks.
  assert.match(head, /islandItems = \(letter\) => islandHeld\(letter\)\.filter\(\(item\) => statusKey\(item\.status\) !== 'done'\)/);
  // w299: the Subtasks come from the item read, so a Done one the Team holds stays listed.
  assert.match(head, /const children = read\.ok && Array\.isArray\(read\.data\?\.children\) \? read\.data\.children/);
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

test('the hand-in mark: handed in, then on dev once a promotion follows the last hand-in, with how long ago', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const handed = { id: 'w1', status: 'In Review', hand_ins: [{ receipt: 'hi_1', by: 'mem', at: '2026-11-04T10:00:00Z' }] };
  assert.deepEqual(handInSignal(handed), { kind: 'handed', at: '2026-11-04T10:00:00Z' });
  assert.equal(handInWords(handInSignal(handed), now), 'handed in 2h');
  const onDev = { ...handed, on_dev: { promotion: 'p1', at: '2026-11-04T11:55:00Z' } };
  assert.equal(handInWords(handInSignal(onDev), now), 'on dev 5m');
  const again = { ...onDev, hand_ins: [...onDev.hand_ins, { receipt: 'hi_2', by: 'mem', at: '2026-11-04T11:58:00Z' }] };
  assert.equal(handInSignal(again).kind, 'handed', 'a later hand-in is not on dev yet');
  assert.equal(handInSignal({ ...onDev, status: 'In Progress' }), null, 'sent back: no mark');
  assert.equal(handInSignal({ id: 'w2', status: 'In Review' }), null, 'never handed in: no mark');
  assert.match(pillWords(handed), /handed in \d+[mhd]/, 'the words read aloud carry it');
});

test('the island draws the mark beside the dot and the flag, its words only when down', async () => {
  const island = await read('public/js/tile-island.js');
  assert.match(island, /node\.append\(kindMark\(item\.kind\), words, dot, flag\);\n    const signal = handInSignal\(item\);/);
  const css = await read('public/style.css');
  assert.match(css, /\.item-pill \.item-pill-handin-words \{ display: none; \}/);
  assert.match(css, /\.item-island\[data-state='down'\] \.item-pill-handin-words \{ display: inline;/);
});

test('a Subtask whose Task is on the island folds under it: the Task pill carries the mark and count', async () => {
  const island = await read('public/js/tile-island.js');
  assert.match(island, /kindKey\(item\.kind\) === 'subtask' && item\.parent && shown\.has\(item\.parent\)/);
  assert.match(island, /mark\.append\(kindMark\('Subtask'\), String\(count\)\)/);
  assert.match(island, /pills\.replaceChildren\(\.\.\.shape\.top\.map\(pill\)\)/);
  const surface = await read('public/js/work-items-surface.js');
  assert.match(surface, /step\('subtasks', t\('work_items\.subtasks', 'Subtasks'\)/);
});
