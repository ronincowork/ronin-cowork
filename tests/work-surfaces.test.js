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

const { boardChoices, boardTree, boardStages, holderName } = await import('../public/js/work-readings.js');

test('the Add form offers the boards (roots and items with children), never the item itself', () => {
  const items = [
    { id: 'w1', title: 'Unfiled', parent: null },
    { id: 'w2', title: 'Surface', parent: null },
    { id: 'w3', title: 'Phase', parent: 'w2' },
    { id: 'w4', title: 'Leaf', parent: 'w3' },
  ];
  assert.deepEqual(boardChoices(items, 'w4'), [{ id: 'w1', label: 'Unfiled' }, { id: 'w2', label: 'Surface' }, { id: 'w3', label: 'Phase' }]);
  assert.deepEqual(boardChoices(items, 'w2').map((row) => row.id), ['w1', 'w3']);
});

test('the boards are the root items, each with its tree and a count of everything under it', () => {
  const tree = boardTree([
    { id: 'w1', parent: null }, { id: 'w2', parent: 'w1' }, { id: 'w3', parent: 'w2' }, { id: 'w4', parent: 'w1' }, { id: 'w5', parent: null },
  ]);
  const shape = (branch) => [branch.item.id, branch.size, branch.items.map(shape)];
  assert.deepEqual(tree.map(shape), [['w1', 3, [['w2', 1, [['w3', 0, []]]], ['w4', 0, []]]], ['w5', 0, []]]);
  assert.deepEqual(['agent:ann', 'team:crew', ''].map(holderName), ['ann', 'crew', '']);
});

test('the Cowork and Desk selectors offer one work-item card, Work items; the Team keeps the old board beside it', async () => {
  const catalog = await readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8');
  const offered = (profile) => catalog.match(new RegExp(`profiles\\.define\\(WORKBENCH_PROFILES\\.${profile}, \\[([^\\]]*)\\]`))[1];
  for (const profile of ['cowork', 'desk']) {
    assert.match(offered(profile), /WORKBENCH_TYPES\.workViews\b/);
    for (const gone of ['kanban', 'workItems', 'newWork', 'work']) assert.doesNotMatch(offered(profile), new RegExp(`WORKBENCH_TYPES\\.${gone}\\b`), `${profile} no longer offers ${gone}`);
  }
  assert.match(offered('team'), /WORKBENCH_TYPES\.workViews\b/);
  assert.match(offered('team'), /WORKBENCH_TYPES\.workItems\b/);
  assert.doesNotMatch(offered('team'), /WORKBENCH_TYPES\.kanban\b/);
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
