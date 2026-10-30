import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false }) };

const { store } = await import('../public/js/store.js');
const { teamsFromState, UNASSIGNED } = await import('../public/js/team-controller.js');

test('teamsFromState keeps an existing exact steerco record last among Teams', () => {
  store.receive({ t: 'teams', rosters: [{ name: 'steerco', title: 'Steerco' }, { name: 'zebra' }, { name: 'alpha' }] });
  assert.deepEqual(teamsFromState().map((team) => team.name), ['alpha', 'zebra', 'steerco', UNASSIGNED]);
});
