import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => String(url).includes('team-rosters')
    ? [{ name: 'ronin_helpers', title: 'Ronin Helpers' }, { name: 'zebra' }, { name: 'alpha' }]
    : [],
});

const { refreshTeams, teamsFromState, UNASSIGNED } = await import(`../public/js/team-controller.js?test=${Date.now()}`);

test('teamsFromState keeps an existing exact ronin_helpers record last among Teams', async () => {
  await refreshTeams();
  assert.deepEqual(teamsFromState().map((team) => team.name), ['alpha', 'zebra', 'ronin_helpers', UNASSIGNED]);
});
