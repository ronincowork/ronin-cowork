import test from 'node:test';
import assert from 'node:assert/strict';

// next-home.js imports browser modules at load (the theme toggle reads the document), so the
// pure mapping is reached through a stub document; nothing here paints.
globalThis.document ??= { documentElement: { dataset: {}, classList: { toggle() {}, contains() { return false; } } }, createElement: () => ({ style: {}, dataset: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, addEventListener() {}, append() {} }), addEventListener() {} };
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.localStorage ??= globalThis.window.localStorage;
globalThis.location ??= { href: 'https://ronin.test/app#/next', hash: '#/next', protocol: 'https:', host: 'ronin.test' };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { nextDoors } = await import('../public/js/next-home.js');

const reading = {
  teams: [{ name: 'surface', title: 'Surface' }, { name: 'ronin_helpers', holding: true }, { name: 'tools' }],
  boards: [{ id: 'w9', title: 'Unfiled', teams: [] }, { id: 'w1', title: 'Launch', teams: ['surface'] }],
  roots: [{ name: 'ronin_cowork', path: '/x' }],
};

test('four doors in order; a door not standing is closed and keeps its rows', () => {
  const doors = nextDoors(reading, ['collections']);
  assert.deepEqual(doors.map((door) => [door.key, door.standing]), [['collections', true], ['team-next', false], ['board', false], ['workspace', false]]);
  assert.deepEqual(doors[0].rows, []);
  assert.deepEqual(doors[3].rows, [{ param: 'ronin_cowork', label: 'ronin_cowork' }]);
});

test('Teams by name with their title as the label, holding Teams left out; Unfiled last among boards', () => {
  const doors = nextDoors(reading, []);
  assert.deepEqual(doors[1].rows, [{ param: 'surface', label: 'Surface' }, { param: 'tools', label: 'tools' }]);
  assert.deepEqual(doors[2].rows.map((row) => row.label), ['Launch', 'Unfiled']);
});

test('an empty or missing reading still gives four doors', () => {
  assert.equal(nextDoors().length, 4);
  assert.ok(nextDoors({ teams: null, boards: 'x' }).every((door) => Array.isArray(door.rows)));
});
