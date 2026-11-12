import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough DOM for the kit list and its edit hold.
class FakeNode {
  constructor(name) { this.name = name; this.parent = null; this.childNodes = []; this.listeners = {}; this.isConnected = true; this.dataset = {}; }
  insertBefore(child, ref) { child.remove(); const at = ref ? this.childNodes.indexOf(ref) : -1; this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child); child.parent = this; }
  remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  replaceWith(other) { const p = this.parent; const i = p.childNodes.indexOf(this); this.remove(); p.childNodes.splice(i, 0, other); other.parent = p; }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  contains(node) { return node === this; }
  fire(type, event = {}) { for (const callback of this.listeners[type] || []) callback({ target: this, ...event }); }
  closest(selector) { return selector === '[data-ends-edit]' && 'endsEdit' in this.dataset ? this : null; }
}
globalThis.document = { activeElement: null };
const { createKeyedList } = await import('../public/js/workspace-primitives.js');
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a kept row under an unsent edit holds its redraw, and lands when the edit is sent or abandoned (KAN-414)', async () => {
  const drawn = [];
  const list = createKeyedList({ shows: (row) => row.title, draw: (row) => { drawn.push(row.title); return new FakeNode(row.title); } });
  const parent = new FakeNode('list');
  list.set(parent, [{ id: 'a', title: 'A1' }, { id: 'b', title: 'B1' }]);
  const a = parent.childNodes[0];
  a.fire('input');
  list.set(parent, [{ id: 'a', title: 'A2' }, { id: 'b', title: 'B2' }]);
  assert.deepEqual(drawn, ['A1', 'B1', 'B2'], 'the edited row is held; the other repaints');
  list.set(parent, [{ id: 'b', title: 'B2' }, { id: 'a', title: 'A3' }]);
  assert.deepEqual(parent.childNodes.map((n) => n.name), ['B2', 'A1'], 'a held row still moves with its order');
  const send = new FakeNode('send'); send.dataset.endsEdit = '';
  a.fire('click', { target: send });
  await tick();
  assert.deepEqual(drawn.at(-1), 'A3', 'a press on a data-ends-edit button lands the newest row at once');
  const a3 = parent.childNodes[1];
  a3.fire('input');
  list.set(parent, [{ id: 'b', title: 'B2' }, { id: 'a', title: 'A4' }]);
  a3.fire('reset');
  await tick();
  assert.equal(drawn.at(-1), 'A4', 'a reset (Cancel) lands it');
  const a4 = parent.childNodes[1];
  a4.fire('input');
  list.set(parent, [{ id: 'b', title: 'B2' }, { id: 'a', title: 'A5' }]);
  a4.fire('toggle', { target: { tagName: 'DETAILS', open: false } });
  await tick();
  assert.equal(drawn.at(-1), 'A5', 'a fold lands it');
  parent.childNodes[1].fire('input', { isTrusted: false });
  list.set(parent, [{ id: 'b', title: 'B2' }, { id: 'a', title: 'A6' }]);
  assert.equal(drawn.at(-1), 'A6', 'a scripted input is not an edit');
});
