// The item island (w271, w272): a pill per held work item in the tile header, Jira's kind symbol,
// a status dot, the flag; its bar brings it down as a column of pills that read their status and
// flag (KAN-238); a pill opens and closes its item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { barFacts, stanceGaps, stanceKey, stanceWords, handInSignal, handInWords, kindKey, lastComment, pillWords, statusKey, subtaskWords } from '../public/js/tile-island.js';

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
  assert.match(head, /tile\.island\?\.update\?\.\(tile\.session, islandItems\(tile\.tegami\), \{ stance: row\?\.stance, reports: row\?\.stance_reports \}\)/);
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
  // w272: nothing drops or pulses on a change: no timer, no auto-drop, no notify light, no kept state.
  // A mark that shows its current value on each push (the stance, w331) is fine.
  assert.doesNotMatch(island, /setTimeout|noticeable|notify|localStorage/);
  assert.match(island, /if \(isOpen\(item\.id\)\) \{ shut\(item\.id\); return; \}/);
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
  // One pill per top item, the kit's keyed list (KAN-413): a pill redraws only when what it shows moves.
  assert.match(island, /pillList\.set\(pills, shape\.top\.map\(\(item\) => \(\{ id: item\.id, item, count: under\.get\(item\.id\) \|\| 0 \}\)\)\)/);
  assert.doesNotMatch(island, /pills\.replaceChildren|bars\.replaceChildren/);
  const surface = await read('public/js/work-items-surface.js');
  assert.match(surface, /step\('subtasks', t\('work_items\.subtasks', 'Subtasks'\)/);
});

test('w322: the wide list, a bar per item with its description, last comment and facts', async () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const item = { id: 'w1', kind: 'Bug', priority: 'High', parent: 'KAN-253', attachments: ['/a'], comments: [{ by: 'a', at: '2026-11-06T09:00:00Z', text: 'one' }, { by: 'b', at: '2026-11-06T11:00:00Z', text: 'two' }],
    trail: [{ at: '2026-11-06T11:30:00Z', by: 'b', op: 'comment' }] };
  assert.equal(lastComment(item).text, 'two');
  assert.equal(lastComment({ comments: [] }), null);
  assert.deepEqual(barFacts(item, 2, now), ['Bug', 'under KAN-253', '2 subtasks', '1 attached', '2 comments', 'moved 30m ago']);
  assert.ok(barFacts({ comments: [{}] }, 0, now).includes('1 comment'));
  assert.deepEqual(barFacts({ id: 'w2' }, 0, now), [], 'an empty fact is left out');
  const island = await read('public/js/tile-island.js');
  assert.match(island, /el\.append\(stance, grip, pills, more\)/);
  assert.match(island, /more\.addEventListener\('click', \(\) => \{ place\('rest'\); showMore\(\); \}\)/, 'More detail opens the board over the tile (KAN-459)');
  assert.match(island, /node\.className = \[sub \? 'item-bar item-bar-sub' : 'item-bar'/, 'a bar is not a pill: the pill counts stay the pills');
  const css = await read('public/style.css');
  assert.match(css, /\.item-bar \.item-bar-comment \{ -webkit-line-clamp: 1;/);
});

test('w323: one subtask is singular', async () => {
  assert.equal(subtaskWords(1), '1 subtask');
  assert.equal(subtaskWords(3), '3 subtasks');
  assert.ok(barFacts({ parent: 'KAN-1' }, 1).includes('1 subtask'));
  const island = await read('public/js/tile-island.js');
  assert.match(island, /node\.title = `\$\{node\.title\} · \$\{subtaskWords\(count\)\}`/, 'the pill hover');
});

test('w331: the stance folds to three marks, only what needs the owner, read off the same push', async () => {
  assert.equal(stanceKey('asking'), 'question');
  assert.equal(stanceKey('awaiting_you'), 'turn');
  assert.equal(stanceKey('interrupted'), 'stopped');
  assert.equal(stanceKey('error'), 'stopped');
  for (const busy of ['working', 'replying', 'unknown', '', undefined]) assert.equal(stanceKey(busy), '', `${busy}: no mark`);
  assert.match(stanceWords('error'), /^Stopped/);
  assert.equal(stanceGaps(undefined), '', 'a row that does not say names no gaps');
  assert.equal(stanceGaps(['asking', 'awaiting_you', 'interrupted', 'error']), '');
  assert.equal(stanceGaps(['awaiting_you']), 'This harness cannot report a question, an interruption, a failed tool');
  const island = await read('public/js/tile-island.js');
  assert.match(island, /el\.append\(stance, grip, pills, more\)/);
  assert.match(island, /mark\('item-stance', \{ stance: key \}, \['circle', \{ cx: 8, cy: 8, r: 8, class: 'ground' \}\]/, 'a circle, not the kinds\' square');
  assert.match(island, /el\.hidden = !session \|\| \(!next\.length && stance\.hidden\)/, 'an Agent holding nothing still shows when it needs you');
  const css = await read('public/style.css');
  assert.match(css, /\.item-stance\[data-stance='question'\] \.ground \{ fill: var\(--kaki-fill\); \}/);
  assert.match(css, /\.item-stance\[data-stance='stopped'\] \.ground \{ fill: var\(--bad\); \}/);
});

test('a pressed item answers at once: busy until it shows, and further presses ignored (w416)', async () => {
  const [island, head, css] = await Promise.all(['public/js/tile-island.js', 'public/js/tilehead.js', 'public/style.css'].map(read));
  assert.match(head, /open: \(item\) => openItem\(tile, item\),/, 'open settles once the item shows');
  assert.match(island, /if \(loading\.has\(item\.id\)\) return;/, 'a press while it loads is ignored');
  assert.match(island, /try \{ await open\(items\.find\(\(one\) => one\.id === item\.id\) \|\| item\); \} finally \{ loading\.delete\(item\.id\); busy\(item\.id\); \}/);
  assert.match(island, /return markBusy\(node, item\.id\);/, 'a pill redrawn mid-load stays busy');
  assert.match(css, /\.tile-head \.item-island button:is\(\.item-pill, \.item-bar\)\[aria-busy='true'\] \{ opacity: \.58; cursor: progress; \}/);
});
