import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoutineRow } from '../src/definitions.js';
import { completeRoutineChoices, resolveRoutines, routineChoices } from '../src/routines.js';
import { listRoutines } from '../src/definitions.js';

const row = (name: string): RoutineRow => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false, class: 'specialized',
  reading: [], sops: [], macros: [], actions: [], tools: [], mcp: [],
  requires: [],
});
const catalog = [row('ronin_base'), row('ronin_worktrees'), row('gbrain')];

test('a Team complete map replaces the Campaign map at birth', () => {
  const got = resolveRoutines(catalog, { ronin_base: true, ronin_worktrees: true }, {
    ronin_worktrees: false,
    gbrain: true,
  });
  assert.deepEqual(got.map(({ name, enabled, stated_by }) => ({ name, enabled, stated_by })), [
    { name: 'ronin_base', enabled: false, stated_by: 'implicit_off' },
    { name: 'ronin_worktrees', enabled: false, stated_by: 'team' },
    { name: 'gbrain', enabled: true, stated_by: 'team' },
  ]);
});

test('absence in the selected complete map is implicit off — never live inherit', () => {
  const got = resolveRoutines(catalog, {}, {});
  assert.ok(got.every((routine) => !routine.enabled && routine.stated_by === 'implicit_off'));
});

test('configuration accepts only named literal booleans', () => {
  assert.deepEqual(routineChoices({ ronin_base: true, gbrain: 'off', '../bad': false }), { ronin_base: true });
  assert.deepEqual(routineChoices(['ronin_base']), {});
});

test('Save completes a map against the current catalog', () => {
  assert.deepEqual(completeRoutineChoices(catalog, { ronin_base: true }), {
    ronin_base: true, ronin_worktrees: false, gbrain: false,
  });
});

test('a catalog routine added after Save resolves off without changing the stored map', () => {
  const stored = { ronin_base: true, ronin_worktrees: false };
  const expanded = [...catalog, row('future_routine')];
  assert.equal(resolveRoutines(expanded, stored).find((item) => item.name === 'future_routine')?.enabled, false);
  assert.deepEqual(stored, { ronin_base: true, ronin_worktrees: false });
});

test('dependencies grow additively: Services and Control require Base, not each other', () => {
  const additive = [
    row('ronin_base'),
    { ...row('ronin_services'), requires: ['ronin_base'] },
    { ...row('ronin_worktrees'), requires: ['ronin_base'] },
  ];
  const control = resolveRoutines(additive, { ronin_base: false, ronin_worktrees: true });
  assert.deepEqual(control.map(({ name, enabled, stated_by, required_by }) => ({ name, enabled, stated_by, required_by })), [
    { name: 'ronin_base', enabled: true, stated_by: 'dependency', required_by: ['ronin_worktrees'] },
    { name: 'ronin_services', enabled: false, stated_by: 'implicit_off', required_by: [] },
    { name: 'ronin_worktrees', enabled: true, stated_by: 'campaign', required_by: [] },
  ]);
  const services = resolveRoutines(additive, {}, { ronin_services: true });
  assert.equal(services.find((item) => item.name === 'ronin_base')?.enabled, true);
  assert.equal(services.find((item) => item.name === 'ronin_worktrees')?.enabled, false);
});

/**
 * THE LAYER SHAPE, asserted against the REAL catalog rather than a fixture.
 *
 * Routines stack in one direction: `ronin_base` is the floor of the selectable layers and
 * depends on nothing; every specialized Routine sits ON it. An arrow pointing the other way
 * — Base requiring a specialized Routine — silently promotes that Routine to the root of
 * the whole graph, since everything eventually requires Base. It then ships to every Agent
 * while still being labelled an optional pick, and its birth reading is charged to Agents
 * that never asked for it. That inversion shipped once, briefly, for `ronin_host`; this is
 * the test that stops it returning.
 */
test('the dependency graph points one way: nothing is required BY Ronin Base', async () => {
  const catalog = await listRoutines();
  const base = catalog.find((r) => r.name === 'ronin_base');
  assert.ok(base, 'ronin_base must exist');
  assert.deepEqual(base.requires, [], 'ronin_base is the floor of the selectable layers');
  for (const routine of catalog) {
    if (routine.name === 'ronin_base') continue;
    assert.deepEqual(routine.requires, ['ronin_base'],
      `${routine.name} must sit on Ronin Base, not beside or beneath it`);
  }
});

test('the restart tool lives with the host tools, and in exactly one Routine', async () => {
  const catalog = await listRoutines();
  const host = catalog.find((r) => r.name === 'ronin_host');
  assert.ok(host, 'ronin_host must exist');
  assert.ok(host.tools.includes('tejun-machine-restart'),
    'an Agent without the host tools has no business restarting anything');
  const carriers = catalog.filter((r) => r.tools.includes('tejun-machine-restart')).map((r) => r.name);
  assert.deepEqual(carriers, ['ronin_host'], 'one home, not two');
});

test('selecting a specialized Routine pulls Base in, the additive direction', () => {
  const real = [
    row('ronin_base'),
    { ...row('gbrain'), requires: ['ronin_base'] },
  ];
  const got = resolveRoutines(real, { gbrain: true });
  const base = got.find((item) => item.name === 'ronin_base');
  assert.equal(base?.enabled, true);
  assert.equal(base?.stated_by, 'dependency');
  assert.deepEqual(base?.required_by, ['gbrain']);
});
