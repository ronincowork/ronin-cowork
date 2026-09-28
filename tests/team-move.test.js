import test from 'node:test';
import assert from 'node:assert/strict';

// The roster's drag moves an Agent between Teams in one membership write, keeping every
// other Team it belongs to.
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
const node = () => ({ classList: { add() {}, remove() {} }, addEventListener() {}, append() {}, set innerHTML(_) {} });
globalThis.document = { createElement: node, body: { appendChild() {} } };
const writes = [];
globalThis.fetch = async (url, init = {}) => {
  if (init.method === 'PUT') writes.push([String(url), JSON.parse(init.body).teams.sort()]);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
};

const { store } = await import('../public/js/store.js');
await import('../public/js/events.js');
const { moveTeamMembership } = await import('../public/js/team-controller.js');

test('a roster drag moves one membership and keeps the others', async () => {
  store.receive({ t: 'teams', rosters: [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }] });
  store.receive({ t: 'sessions', list: [{ name: 'tile', tags: ['alpha', 'gamma'], leads: [] }, { name: 'loose', tags: [], leads: [] }] });
  assert.equal((await moveTeamMembership('tile', 'alpha', 'beta')).ok, true);
  assert.equal((await moveTeamMembership('loose', '', 'beta')).ok, true, 'from no Team only adds');
  assert.equal((await moveTeamMembership('tile', 'gamma', '')).ok, true, 'to no Team only removes');
  assert.deepEqual(writes, [
    ['/api/sessions/tile/teams', ['beta', 'gamma']],
    ['/api/sessions/loose/teams', ['beta']],
    ['/api/sessions/tile/teams', ['alpha']],
  ]);
  assert.equal((await moveTeamMembership('ghost', 'alpha', 'beta')).ok, false, 'an unknown session writes nothing');
  assert.equal(writes.length, 3);
});
