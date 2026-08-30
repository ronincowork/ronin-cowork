import test from 'node:test';
import assert from 'node:assert/strict';
import {
  declareArrangement, defaultArrangement, normalizeArrangement, visibleColumns, toggleSlot,
  moveSlot, resizeSlot, yieldingNeighbour, widthClass, migrateWorkbenchState,
} from '../public/js/workspace-arrangement.js';

/**
 * The arrangement's contract, with slots named a·b·c·d and no team import — half of
 * leg 1's non-hackery test (wip/buildouts/TEAM_WORKBENCH.md): nothing here knows what a
 * slot holds.
 */
const DECL = { slots: [{ name: 'a', width: 40 }, { name: 'b', width: 20, min: 6, compact: 176 }, { name: 'c', width: 40 }] };
const near = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 0.01, `${msg}: ${actual} ≠ ${expected}`);

test('a declaration fills unsized slots from the remainder and rescales to 100', () => {
  const { slots } = declareArrangement({ slots: ['a', { name: 'b', width: 50 }, 'c'] });
  assert.deepEqual(slots.map((s) => s.name), ['a', 'b', 'c']);
  near(slots[1].width, 50, 'b keeps its share');
  near(slots[0].width, 25, 'a takes half the remainder');
  assert.equal(slots[0].min, 15);
  assert.equal(slots[0].label, 'a');
});

test('a declaration refuses to be empty and drops duplicates', () => {
  assert.throws(() => declareArrangement({ slots: [] }));
  assert.equal(declareArrangement({ slots: ['a', 'a', 'b'] }).slots.length, 2);
});

test('normalize drops unknown names, appends missing ones, and never hides everything', () => {
  const state = normalizeArrangement({ order: ['c', 'zzz', 'a'], hidden: ['a', 'b', 'c'], widths: { a: 1, c: 90 } }, DECL);
  assert.deepEqual([...state.order], ['c', 'a', 'b']);
  assert.deepEqual([...state.hidden], []);
  assert.equal(state.widths.a, 15, 'a is lifted to its floor');
  assert.equal(state.widths.c, 70, 'c is capped');
  near(state.widths.b, 20, 'b takes the declared default');
});

test('toggle hides and shows, and refuses the last visible slot', () => {
  let state = defaultArrangement(DECL);
  state = toggleSlot(state, 'b');
  assert.deepEqual([...state.hidden], ['b']);
  state = toggleSlot(state, 'a');
  assert.deepEqual([...state.hidden], ['b', 'a']);
  const refused = toggleSlot(state, 'c');
  assert.equal(refused, state, 'c is the last one standing');
  state = toggleSlot(state, 'b');
  assert.deepEqual([...state.hidden], ['a']);
  assert.equal(toggleSlot(state, 'nope'), state);
});

test('visible columns rescale to 100 and a re-shown slot keeps the width it had', () => {
  let state = defaultArrangement(DECL);
  state = toggleSlot(state, 'b');
  const two = visibleColumns(state, DECL);
  assert.deepEqual(two.map((c) => c.name), ['a', 'c']);
  near(two[0].width + two[1].width, 100, 'two columns fill the row');
  near(two[0].width, 50, 'equal shares');
  state = toggleSlot(state, 'b');
  near(visibleColumns(state, DECL)[1].width, 20, 'b returns at 20');
});

test('move reorders by name, clamps the index, and is a no-op in place', () => {
  const state = defaultArrangement(DECL);
  assert.deepEqual([...moveSlot(state, 'c', 0).order], ['c', 'a', 'b']);
  assert.deepEqual([...moveSlot(state, 'a', 99).order], ['b', 'c', 'a']);
  assert.equal(moveSlot(state, 'a', 0), state);
  assert.equal(moveSlot(state, 'nope', 1), state);
  const moved = moveSlot(state, 'c', 0);
  near(moved.widths.c, 40, 'a moved slot carries its width');
});

test('the yielding neighbour is the one toward the middle', () => {
  const state = defaultArrangement(DECL);
  assert.equal(yieldingNeighbour(state, 'a'), 'b');
  assert.equal(yieldingNeighbour(state, 'c'), 'b');
  assert.equal(yieldingNeighbour(state, 'b'), 'c');
  const solo = toggleSlot(toggleSlot(state, 'a'), 'b');
  assert.equal(yieldingNeighbour(solo, 'c'), '');
});

