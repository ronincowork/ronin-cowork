import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false }) };

const { store } = await import('../public/js/store.js');
const { teamsFromState, UNASSIGNED } = await import('../public/js/team-controller.js');

test('teamsFromState keeps an existing exact ronin_helpers record last among Teams', () => {
  store.receive({ t: 'teams', rosters: [{ name: 'ronin_helpers', title: 'Ronin Helpers' }, { name: 'zebra' }, { name: 'alpha' }] });
  assert.deepEqual(teamsFromState().map((team) => team.name), ['alpha', 'zebra', 'ronin_helpers', UNASSIGNED]);
});
