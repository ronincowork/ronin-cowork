import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.removed = false; }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, event = {}) { for (const callback of this.listeners[name] || []) callback({ currentTarget: this, preventDefault() {}, ...event }); }
  querySelectorAll(selector) { return [...this.walk()].filter((node) => selector === '[data-sws-id]' && node.dataset.swsId); }
  querySelector(selector) { return [...this.walk()].find((node) => selector === '.sws-state' && node.className === 'sws-state') || null; }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  click() { for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
}

globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => Object.assign(new FakeNode('#text'), { textContent: text }) };

const { createPhalanx } = await import('../public/js/phalanx.js');
const { createStatusMarker } = await import('../public/js/status-marker.js');

test('Phalanx selects, refreshes, opens external detail, and restores focus on Escape', () => {
  const rendered = [];
  const surface = createPhalanx({
    items: [{ id: 'one', label: 'One', secondary: '/one', state: 'ready' }, { id: 'two', label: 'Two' }],
    renderDetail: (item, host) => { rendered.push(item.id); host.append(new FakeNode('article')); },
  });
  const host = new FakeNode('div'); host.className = 'wk-surface-content';
  const before = new FakeNode('p');
  const after = new FakeNode('small');
  surface.mount(host, { before: [before], after: [after] });
  assert.match(host.className, /\bsws-host\b/);
  assert.equal(host.children[0].className, 'sws-header');
  assert.deepEqual(host.children[0].children, [before]);
  assert.equal(host.children[1], surface.el);
  assert.equal(host.children[2].className, 'sws-footer');
  assert.deepEqual(host.children[2].children, [after]);
  const stones = surface.el.querySelectorAll('[data-sws-id]');
  stones[1].click();
  assert.equal(surface.selected(), 'two');
  assert.equal(surface.el.dataset.open, 'true');
  assert.equal(surface.el.querySelectorAll('[data-sws-id]')[1].focused, true);
  surface.el.querySelectorAll('[data-sws-id]')[1].focused = false;
  surface.refreshDetail();
  assert.deepEqual(rendered, ['two', 'two']);
  assert.notEqual(surface.el.querySelectorAll('[data-sws-id]')[1].focused, true, 'programmatic refresh does not move focus');
  surface.openDetail({ id: 'new', label: 'Add' });
  assert.equal(surface.selected(), null);
  assert.equal(rendered.at(-1), 'new');
  let prevented = false;
  for (const callback of surface.el.listeners.keydown) callback({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(surface.el.dataset.open, 'false');
  assert.equal(surface.el.querySelectorAll('[data-sws-id]')[1].focused, true);
});

test('stone state can update without disposing or reconstructing an open detail', () => {
  let renders = 0;
  const surface = createPhalanx({
    items: [{ id: 'one', label: 'One', state: 'waiting' }],
    renderDetail: (_item, host) => { renders += 1; host.append(new FakeNode('article')); },
  });
  surface.select('one');
  const stone = surface.el.querySelectorAll('[data-sws-id]')[0];
  surface.updateItems([{ id: 'one', state: 'ready', disabled: true }]);
  assert.equal(renders, 1);
  assert.equal(stone.disabled, true);
  assert.equal(stone.querySelector('.sws-state').textContent, 'ready');
});

test('grouping is explicit, ordered, and keeps item activation and group events in the common surface', () => {
  let activated = '';
  let dropped = '';
  const plain = createPhalanx({ items: [{ id: 'one', label: 'One', group: 'Ideas' }] });
  const plainGrid = plain.el.children[0].children[0].children;
  assert.deepEqual(plainGrid.map((node) => node.className), ['sws-group sws-group-heading', 'sws-stone'], 'ungrouped consumers keep inline headings');
  const grouped = createPhalanx({
    grouped: { groups: [
      { id: 'IDEA', label: 'Ideas', events: { drop: (_event, group) => { dropped = group.id; } } },
      { id: 'DONE', label: 'Done' },
    ] },
    items: [{ id: 'one', label: 'One', group: 'IDEA', action: (item) => { activated = item.id; } }],
  });
  const groups = grouped.el.children[0].children[0].children;
  assert.deepEqual(groups.map((group) => group.dataset.swsGroup), ['IDEA', 'DONE']);
  assert.equal(groups[0].children[2].children[0].className, 'sws-stone');
  groups[0].children[2].children[0].click();
  assert.equal(activated, 'one');
  assert.equal(grouped.selected(), null, 'an externally handled stone does not open an internal detail');
  groups[0].dispatch('drop');
  assert.equal(dropped, 'IDEA');
  grouped.setDensity('compact');
  assert.equal(grouped.el.dataset.density, 'compact');
});

test('shared status markers are compact, token-driven, and can be placed on any stone', async () => {
  const marker = createStatusMarker('beta');
  const surface = createPhalanx({ items: [{ id: 'one', label: 'One', marker }] });
  assert.equal(surface.el.querySelectorAll('[data-sws-id]')[0].children[1], marker);
  assert.equal(marker.textContent, 'Beta');
  assert.equal(marker.dataset.status, 'beta');
  const css = await readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8');
  assert.match(css, /\.status-marker \{[^}]*color: var\(--kaki\);[^}]*font-size: var\(--text-1\)/);
  assert.match(css, /\.status-marker::before \{[^}]*width: var\(--space-1\);[^}]*background: currentColor/);
  assert.doesNotMatch(css, /\.status-marker \{[^}]*border(?:-radius)?:/);
  assert.match(css, /\.sws-stone > \.status-marker \{[^}]*position: absolute;[^}]*inset-block-start: var\(--space-4\);[^}]*inset-inline-end: var\(--space-4\)/);
});

