import test from 'node:test';
import assert from 'node:assert/strict';
import { applySettlement, settlementPlan, type ResidueObservation } from '../src/desks/settlement.js';

const fixture: ResidueObservation[] = [
  { id: 'contained', kind: 'ref', managed: true, contained_in_working: true },
  { id: 'stale-row', kind: 'registry', managed: true, exists: false },
  { id: 'stale-assignment', kind: 'assignment', managed: true, exists: false },
  { id: 'empty', kind: 'directory', managed: true, empty: true },
  { id: 'candidate', kind: 'candidate', managed: true, contained_in_working: true },
  { id: 'island', kind: 'ref', managed: true, contains_unique_commits: true },
  { id: 'dirty', kind: 'worktree', managed: true, dirty: true },
  { id: 'checkout', kind: 'ref', managed: false, contained_in_working: true },
];

test('audit-derived fixture classes separate mechanical residue from custody work', () => {
  const plan = settlementPlan(fixture);
  assert.deepEqual(plan.safe.map((x) => [x.id, x.classification, x.action]), [
    ['contained', 'contained_ref', 'delete_ref'],
    ['stale-row', 'stale_registry_row', 'remove_row'],
    ['stale-assignment', 'stale_assignment', 'remove_row'],
    ['empty', 'empty_scaffold', 'remove_directory'],
    ['candidate', 'abandoned_candidate', 'remove_candidate'],
  ]);
  assert.deepEqual(plan.untouched.map((x) => [x.id, x.classification]), [
    ['island', 'unique_ref'], ['dirty', 'dirty_worktree'], ['checkout', 'user_checkout'],
  ]);
});

test('settlement dry-run mutates nothing; --yes applies only proven mechanical items', async () => {
  const calls: string[] = [];
  const dry = await applySettlement(fixture, async (item) => { calls.push(item.id); }, false);
  assert.deepEqual(calls, []);
  assert.equal(dry.applied.length, 0);
  const live = await applySettlement(fixture, async (item) => { calls.push(item.id); }, true);
  assert.deepEqual(calls, ['contained', 'stale-row', 'stale-assignment', 'empty', 'candidate']);
  assert.deepEqual(live.untouched.map((x) => x.id), ['island', 'dirty', 'checkout']);
});
