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

test('consumers cannot override the shared hidden detail or stone geometry', async () => {
  const css = await readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.sp-work-surface \.sws-detail/);
  assert.match(css, /\.wk-surface-content\.sws-host \{[^}]*padding: var\(--space-6\) var\(--space-11\);[^}]*container: stone-work-surface-seat/);
  assert.match(css, /\.sws \{[^}]*gap: var\(--space-11\)/);
  assert.match(css, /\.sws-host \{[^}]*--sws-header-height: clamp\(6rem, 15dvh, 9rem\)[^}]*gap: 0/);
  assert.match(css, /\.sws-header \{[^}]*flex: 0 0 var\(--sws-header-height\)[^}]*block-size: var\(--sws-header-height\)[^}]*overflow: auto/);
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
