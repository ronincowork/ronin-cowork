import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoutineRow } from '../src/definitions.js';
import { completeRoutineChoices, resolveRoutines, routineChoices } from '../src/routines.js';

const row = (name: string): RoutineRow => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false, class: 'specialized',
  reading: [], sops: [], macros: [], actions: [], tools: [], mcp: [],
  requires: [],
});
const catalog = [row('ronin_base'), row('ronin_control'), row('ronin_host')];

test('a Team complete map replaces the Campaign map at birth', () => {
  const got = resolveRoutines(catalog, { ronin_base: true, ronin_control: true }, {
    ronin_control: false,
    ronin_host: true,
  });
  assert.deepEqual(got.map(({ name, enabled, stated_by }) => ({ name, enabled, stated_by })), [
    { name: 'ronin_base', enabled: false, stated_by: 'implicit_off' },
    { name: 'ronin_control', enabled: false, stated_by: 'team' },
    { name: 'ronin_host', enabled: true, stated_by: 'team' },
  ]);
});

test('absence in the selected complete map is implicit off — never live inherit', () => {
  const got = resolveRoutines(catalog, {}, {});
  assert.ok(got.every((routine) => !routine.enabled && routine.stated_by === 'implicit_off'));
});

test('configuration accepts only named literal booleans', () => {
  assert.deepEqual(routineChoices({ ronin_base: true, ronin_host: 'off', '../bad': false }), { ronin_base: true });
  assert.deepEqual(routineChoices(['ronin_base']), {});
});

test('Save completes a map against the current catalog', () => {
  assert.deepEqual(completeRoutineChoices(catalog, { ronin_base: true }), {
    ronin_base: true, ronin_control: false, ronin_host: false,
  });
});

test('a catalog routine added after Save resolves off without changing the stored map', () => {
  const stored = { ronin_base: true, ronin_control: false };
  const expanded = [...catalog, row('future_routine')];
  assert.equal(resolveRoutines(expanded, stored).find((item) => item.name === 'future_routine')?.enabled, false);
  assert.deepEqual(stored, { ronin_base: true, ronin_control: false });
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

/**
 * RONIN HOST IS REQUIRED BY BASE, not chosen beside it. An Agent equipped with Base can
 * always restart Ronin (`tejun-machine-restart`, which Host carries) — the outage this
 * arrangement exists to prevent was caused by that tool's ABSENCE: with no sanctioned way
 * to restart Ronin, a session reaches for systemctl, where the unit owning every session
 * on the box sits one word from the one it meant.
 */
test('Ronin Base requires Ronin Host, so every Agent with Base can restart Ronin', () => {
  const real = [
    { ...row('ronin_host'), requires: [] },
    { ...row('ronin_base'), requires: ['ronin_host'] },
    { ...row('ronin_control'), requires: ['ronin_base'] },
  ];
  const base = resolveRoutines(real, { ronin_base: true });
  const host = base.find((item) => item.name === 'ronin_host');
  assert.equal(host?.enabled, true);
  assert.equal(host?.stated_by, 'dependency');
  assert.deepEqual(host?.required_by, ['ronin_base']);
});

test('Host arrives through Control and Services too, since both include Base', () => {
  const real = [
    { ...row('ronin_host'), requires: [] },
    { ...row('ronin_base'), requires: ['ronin_host'] },
    { ...row('ronin_control'), requires: ['ronin_base'] },
  ];
  const control = resolveRoutines(real, { ronin_control: true });
  assert.equal(control.find((item) => item.name === 'ronin_host')?.enabled, true);
  assert.equal(control.find((item) => item.name === 'ronin_base')?.enabled, true);
});

test('an explicit off for Host is overridden when Base is on — additive, never partial', () => {
  const real = [
    { ...row('ronin_host'), requires: [] },
    { ...row('ronin_base'), requires: ['ronin_host'] },
  ];
  const got = resolveRoutines(real, { ronin_base: true, ronin_host: false });
  assert.equal(got.find((item) => item.name === 'ronin_host')?.enabled, true);
});

test('Host alone is legal: the box material without Ronin ordinary behaviours', () => {
  const real = [
    { ...row('ronin_host'), requires: [] },
    { ...row('ronin_base'), requires: ['ronin_host'] },
  ];
  const got = resolveRoutines(real, { ronin_host: true });
  assert.equal(got.find((item) => item.name === 'ronin_host')?.enabled, true);
  assert.equal(got.find((item) => item.name === 'ronin_base')?.enabled, false);
});
