import test from 'node:test';
import assert from 'node:assert/strict';

// The Team's Work line: one segment per stage, filled up to the item's stage, the current
// segment in its status colour, and the holder after it.
const node = (tag) => ({ tag, className: '', textContent: '', title: '', dataset: {}, children: [],
  setAttribute(name, value) { this[name] = value; }, append(...kids) { this.children.push(...kids); } });
globalThis.document = { createElement: node };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
const { itemLine, PROJECT_STAGES } = await import('../public/js/team-kanban.js');

test('a work item line fills the stage bar to its stage in its status colour', () => {
  const line = itemLine({ id: 'surface/8', title: 'Teams collection', stage: 'BUILD', status: 'red', holder: 'agent:surface_teams' }, { holder: 'surface_teams' });
  const [title, bar, holder] = line.children;
  assert.equal(title.textContent, 'Teams collection');
  assert.deepEqual(bar.children.map((segment) => segment.className), ['past', 'past', 'now red', '', '', '']);
  assert.equal(bar.children.length, PROJECT_STAGES.length);
  assert.equal(holder.textContent, '@surface_teams');
  const done = itemLine({ id: 'x', title: 'x', stage: 'DONE', status: 'yellow', holder: '' });
  assert.equal(done.children[1].children.at(-1).className, 'now green', 'Done reads as done whatever its last status');
  assert.equal(done.children[2].textContent, '', 'no holder, no name');
});
