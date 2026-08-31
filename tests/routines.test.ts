import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoutineRow } from '../src/definitions.js';
import { resolveRoutines, routineChoices } from '../src/routines.js';

const row = (name: string): RoutineRow => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false, class: 'specialized',
  reading: [], sops: [], macros: [], actions: [], tools: [], mcp: [],
  requires: [],
});
const catalog = [row('ronin_base'), row('ronin_control'), row('machine')];

test('Campaign is the base and Team states exceptions without copying the list', () => {
  const got = resolveRoutines(catalog, { ronin_base: true, ronin_control: true }, {
    ronin_control: false,
    machine: true,
  });
  assert.deepEqual(got.map(({ name, enabled, stated_by }) => ({ name, enabled, stated_by })), [
    { name: 'ronin_base', enabled: true, stated_by: 'campaign' },
    { name: 'ronin_control', enabled: false, stated_by: 'team' },
    { name: 'machine', enabled: true, stated_by: 'team' },
  ]);
});

test('absence is inherit, then implicit off — never an invented default', () => {
  const got = resolveRoutines(catalog, {}, {});
  assert.ok(got.every((routine) => !routine.enabled && routine.stated_by === 'implicit_off'));
});

test('configuration accepts only named literal booleans', () => {
  assert.deepEqual(routineChoices({ ronin_base: true, machine: 'off', '../bad': false }), { ronin_base: true });
  assert.deepEqual(routineChoices(['ronin_base']), {});
});

test('dependencies grow additively: Services and Control require Base, not each other', () => {
  const additive = [
    row('ronin_base'),
    { ...row('ronin_services'), requires: ['ronin_base'] },
    { ...row('ronin_control'), requires: ['ronin_base'] },
  ];
  const control = resolveRoutines(additive, { ronin_base: false, ronin_control: true });
  assert.deepEqual(control.map(({ name, enabled, stated_by, required_by }) => ({ name, enabled, stated_by, required_by })), [
    { name: 'ronin_base', enabled: true, stated_by: 'dependency', required_by: ['ronin_control'] },
    { name: 'ronin_services', enabled: false, stated_by: 'implicit_off', required_by: [] },
    { name: 'ronin_control', enabled: true, stated_by: 'campaign', required_by: [] },
  ]);
  const services = resolveRoutines(additive, {}, { ronin_services: true });
  assert.equal(services.find((item) => item.name === 'ronin_base')?.enabled, true);
  assert.equal(services.find((item) => item.name === 'ronin_control')?.enabled, false);
});
