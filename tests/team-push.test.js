import test from 'node:test';
import assert from 'node:assert/strict';

// A pushed session change reaches the Team surfaces through the store alone: the reducer
// writes S.sessions, the Team projection publishes once, and nothing asks REST.
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {} };
const chips = [];
const node = () => ({ classList: { add() {}, remove() {} }, addEventListener() {}, append(...kids) { chips.push(kids[0]?.textContent); }, set innerHTML(_) {} });
globalThis.document = { createElement: node, body: { appendChild() {} } };
const requests = [];
globalThis.fetch = async (url) => { requests.push(String(url)); return new Response('[]'); };

const { store } = await import('../public/js/store.js');
await import('../public/js/events.js'); // installs the sessions reducer
const { S } = await import('../public/js/state.js');
const { membersOfTeam, subscribe } = await import('../public/js/team-controller.js');

test('a pushed session change reaches the Team surfaces without a request', () => {
  let publishes = 0;
  const stop = subscribe(() => { publishes += 1; });
  store.receive({ t: 'teams', rosters: [{ name: 'front-2' }] });
  store.receive({ t: 'sessions', list: [{ name: 'store', tags: ['front-2'], leads: [] }] });
  assert.equal(publishes, 2, 'rosters, then members: one publish each');
  assert.deepEqual(membersOfTeam('front-2').map((m) => m.name), ['store']);

  // A second Agent joins and the first is made lead: one push, one publish.
  store.receive({ t: 'sessions', list: [
    { name: 'store', tags: ['front-2'], leads: ['front-2'] },
    { name: 'tile', tags: ['front-2'], leads: [] },
  ] });
  assert.equal(publishes, 3);
  assert.deepEqual(membersOfTeam('front-2').map((m) => [m.name, m.team_lead]), [['store', true], ['tile', false]]);
  assert.equal(S.sessions.length, 2, 'S.sessions is the pushed list');
  assert.deepEqual(chips, ['＋ tile'], 'the page\'s first list raises no birth chip; a newborn raises one');

  // A forced broadcast that moved only activity stamps is no change.
  store.receive({ t: 'sessions', list: [
    { name: 'store', tags: ['front-2'], leads: ['front-2'], activity: 9 },
    { name: 'tile', tags: ['front-2'], leads: [], activity: 9 },
  ] });
  assert.equal(publishes, 3);
  assert.deepEqual(requests, [], 'nothing was fetched');
  stop();
});