test('resize is symmetric: the same pull on either workspace moves it by the same amount', () => {
  const state = defaultArrangement(DECL);
  const left = resizeSlot(state, 'a', 48, DECL);
  const right = resizeSlot(state, 'c', 48, DECL);
  near(left.widths.a, 48, 'a grew');
  near(left.widths.b, 12, 'b yielded to a');
  near(right.widths.c, 48, 'c grew');
  near(right.widths.b, 12, 'b yielded to c');
  near(left.widths.c, 40, 'the far side did not move');
});

test('resize is trimmed by the floors and the cap, never refused', () => {
  const state = defaultArrangement(DECL);
  const pushed = resizeSlot(state, 'a', 90, DECL);
  near(pushed.widths.a, 54, 'a stops where b reaches its floor of 6');
  near(pushed.widths.b, 6, 'b at its floor');
  const shrunk = resizeSlot(state, 'a', 1, DECL);
  near(shrunk.widths.a, 15, 'a stops at its own floor');
  near(shrunk.widths.b, 45, 'b took the rest');
  assert.equal(resizeSlot(state, 'a', 40, DECL), state, 'no change is the same state');
  const hiddenB = toggleSlot(state, 'b');
  assert.equal(resizeSlot(hiddenB, 'b', 30, DECL), hiddenB, 'a hidden slot is not resized');
});

test('the roster can get quite thin: a 6% floor and a compact width class', () => {
  const state = resizeSlot(defaultArrangement(DECL), 'b', 1, DECL);
  near(state.widths.b, 6, 'b at six');
  const column = visibleColumns(state, DECL).find((c) => c.name === 'b');
  assert.equal(widthClass(150, column.compact), 'compact');
  assert.equal(widthClass(200, column.compact), 'full');
  assert.equal(widthClass(150, 0), 'full', 'no threshold, never compact');
});

test('the old workbench state migrates once, by position', () => {
  const migrated = migrateWorkbenchState({ widths: { left: 30, right: 50 }, surfaces: { terminalTile: false, kanban: true, channels: false } }, DECL);
  assert.deepEqual([...migrated.order], ['a', 'b', 'c']);
  assert.deepEqual([...migrated.hidden], ['b']);
  near(migrated.widths.a, 30, 'left became the first slot');
  near(migrated.widths.c, 50, 'right became the last slot');
  near(migrated.widths.b, 20, 'the middle took what was left');
  assert.deepEqual(migrateWorkbenchState(null, DECL), defaultArrangement(DECL));
  // The shell's default state: null widths are ABSENT, never zero (zero would clamp the
  // workspaces to their floors and hand the middle everything — measured 15/70/15).
  const nulls = migrateWorkbenchState({ widths: { left: null, right: null }, surfaces: { terminalTile: false, kanban: false, channels: false } }, DECL);
  assert.deepEqual(nulls.widths, defaultArrangement(DECL).widths);
  assert.deepEqual(migrateWorkbenchState({}, DECL), defaultArrangement(DECL));
  const already = migrateWorkbenchState({ order: ['c', 'b', 'a'], hidden: [], widths: {} }, DECL);
  assert.deepEqual([...already.order], ['c', 'b', 'a'], 'an arrangement passes through normalize untouched');
});

test('a persisted former default follows the new default, but owner changes do not', () => {
  const declaration = { ...DECL, priorDefaultOrders: [['a', 'c', 'b']] };
  const oldDefault = { order: ['a', 'c', 'b'], hidden: [], widths: { a: 40, b: 20, c: 40 } };
  assert.deepEqual(migrateWorkbenchState(oldDefault, declaration), defaultArrangement(declaration));
  const resized = { ...oldDefault, widths: { a: 35, b: 25, c: 40 } };
  assert.deepEqual([...migrateWorkbenchState(resized, declaration).order], ['a', 'c', 'b'], 'a resized former order belongs to the owner');
  const hidden = { ...oldDefault, hidden: ['b'] };
  assert.deepEqual([...migrateWorkbenchState(hidden, declaration).order], ['a', 'c', 'b'], 'a hidden former order belongs to the owner');
});
