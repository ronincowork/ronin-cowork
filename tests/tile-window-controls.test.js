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

test('the wide-touch Agent collapse control and its response share one workbench scope', async () => {
  const style = await read('public/style.css');
  const scope = ":root:is([data-workbench='team'], [data-workbench='cowork'])";
  assert.match(style, new RegExp(`${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.tile-head > \\.tile-head-collapse`));
  assert.match(style, new RegExp(`${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\.tile\\.header-collapsed \\.tile-head`));
  assert.doesNotMatch(style, /(?:^|,)\s*\.tile-head > \.tile-head-collapse\s*\{/m);
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

test('collapsing the application header moves the caret alone, never the island', async () => {
  const [layout, style] = await Promise.all([read('public/js/layout.js'), read('public/style.css')]);
  // The defect: collapsing re-parented the whole island into the live selector header,
  // where a class had to unwind every island property to survive a flex band, and the
  // header lost its own title and actions to make room. The island stays in the bar.
  assert.doesNotMatch(layout, /island-docked|selectorHead|data-workbench-header="selector"/);
  assert.doesNotMatch(style, /island-docked/);
  assert.match(layout, /document\.body\.append\(collapse\)/);
  assert.match(layout, /collapse\.classList\.add\('header-collapse-docked'\)/);
  assert.match(style, /\.app-header-collapse\.header-collapse-docked \{[^}]*position: fixed/);
  // Keyed on the control, so the caret keeps its shape once it is no longer the island's child.
  assert.match(style, /\.app-header-collapse,\n\s*:root:is\(\[data-workbench='team'\], \[data-workbench='cowork'\]\) \.tile-head > \.tile-head-collapse \{/);
});

test('the wide-touch bar keeps its readings at the right-hand end', async () => {
  const [style, html] = await Promise.all([read('public/style.css'), read('public/index.html')]);
  // The island goes position: absolute on wide touch, so its .grow stops pushing the
  // readings right and trimBarForTouch removes the only other right-hand push.
  assert.match(style, /#bar > \.wk-view-map \{ margin-left: auto; \}/);
  // The auto margin only carries the group if the map is still first of the trailing run.
  const bar = html.slice(html.indexOf('<header id="bar">'), html.indexOf('</header>'));
  for (const after of ['id="ramrpm"', 'id="viewactions"', 'id="feedbackaction"']) {
    assert.ok(bar.indexOf('id="viewmap"') < bar.indexOf(after), `the map precedes ${after}`);
  }
});

test('a UI diagnostic asks the host contract where Ronin answers instead of guessing', async () => {
  const { readdir } = await import('node:fs/promises');
  const names = (await readdir(new URL('../scripts', import.meta.url))).filter((n) => n.endsWith('-ui.mjs'));
  const checked = [];
  for (const name of names) {
    const src = await read(`scripts/${name}`);
    // Only the scripts that drive an ALREADY-RUNNING Ronin. The others stand up their own
    // loopback fixture on an ephemeral port, which resolves nothing and guesses nothing.
    if (!/from '\.\/lib\/ui-host\.mjs'/.test(src) || !/defaultUrl/.test(src)) continue;
    checked.push(name);
    // A routable address in the source is one machine's answer published to every other.
    assert.doesNotMatch(src, /\b(?!127\.0\.0\.1)\d{1,3}(?:\.\d{1,3}){3}\b/, `${name} names a machine address`);
    assert.doesNotMatch(src, /https?:\/\/[^\s'"`$]+/, `${name} hardcodes a target URL`);
    assert.doesNotMatch(src, /\|\|\s*['"`]https?:/, `${name} falls back to a literal URL`);
    // defaultUrl(), defaultUrl(true) and defaultUrl(<staging flag>) are all the contract.
    assert.match(src, /defaultUrl\(/, `${name} must resolve its target through defaultUrl()`);
  }
  assert.ok(checked.includes('ipad-header-ui.mjs'), 'the iPad header diagnostic is covered');
});
