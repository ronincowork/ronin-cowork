import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough DOM for a kit action: classes, attributes and listeners that can be fired.
class FakeNode {
  constructor() { this.attributes = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.className = ''; this.disabled = false;
    const classes = new Set(); this.classList = { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, event = {}) { return (this.listeners[type] || []).map((fn) => fn({ type, ...event })); }
  append() {}
}
globalThis.document = { createElement: () => new FakeNode() };
const { WorkspacePrimitives } = await import('../public/js/workspace-primitives.js');

test('a kit button looks pressed the moment it is pushed, and lets go after a beat', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { el } = WorkspacePrimitives.createAction({ label: 'Go', action: () => {} });
  el.fire('pointerdown');
  assert.equal(el.classList.contains('pressed'), true, 'at once, before the action');
  t.mock.timers.tick(250);
  assert.equal(el.classList.contains('pressed'), false);
  // A key has no way down: its click flashes instead.
  el.fire('click', { detail: 0 });
  assert.equal(el.classList.contains('pressed'), true);
  t.mock.timers.tick(250);
  // A disabled button does not pretend.
  el.disabled = true;
  el.fire('pointerdown');
  assert.equal(el.classList.contains('pressed'), false);
});

test('an action that takes a while keeps its button busy, and ignores the repeat press', async () => {
  let calls = 0;
  let finish;
  const { el } = WorkspacePrimitives.createAction({ label: 'Save', action: () => { calls++; return new Promise((r) => { finish = r; }); } });
  const [pending] = el.fire('click', { detail: 1 });
  assert.equal(el.getAttribute('aria-busy'), 'true');
  el.fire('click', { detail: 1 });
  assert.equal(calls, 1, 'the second press is the same press again');
  finish();
  await pending;
  assert.equal(el.getAttribute('aria-busy'), null, 'settled: busy clears');
  el.fire('click', { detail: 1 });
  assert.equal(calls, 2);
  // A sync action never goes busy.
  const quick = WorkspacePrimitives.createAction({ label: 'Now', action: () => {} }).el;
  quick.fire('click', { detail: 1 });
  assert.equal(quick.getAttribute('aria-busy'), null);
});
