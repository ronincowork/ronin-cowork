import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.hidden = false; this.className = ''; this.textContent = ''; this.classList = { add() {}, remove() {}, toggle() {} }; }
  append(...nodes) { this.children.push(...nodes.filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, event = {}) { for (const callback of this.listeners[name] || []) callback({ currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
  find(predicate) { return [...this.walk()].filter(predicate); }
  querySelector() { return null; }
  focus() {}
  click() { this.dispatch('click'); }
}
globalThis.document = { createElement: (tag) => new FakeNode(tag) };

const { newWorkGroups, boardChoices } = await import('../public/js/work-readings.js');
const { createWorkNav, dragItem } = await import('../public/js/work-nav.js');

const item = (id, fields = {}) => ({ id, title: `Item ${id}`, stage: 'IDEA', parent: 'w1', trail: [{ op: 'create' }], ...fields });

test('New work reads four groups off the unassigned common-board items: Ideas and Plan by stage, Parked by release', () => {
  const groups = newWorkGroups([
    item('w2'),
    item('w3', { stage: 'PLAN' }),
    item('w4', { trail: [{ op: 'create' }, { op: 'assign' }, { op: 'release' }] }),
    item('w5', { trail: [{ op: 'create' }, { op: 'holder-ended' }], stage: 'PLAN' }),
    item('w6', { stage: 'BUILD' }),
  ]);
  assert.deepEqual(groups.map((group) => [group.id, group.items.map((row) => row.id)]), [
    ['issues', []],
    ['ideas', ['w2']],
    ['plan', ['w3']],
    ['parked', ['w4', 'w5']],
  ]);
});

test('manual assign offers the boards (roots and items with children), never the item itself', () => {
  const items = [
    { id: 'w1', title: 'Common', parent: null },
    { id: 'w2', title: 'Surface', parent: null },
    { id: 'w3', title: 'Phase', parent: 'w2' },
    { id: 'w4', title: 'Leaf', parent: 'w3' },
  ];
  assert.deepEqual(boardChoices(items, 'w4'), [{ id: 'w1', label: 'Common' }, { id: 'w2', label: 'Surface' }, { id: 'w3', label: 'Phase' }]);
  assert.deepEqual(boardChoices(items, 'w2').map((row) => row.id), ['w1', 'w3']);
});

test('the work navigation bar draws one stone per action it is handed and carries no meaning of its own', async () => {
  const seen = [];
  const bare = createWorkNav({ add: () => seen.push('add') });
  assert.deepEqual(bare.el.find((node) => node.dataset.nav).map((node) => node.dataset.nav), ['add']);

  const nav = createWorkNav({
    add: () => seen.push('add'),
    autoAssign: (id) => seen.push(`auto ${id}`),
    manualAssign: { choices: async (id) => [{ id: 'w1', label: 'Common' }, { id: 'w9', label: `not ${id}` }], pick: (id, board) => seen.push(`move ${id} ${board.id}`) },
    requestUpdate: (id) => seen.push(`update ${id}`),
  });
  const stones = Object.fromEntries(nav.el.find((node) => node.dataset.nav).map((node) => [node.dataset.nav, node]));
  assert.deepEqual(Object.keys(stones), ['add', 'auto', 'manual', 'update']);
  const carrying = (id) => ({ dataTransfer: { getData: () => id } });
  stones.add.click();
  stones.auto.dispatch('drop', carrying('w4'));
  stones.update.dispatch('drop', carrying('w4'));
  stones.auto.dispatch('drop', carrying(''));
  stones.manual.dispatch('drop', carrying('w4'));
  await new Promise((resolve) => setImmediate(resolve));
  const choices = nav.el.find((node) => node.className === 'wn-choice');
  assert.deepEqual(choices.map((node) => node.textContent), ['Common', 'not w4'], 'the list is the labels it was handed, nothing else');
  choices[0].click();
  assert.deepEqual(seen, ['add', 'auto w4', 'update w4', 'move w4 w1']);

  let dragged = '';
  dragItem('w7').events.dragstart({ dataTransfer: { setData: (_type, id) => { dragged = id; } } });
  assert.equal(dragged, 'w7');
});

test('New work is a new card on the Cowork and Desk profiles; nothing that was there leaves', async () => {
  const catalog = await readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8');
  for (const profile of ['cowork', 'desk']) {
    const list = catalog.match(new RegExp(`profiles\\.define\\(WORKBENCH_PROFILES\\.${profile}, \\[([^\\]]*)\\]`))[1];
    for (const type of ['kanban', 'workItems', 'roster', 'newWork']) assert.match(list, new RegExp(`WORKBENCH_TYPES\\.${type}\\b`), `${profile} offers ${type}`);
  }
});
