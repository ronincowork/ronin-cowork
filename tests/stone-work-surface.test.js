import test from 'node:test';
import assert from 'node:assert/strict';

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
  const stones = surface.el.querySelectorAll('[data-sws-id]');
  stones[1].click();
  assert.equal(surface.selected(), 'two');
  assert.equal(surface.el.dataset.open, 'true');
  surface.refreshDetail();
  assert.deepEqual(rendered, ['two', 'two']);
  surface.openDetail({ id: 'new', label: 'Add' });
  assert.equal(surface.selected(), null);
  assert.equal(rendered.at(-1), 'new');
  let prevented = false;
  for (const callback of surface.el.listeners.keydown) callback({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(surface.el.dataset.open, 'false');
  assert.equal(surface.el.querySelectorAll('[data-sws-id]')[1].focused, true);
});
