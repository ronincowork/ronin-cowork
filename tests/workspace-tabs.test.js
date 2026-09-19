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
  assert.match(kit, /import \{ createTabbedSurface \} from '\.\/workspace-tabs\.js'/);
  assert.match(kit, /primitives: Object\.freeze\(\{ \.\.\.WorkspacePrimitives, createTabbedSurface \}\)/);
});

test('one select path serves click, keyboard and code, and panels build on first show', async () => {
  const tabs = await source('public/js/workspace-tabs.js');
  assert.match(tabs, /button\.addEventListener\('click', \(\) => select\(id\)\)/);
  assert.match(tabs, /if \(entry\.built\) return entry\.service;/);
  assert.match(tabs, /typeof declared === 'function' \? declared\(\) : declared/);
  // A watch feeds an off-screen tab's badge, so entering every panel is never the price
  // of keeping a counter truthful.
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
