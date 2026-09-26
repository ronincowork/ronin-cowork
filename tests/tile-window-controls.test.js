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

test('wide touch puts the Agent tools behind one menu instead of folding the head', async () => {
  const [style, head] = await Promise.all([read('public/style.css'), read('public/js/tilehead.js')]);
  // The list of workbench kinds is allowed to grow — 60b7ff7b added 'desk'. What this
  // guards is that the control is scoped to workbench kinds, not the exact membership.
  const scope = ":root:is\\(\\[data-workbench='team'\\], \\[data-workbench='cowork'\\][^)]*\\)";
  const lit = (x) => x;
  // The per-tile chevron is retired: it traded one tap for another and gave the tile head
  // a different depth from the surface heads beside it.
  assert.doesNotMatch(style, /tile-head-collapse|tile\.header-collapsed/);
  assert.doesNotMatch(head, /tile-head-collapse|header-collapsed/);
  // One menu, the way the phone already does it.
  assert.match(head, /makeDrop\('メ'/);
  for (const key of ['workRecordBtn', 'docsBtn', 'mentionBtn', 'outputEl', 'minimizeBtn', 'killBtn']) {
    assert.match(head, new RegExp(`row\\('${key}'`), `${key} belongs in the メ sheet`);
  }
  // The reading toggle stays a toggle and never becomes a row in a menu.
  assert.doesNotMatch(head, /row\('transcriptBtn'/);
  // ONE BAND DEPTH ACROSS THE ROW. The Kit's depth is already on .tile-head; the defect
  // was the wide-touch block overriding it to 38px against the surface head's 45px, so
  // what this guards is that nothing here restates or shrinks the band again.
  assert.match(style, /^\.tile-head \{[^}]*min-height: var\(--row-head\)/m);
  const wide = style.slice(style.indexOf('@media (pointer: coarse) and (min-width: 681px)'));
  const found = new RegExp(`${scope} \\.tile-head \\{([^}]*)\\}`).exec(wide);
  assert.ok(found, 'the wide-touch tile head rule is there to inspect');
  const body = found[1];
  assert.match(body, /flex-wrap: nowrap/, 'one row, never two');
  assert.doesNotMatch(body, /min-height|height:|padding/, 'the band depth is the Kit\'s, not restated here');
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
  // Tolerant of layout: what matters is that the host hands its onMinimize to the Tile,
  // not whether the options sit on one line (fb952d2e wrapped them to add transcriptCache).
  assert.match(host, /new Tile\([\s\S]{0,240}onMinimize: options\.onMinimize/);
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
  // Keyed on the control, not on its parent, so the caret keeps its shape once it is
  // docked and no longer the island's child.
  assert.match(style, /:root:is\(\[data-workbench='team'\], \[data-workbench='cowork'\][^)]*\) \.app-header-collapse \{/);
  assert.doesNotMatch(style, /\.view-island > \.app-header-collapse \{[^}]*display: inline-flex/);
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

test('each surface walks only the readings it was given, by name', async () => {
  const tile = await read('public/js/tile.js');
  const cycle = tile.slice(tile.indexOf('transcriptCycle() {'), tile.indexOf('toggleTranscript()'));
  // A thumb does not want five detents. The phone is Terminal or Chat; a tablet is
  // Terminal, Chat and Work. Notes and the full record are a desk's business.
  assert.match(cycle, /getElementById\('phone'\)[\s\S]*slice\(0, 1\)/, 'the phone stops after the first reading');
  assert.match(cycle, /isCoarse\(\)[\s\S]*filter\(\(r\) => r\.name === 'chat' \|\| r\.name === 'work'\)/, 'a tablet offers Chat and Work');
  assert.match(cycle, /return readings;/, 'a desk still walks every reading the route published');
  // Named, not sliced by length: a reading added on the server must not join a thumb surface.
  assert.doesNotMatch(cycle, /slice\(0,\s*[23]\)|Math\.min\(\s*[23]/, 'the tablet selects by name, never by count');
  // The level indexes the cycle, not the route's full list, or the label and the view drift.
  for (const site of ['const readings = this.transcriptCycle();', 'const cycle = this.transcriptCycle();', 'this.transcriptCycle()[this.transcriptLevel]']) {
    assert.ok(tile.includes(site), `the cycle is the index everywhere: ${site}`);
  }
  assert.doesNotMatch(tile, /this\.transcriptReadings\[this\.transcriptLevel\]/, 'the level never indexes the unfiltered list');
});

test('the メ sheet holds Output for a Services-bound Agent and withdraws it for one without', async () => {
  const [tile, style] = await Promise.all([read('public/js/tile.js'), read('public/style.css')]);
  // Services being ON for the desk is not the same question as Services being on for THIS
  // Agent: the roster row carries rireki per session, and an Agent born before Rireki was
  // activated answers false while every newer one answers true. Both must read correctly.
  const off = tile.slice(tile.indexOf('servicesOff() {'), tile.indexOf('syncOutput() {'));
  assert.match(off, /S\.streamOff/, 'the Campaign switch still wins');
  assert.match(off, /row\?\.rireki === false/, 'otherwise it is this Agent\'s own answer');
  const sync = tile.slice(tile.indexOf('syncOutput() {'));
  assert.match(sync, /sel\.hidden = off;/, 'the control withdraws itself when there is nothing to choose');
  // And the word beside it goes with it, so the sheet never shows a blank line. Without
  // this the row stayed, holding a hidden select and a label for a control that is gone.
  assert.match(style, /\.tdrop-row:has\(> \[hidden\]\) \{\s*display: none;/);
});