test('consumers cannot override the shared hidden detail or stone geometry', async () => {
  const css = await readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.sp-work-surface \.sws-detail/);
  assert.match(css, /\.wk-surface-content\.sws-host \{[^}]*padding: var\(--space-6\) var\(--space-11\);[^}]*container: stone-work-surface-seat/);
  assert.match(css, /\.sws \{[^}]*gap: var\(--space-11\)/);
  assert.match(css, /\.sws-host \{[^}]*--sws-header-height: clamp\(6rem, 15dvh, 9rem\)[^}]*gap: 0/);
  assert.match(css, /\.sws-header \{[^}]*flex: 0 0 var\(--sws-header-height\)[^}]*align-items: flex-start[^}]*block-size: var\(--sws-header-height\)[^}]*overflow: auto/);
  assert.match(css, /\.sws-host:has\(> \.sws\[data-open='true'\]\) > \.sws-header \{ display: none; \}/);
  assert.match(css, /\.sws:not\(\[data-open='true'\]\) \.sws-rail \{[^}]*align-items: flex-start[^}]*justify-content: center[^}]*\}/);
  assert.doesNotMatch(css, /\.sws:not\(\[data-open='true'\]\) \.sws-rail \{[^}]*padding-top/);
  assert.match(css, /\.sws-stone \{[^}]*flex: 0 0 min\(100%, var\(--sws-stone\)\)[^}]*width: min\(100%, var\(--sws-stone\)\)/);
  assert.match(css, /@container stone-work-surface-seat \(max-width: 40rem\)[\s\S]*?\.wk-surface-content\.sws-host \{ padding-inline: var\(--space-6\); \}/);
  assert.match(css, /@container stone-work-surface-seat \(min-width: 44rem\)[\s\S]*?\.wk-surface-content\.sws-host \{ padding-inline: calc\(var\(--space-12\) \+ var\(--space-7\)\); \}/);
  assert.match(css, /\.sws\[data-open='true'\] \.sws-detail \{ max-width: 42rem; \}/);
  assert.match(css, /@container stone-work-surface-seat \(min-width: 64rem\)[\s\S]*?\.wk-surface-content\.sws-host \{ padding-inline: calc\(var\(--space-12\) \* 2\); \}/);
  assert.match(css, /\.sws\[data-open='true'\] \{ gap: calc\(var\(--space-12\) \+ var\(--space-7\)\); \}/);
  assert.doesNotMatch(css, /\.setup-provider-stones \.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.sws-(?:rail|grid|detail)/);
});

test('stone states wrap complete account and provider names instead of truncating them', async () => {
  const css = await readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8');
  assert.match(css, /\.sws-state \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal/);
  assert.doesNotMatch(css, /\.sws-state \{[^}]*text-overflow: ellipsis/);
});

