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
  querySelectorAll(selector) { return [...this.walk()].filter((node) => selector === '[data-sws-id]' && node.dataset.swsId); }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  click() { for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
}

globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createTextNode: (text) => Object.assign(new FakeNode('#text'), { textContent: text }) };

const { createStoneWorkSurface } = await import('../public/js/stone-work-surface.js');

test('shared stone surface selects, refreshes, opens external detail, and restores focus on Escape', () => {
  const rendered = [];
  const surface = createStoneWorkSurface({
    items: [{ id: 'one', label: 'One', secondary: '/one', state: 'ready' }, { id: 'two', label: 'Two' }],
    renderDetail: (item, host) => { rendered.push(item.id); host.append(new FakeNode('article')); },
  });
  const host = new FakeNode('div');
  const before = new FakeNode('p');
  const after = new FakeNode('small');
  surface.mount(host, { before: [before], after: [after] });
  assert.match(host.className, /\bsws-host\b/);
  assert.deepEqual(host.children, [before, surface.el, after]);
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

test('consumers cannot override the shared hidden detail or stone geometry', async () => {
  const css = await readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.sp-work-surface \.sws-detail/);
  assert.match(css, /\.wk-surface:not\(\[data-flush='true'\]\) > \.wk-surface-content\.sws-host \{ padding: var\(--space-6\) var\(--space-11\); \}/);
  assert.match(css, /\.sws \{[^}]*gap: var\(--space-11\)/);
  assert.match(css, /@media \(max-width: 700px\) \{\s*\.wk-surface:not\(\[data-flush='true'\]\) > \.wk-surface-content\.sws-host \{ padding-inline: var\(--space-6\); \}\s*\.sws \{ gap: var\(--space-6\); \}/);
  assert.doesNotMatch(css, /\.setup-provider-stones \.sws-(?:rail|grid|detail)/);
  assert.doesNotMatch(css, /\.setup-roots-stones \.sws-(?:rail|grid|detail)/);
});
