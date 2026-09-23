import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the tile corner exposes minimize and retirement through the existing Tile boundaries', async () => {
  const [head, tile] = await Promise.all([read('public/js/tilehead.js'), read('public/js/tile.js')]);
  assert.match(head, /key: 'killBtn',[^\n]+text: '×'/);
  assert.match(head, /on: \(tile\) => tile\.kill\(\)/);
  assert.match(head, /key: 'minimizeBtn',[^\n]+text: '−'/);
  assert.match(head, /on: \(tile\) => tile\.minimize\(\)/);
  assert.ok(head.indexOf("key: 'mentionBtn'") < head.indexOf("key: 'docsBtn'"), 'session picker precedes Docs');
  assert.ok(head.indexOf("key: 'docsBtn'") < head.indexOf("key: 'killBtn'"), 'Docs precedes the window controls');
  assert.ok(head.indexOf("key: 'killBtn'") < head.indexOf("key: 'minimizeBtn'"), 'close precedes minimize like the window controls it follows');
  assert.equal(head.indexOf("key:", head.indexOf("key: 'minimizeBtn'") + 1), -1, 'no control follows the window controls');
  assert.doesNotMatch(head, /text: '🗑'/);
  assert.match(tile, /if \(this\.onMinimize\) this\.onMinimize\(this\);\s*else this\.detach\(\)/);
  assert.match(tile, /retireSession\(name, this\.retirementId/);
});

test('the tile header exposes Docs directly without the old control and note menu', async () => {
  const [head, tile, phone] = await Promise.all([
    read('public/js/tilehead.js'), read('public/js/tile.js'), read('public/js/phone.js'),
  ]);
  assert.match(head, /key: 'workRecordBtn',[\s\S]*text: t\('head\.work_record', 'Work Record'\)/);
  assert.match(head, /key: 'docsBtn', needs: 'session'/);
  assert.doesNotMatch(head, /buildTileMore|key: 'moreBtn'|key: 'dial'|key: 'noteBtn'/);
  assert.doesNotMatch(tile, /refreshControl|pickControl|openNote/);
  assert.doesNotMatch(phone, /node\('noteBtn'\)|node\('dial'\)/);
});

test('the Torii rename prompt keeps the immutable Agent ID visible', async () => {
  const tile = await read('public/js/tile.js');
  assert.match(tile, /head\.rename_prompt', 'Edit Agent title\\n\\nAgent ID: \{id\}', \{ id: session \}/);
  assert.match(tile, /setSessionTitle\(session, wanted\.trim\(\)\)/);
});

test('managed workspaces empty their seat and both empty views use the subdued Ronin mark', async () => {
  const [cowork, host, tile, css] = await Promise.all([
    read('public/js/cowork-view.js'), read('public/js/terminal-tile-host.js'),
    read('public/js/tile.js'), read('public/style.css'),
  ]);
  assert.match(cowork, /onMinimize: \(\) => emptySeat\(id\)/);
  const emptySeat = cowork.slice(cowork.indexOf('const emptySeat ='), cowork.indexOf('const putTerminal ='));
  assert.ok(emptySeat.indexOf('pool.destroyAll()') < emptySeat.indexOf('remembered[id] = DISMISSED_WORKSPACE'));
  assert.ok(emptySeat.indexOf('remembered[id] = DISMISSED_WORKSPACE') < emptySeat.indexOf('bench.restoreDefault(id)'));
  assert.match(host, /new Tile\([^\n]+onMinimize: options\.onMinimize/);
  assert.match(tile, /emptyLogo\.src = 'brand\/nin-mark\.svg'/);
  assert.match(cowork, /logo\.src = '/);
  assert.match(css, /\.tile-empty-mark img[\s\S]*opacity: 0\.16;[\s\S]*filter: grayscale\(1\)/);
});