test('full density goes one level down into a stone with items; one way back from any depth keeps the density', () => {
  const rendered = [];
  const escape = (surface) => { for (const callback of surface.el.listeners.keydown) callback({ key: 'Escape', preventDefault() {} }); };
  const rail = (surface) => surface.el.querySelectorAll('[data-sws-id]').filter((node) => !String(node.className).includes('sws-branch-stone'));
  const tree = [{ id: 'g', label: 'G', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', items: [{ id: 'c', label: 'C' }] }] }, { id: 'h', label: 'H' }];
  const surface = createPhalanx({ items: tree, density: 'full', branches: 'column', renderDetail: (item) => { rendered.push(item.id); } });

  const branchIds = () => surface.el.querySelectorAll('[data-sws-id]').filter((node) => String(node.className).includes('sws-branch-stone')).map((node) => node.dataset.swsId);
  assert.deepEqual(branchIds(), ['a', 'b', 'c'], 'at rest every item shows under its stone');

  rail(surface)[0].click();
  assert.equal(surface.level().id, 'g');
  assert.equal(surface.selected(), null);
  assert.deepEqual(rail(surface).map((node) => node.dataset.swsId), ['a', 'b', 'c'], "the stone's items are the stones now");
  assert.equal(rendered.at(-1), 'g', 'the level owner is the detail until an item is pressed');
  rail(surface)[0].click();
  assert.equal(surface.selected(), 'a');
  assert.equal(rendered.at(-1), 'a');
  rail(surface)[0].click();
  assert.equal(surface.selected(), null, 'press-again deselects where you are');
  assert.equal(surface.level().id, 'g');
  rail(surface)[1].click();
  assert.equal(surface.selected(), 'b', 'a level is one level: an item with items selects');

  escape(surface);
  assert.equal(surface.level(), null);
  assert.equal(surface.selected(), null);
  assert.equal(surface.el.dataset.open, 'false');
  assert.equal(surface.el.dataset.density, 'full', 'back in the density you were in');

  surface.el.querySelectorAll('[data-sws-id]').find((node) => node.dataset.swsId === 'c').click();
  assert.equal(surface.level().id, 'g');
  assert.equal(surface.selected(), 'c', 'pressing an item at rest opens its level with it selected');
  surface.top();
  assert.equal(surface.level(), null);

  surface.setDensity('compact');
  rail(surface)[0].click();
  assert.equal(surface.selected(), 'g', 'compact selects; it does not go down');
  assert.equal(surface.level(), null);
  assert.deepEqual(branchIds(), [], 'compact draws no branches');
});

test('density switches the row and keeps the column: selection and level survive every toggle', () => {
  const rail = (surface) => surface.el.querySelectorAll('[data-sws-id]').filter((node) => !String(node.className).includes('sws-branch-stone'));
  const tree = [{ id: 'g', label: 'G', items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, { id: 'h', label: 'H', items: [] }];
  const surface = createPhalanx({ items: tree, density: 'compact', branches: 'column' });

  rail(surface)[0].click();
  assert.equal(surface.selected(), 'g');
  surface.setDensity('full');
  assert.equal(surface.level().id, 'g', 'compact-selected expands into its level');
  assert.equal(surface.selected(), null);
  rail(surface).find((node) => node.dataset.swsId === 'b').click();
  surface.setDensity('compact');
  assert.equal(surface.level(), null, 'a level compacts to its stone, selected');
  assert.equal(surface.selected(), 'g');
  surface.setDensity('full');
  assert.equal(surface.level().id, 'g');
  assert.equal(surface.selected(), 'b', 'the item open at the level comes back');
  surface.top();
  assert.equal(surface.el.dataset.density, 'full', 'the way back keeps the density');
  surface.setDensity('compact');
  assert.equal(surface.selected(), null, 'at rest stays at rest');
  rail(surface)[0].click();
  surface.setDensity('full');
  assert.equal(surface.selected(), null, 'after the way back the level opens without the old item');
});

test('a chart lays one column per child and folds a too-deep chart into counts until pressed', () => {
  const deep = Array.from({ length: 5 }, (_, index) => ({ id: `d${index}`, label: `D${index}` }));
  const surface = createPhalanx({ density: 'full', branches: 'chart', items: [{ id: 'board', label: 'Board', items: [{ id: 'x', label: 'X', items: deep }, { id: 'y', label: 'Y', items: [{ id: 'z', label: 'Z' }] }] }] });
  const branchIds = () => surface.el.querySelectorAll('[data-sws-id]').filter((node) => String(node.className).includes('sws-branch-stone')).map((node) => node.dataset.swsId);
  assert.deepEqual(branchIds(), ['x', 'y'], 'grandchildren fold into counts');
  const x = surface.el.querySelectorAll('[data-sws-id]').find((node) => node.dataset.swsId === 'x');
  assert.equal(x.children.at(-1).textContent, '+5');
  x.click();
  assert.deepEqual(branchIds(), ['x', 'd0', 'd1', 'd2', 'd3', 'd4', 'y'], 'pressing a folded child opens its column');
  assert.equal(surface.level(), null);
});
