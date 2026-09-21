import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

globalThis.window = {};
globalThis.document = { createElement: () => ({ style: {}, dataset: {}, classList: { add() {} }, setAttribute() {}, append() {} }) };
const { tabEdge, chooseTab, nextTabIndex } = await import(`../public/js/workspace-tabs.js?ui=${Date.now()}`);

test('a cut edge is named from the scroll box, and one pixel of slack is not a cut', () => {
  assert.equal(tabEdge({ scrollLeft: 0, scrollWidth: 400, clientWidth: 400 }), 'none');
  assert.equal(tabEdge({ scrollLeft: 0, scrollWidth: 401, clientWidth: 400 }), 'none', 'rounding is not an edge');
  assert.equal(tabEdge({ scrollLeft: 0, scrollWidth: 800, clientWidth: 400 }), 'right');
  assert.equal(tabEdge({ scrollLeft: 400, scrollWidth: 800, clientWidth: 400 }), 'left');
  assert.equal(tabEdge({ scrollLeft: 200, scrollWidth: 800, clientWidth: 400 }), 'both');
  assert.equal(tabEdge(), 'none', 'an unmeasured strip claims no edge');
});

test('selection falls back rather than leaving the surface blank', () => {
  const tabs = [
    { id: 'roster' },
    { id: 'docs', hidden: true },
    { id: 'kanban', disabled: true },
    { id: 'cron' },
  ];
  assert.equal(chooseTab('cron', tabs), 'cron');
  assert.equal(chooseTab('docs', tabs), 'roster', 'a hidden tab falls back');
  assert.equal(chooseTab('kanban', tabs), 'roster', 'an unavailable tab falls back');
  assert.equal(chooseTab('nothing-of-the-sort', tabs), 'roster');
  assert.equal(chooseTab(undefined, tabs), 'roster');
  // A Task Manager that has not been installed leaves the row with one real tab.
  assert.equal(chooseTab('kanban', [{ id: 'kanban', disabled: true }]), '');
});

test('arrows wrap at both ends and other keys move nothing', () => {
  assert.equal(nextTabIndex('ArrowRight', 0, 4), 1);
  assert.equal(nextTabIndex('ArrowRight', 3, 4), 0, 'the last tab wraps to the first');
  assert.equal(nextTabIndex('ArrowLeft', 0, 4), 3, 'the first tab wraps to the last');
  assert.equal(nextTabIndex('Home', 2, 4), 0);
  assert.equal(nextTabIndex('End', 1, 4), 3);
  assert.equal(nextTabIndex('Enter', 1, 4), -1, 'activation is not navigation');
  assert.equal(nextTabIndex('ArrowRight', -1, 4), -1, 'nothing focused, nothing to move');
  assert.equal(nextTabIndex('ArrowRight', 0, 0), -1);
});

test('the tab set is the one strip, reachable from the Kit namespace', async () => {
  const kit = await source('public/js/workspace-kit.js');
  const workbench = await source('public/js/workbench.js');
  assert.match(kit, /import \{ createTabbedSurface \} from '\.\/workspace-tabs\.js'/);
  assert.match(kit, /primitives: Object\.freeze\(\{ \.\.\.WorkspacePrimitives, createTabbedSurface \}\)/);
  assert.match(workbench, /HEADER_KINDS = new Set\(\['surface', 'tabs', 'terminal'\]\)/);
  assert.doesNotMatch(workbench, /header === 'channels'/);
});

test('one select path serves click, keyboard and code, and panels build on first show', async () => {
  const tabs = await source('public/js/workspace-tabs.js');
  assert.match(tabs, /button\.addEventListener\('click', \(\) => select\(id\)\)/);
  assert.match(tabs, /if \(entry\.built\) return entry\.service;/);
  assert.match(tabs, /typeof declared === 'function' \? declared\(\) : declared/);
  // A watch keeps an off-screen room running, so entering every panel is never the price
  // of learning something is waiting.
  assert.match(tabs, /entry\.declared\.watch\(report, context\)/);
  assert.match(tabs, /for \(const entry of order\) if \(entry\.built\) entry\.service\?\.destroy\?\.\(\)/);
  assert.match(tabs, /observer\?\.disconnect\(\)/);
});

test('nothing selected is marked with an underline, and the bar keeps one centre line', async () => {
  const kit = await source('public/workspace-kit.css');
  const block = kit.slice(kit.indexOf('.wk-tabset'), kit.indexOf('.wk-layout-map {'));
  assert.ok(block.includes('.wk-tabset-tab['), 'the tab set rules live in the Kit sheet');
  assert.doesNotMatch(block, /text-decoration|border-bottom:[^;]*var\(--kaki\)/, 'no underline marks a selection');
  assert.doesNotMatch(block, /inset 0 calc\(-1 \* var\(--space-1\)\) 0/, 'the old accent underline does not follow the strip');
  // The selected tab covers the band's rule with a shadow, which costs no layout — a
  // negative margin made its box taller than its neighbours and moved its label off
  // their centre line.
  assert.match(block, /\[aria-selected='true'\][^}]*box-shadow: 0 var\(--cowork-surface-head-edge\) 0 var\(--panel\)/);
  assert.doesNotMatch(block, /\.wk-tabset-tab \{[^}]*margin-bottom/, 'no negative margin on a tab');
  assert.doesNotMatch(block, /\.wk-tabset-actions \{[^}]*padding-bottom/, 'symmetric padding, or it centres elsewhere');
  // The bar carries tabs and actions. The surface's name is not drawn in it.
  assert.ok(!block.includes('.wk-tabset-word'));
  assert.doesNotMatch(block, /font-weight: 700/, 'attention never changes a label\'s weight');
});

