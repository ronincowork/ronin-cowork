import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.className = ''; this.hidden = false; this.classList = { add() {}, remove() {}, toggle() {} }; }
  append(...nodes) { for (const node of nodes.flat().filter((node) => node != null && node !== '')) { if (node instanceof FakeNode) { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; } this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  dispatch(name, event = {}) { for (const callback of this.listeners[name] || []) callback({ currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { this.dispatch('click'); }
  focus() {}
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((node) => node !== this); this.parent = null; } }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  find(predicate) { return [...this.walk()].filter(predicate); }
  all(cls) { return this.find((node) => String(node.className).split(' ').includes(cls)); }
  querySelector() { return null; }
  get textContent() { return this._text + this.children.map((node) => (typeof node === 'string' ? node : node.tagName === 'WBR' ? '' : node.textContent)).join(''); }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createDocumentFragment: () => new FakeNode('#fragment'), querySelector: () => null, head: { append() {} }, activeElement: null };

const { newWorkGroups, boardChoices, boardTree, boardStages, holderName } = await import('../public/js/work-readings.js');
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

test('Work reads the boards as the root items, each with its tree and a count of everything under it', () => {
  const tree = boardTree([
    { id: 'w1', parent: null }, { id: 'w2', parent: 'w1' }, { id: 'w3', parent: 'w2' }, { id: 'w4', parent: 'w1' }, { id: 'w5', parent: null },
  ]);
  const shape = (branch) => [branch.item.id, branch.size, branch.items.map(shape)];
  assert.deepEqual(tree.map(shape), [['w1', 3, [['w2', 1, [['w3', 0, []]]], ['w4', 0, []]]], ['w5', 0, []]]);
  assert.deepEqual(['agent:ann', 'team:crew', ''].map(holderName), ['ann', 'crew', '']);
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
  const choices = nav.el.all('ask-opt');
  assert.deepEqual(choices.map((node) => node.all('ask-name')[0].textContent), ['Common', 'not w4'], 'the choices are the labels it was handed, drawn by the one selector');
  choices[0].click();
  assert.deepEqual(seen, ['add', 'auto w4', 'update w4', 'move w4 w1']);

  let dragged = '';
  dragItem('w7').events.dragstart({ dataTransfer: { setData: (_type, id) => { dragged = id; } } });
  assert.equal(dragged, 'w7');
});

test('New work and Work are new cards on the Cowork and Desk profiles; nothing that was there leaves', async () => {
  const catalog = await readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8');
  for (const profile of ['cowork', 'desk']) {
    const list = catalog.match(new RegExp(`profiles\\.define\\(WORKBENCH_PROFILES\\.${profile}, \\[([^\\]]*)\\]`))[1];
    for (const type of ['kanban', 'workItems', 'roster', 'newWork', 'work']) assert.match(list, new RegExp(`WORKBENCH_TYPES\\.${type}\\b`), `${profile} offers ${type}`);
  }
});

test('Work items reads each board\'s items (every descendant) by stage, keeping only the stages it has', () => {
  const read = boardStages([
    { id: 'w1', parent: null, stage: 'IDEA' }, { id: 'w2', parent: 'w1', stage: 'IDEA' }, { id: 'w3', parent: 'w2', stage: 'BUILD' },
    { id: 'w4', parent: null, stage: 'PLAN' }, { id: 'w5', parent: 'w4', stage: 'DONE' }, { id: 'w6', parent: null, stage: 'IDEA' },
  ], ['IDEA', 'PLAN', 'BUILD', 'REVIEW', 'LAND', 'DONE']);
  assert.deepEqual(read.map((row) => [row.board.id, row.size, row.stages.map((stage) => [stage.stage, stage.items.map((item) => item.id)])]), [
    ['w1', 2, [['IDEA', ['w2']], ['BUILD', ['w3']]]],
    ['w4', 1, [['DONE', ['w5']]]],
    ['w6', 0, []],
  ]);
});