test('Commons builds on first use and Task Manager has its own surface', async () => {
  const view = await source('public/js/cowork-view.js');
  const catalog = await source('public/js/workbench-catalog.js');
  assert.match(view, /const commonsFor = \(id\) => \{/);
  assert.doesNotMatch(view, /Object\.fromEntries\(Object\.keys\(seats\)\.map\(\(id\) => \[id, createTeamCommons\(id\)\]\)\)/,
    'four seats do not build every Commons room at construction');
  assert.match(view, /teamCommons: \(id\) => \(\{ el: commonsFor\(id\)\.el/);
  assert.match(view, /made\.channels\.mount\(ctx\)/);
  assert.match(catalog, /type: WORKBENCH_TYPES\.kanban, header: 'surface'/);
  assert.match(view, /taskManagerBySeat\[id\] = \{ el: surface\.el, manager, show: \(\) => manager\.enter\(\) \}/);
  assert.match(view, /for \(const surface of Object\.values\(taskManagerBySeat\)\) surface\.manager\.setAvailability\(kanbanGate\)/);
  assert.match(view, /token\.type === WB_TYPES\.commons && token\.tab === 'kanban'/);
  assert.doesNotMatch(view, /\{ id: 'kanban', label:/);
  assert.match(view, /if \(painterReady\) \{\s*seenConfig = '';\s*seenRecord = '';\s*paint\(\);/);
  // Every loop that pushes a reading walks the seats that exist, never the four names.
  assert.doesNotMatch(view, /Object\.values\(teamCommons\)/);
});

test('the Docs shelf names the panel it controls and moves by arrow', async () => {
  const docs = await source('public/js/docs.js');
  assert.match(docs, /import \{ nextTabIndex \} from '\.\/workspace-tabs\.js'/, 'one engine, reused');
  assert.match(docs, /list\.setAttribute\('role', 'tabpanel'\)/);
  assert.match(docs, /b\.setAttribute\('aria-controls', list\.id\)/);
  assert.match(docs, /if \(on\) list\.setAttribute\('aria-labelledby', b\.id\)/);
  assert.match(docs, /b\.tabIndex = on \? 0 : -1/);
  assert.match(docs, /pills\.addEventListener\('keydown'/);
});

test('one selected treatment: kaki, and the orphaned Home strip is gone', async () => {
  const [style, campaignHome] = await Promise.all([source('public/style.css'), source('public/css/campaign-home.css')]);
  assert.match(style, /\.dc-pill\[aria-selected='true'\][^}]*border-color: var\(--kaki\)/);
  assert.match(style, /#phone \.ph-seg-item\[aria-current='page'\][^}]*border-color: var\(--kaki\)/);
  assert.match(campaignHome, /\.cv-pill\[aria-pressed='true'\][^}]*border-color: var\(--kaki\)/);
  // ~120 lines no module rendered; its edge-mask treatment lives in the Kit's tab set now.
  assert.doesNotMatch(style, /home-tabs|home-tabrow|home-x/);
});

test('a tab with nothing to count carries no badge, so no pill trails its label', async () => {
  const [tabs, kit] = await Promise.all([source('public/js/workspace-tabs.js'), source('public/workspace-kit.css')]);
  // The badge has fill, padding and a pill radius; left visible while empty it reads as a
  // dash after the label on every tab that never reports a count.
  const built = tabs.slice(tabs.indexOf("const badge = node('span', 'wk-tabset-badge')"), tabs.indexOf('button.append('));
  assert.match(built, /badge\.hidden = true;/, 'a badge starts hidden and is shown only by setBadge');
  assert.match(kit, /\.wk-tabset-badge\[hidden\], \.wk-tabset-badge:empty \{ display: none; \}/);
  // The corner mark stands in for a tab that needs attention but has no number, so it
  // must answer to an empty badge as well as a hidden one.
  assert.match(kit, /:has\(\.wk-tabset-badge\[hidden\], \.wk-tabset-badge:empty\) \.wk-tabset-dot/);
});

test('choosing a tab enters it, even on a surface nobody calls enter() on', async () => {
  const tabs = await source('public/js/workspace-tabs.js');
  // The Machine surface only ever calls select(); its rooms build on their first enter,
  // so a select that did not enter left every tab empty.
  assert.match(tabs, /if \(entered \|\| live\) chosen\.service\?\.enter\?\.\(context\)/);
  // The one select that must not enter is the construction select, or a page load fetches.
  const tail = tabs.slice(tabs.lastIndexOf('select(options.selected'));
  assert.match(tail, /select\(options\.selected \?\? firstSelectable\(\)\);\s*live = true;/);
});

test('the Machine surface reaches its rooms through select alone', async () => {
  const [campaign, commons] = await Promise.all([source('public/js/campaign-view.js'), source('public/js/cowork-commons.js')]);
  assert.match(campaign, /show: \(\) => surface\.select\(surface\.current\(\) \|\| 'themes'\)/);
  // Each room is built by `once` on its first enter, which is what select must trigger.
  assert.match(commons, /const once = \(build\) => \{/);
  assert.match(commons, /const enterAll = \(rooms\) => \(\) => \{ for \(const r of rooms\(\) \|\| \[\]\) r\?\.enter\?\.\(\); \}/);
  assert.match(commons, /panel: services\[c\.id\]/);
});
