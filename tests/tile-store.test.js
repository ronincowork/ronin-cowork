import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough browser for tile.js and its imports to evaluate; no Tile is constructed here.
const noop = () => {};
const inert = () => new Proxy({}, { get: (held, key) => (key in held ? held[key] : (key === 'style' || key === 'dataset' || key === 'classList') ? { add: noop, remove: noop, toggle: noop } : noop) });
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: noop }), addEventListener: noop, location: { hash: '' } };
globalThis.document = { addEventListener: noop, createElement: inert, querySelector: () => null, getElementById: () => null, documentElement: { dataset: {}, style: {} }, body: inert() };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.location = { hash: '', protocol: 'http:', host: 'test', search: '' };
const asked = [];
let answer = {};
globalThis.fetch = async (url) => { asked.push(String(url)); return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } }); };

const { store } = await import('../public/js/store.js');
const { Tile } = await import('../public/js/tile.js');
const { desksOf } = await import('../public/js/desks.js');
const { buildDocs } = await import('../public/js/docs.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A Tile's own methods over the parts they paint, standing in for the DOM it would build. */
function fakeTile(session) {
  const tile = Object.create(Tile.prototype);
  const painted = { gauge: [], footer: [], closed: 0 };
  Object.assign(tile, {
    session,
    headHelp: {},
    ladderOpen: false,
    gauge: { set: (value) => painted.gauge.push(value) },
    setFooter: (pct, model) => painted.footer.push([pct, model]),
    closeLadder: () => { painted.closed += 1; },
  });
  return { tile, painted };
}

test('a tile paints its gauge and work record from the pushed home row, and asks no route', () => {
  const { tile, painted } = fakeTile('alpha');
  tile.subscribeHome();
  const letter = { docs: ['PLAN.md'], ladder: [{ stage: 'IDEAS' }] };

  store.receive({ t: 'home', rows: [
    { name: 'beta', ctx: 12, model: 'other' },
    { name: 'alpha', ctx: 41, model: 'opus', stance: 'working', tegami: letter },
  ] });
  assert.equal(painted.gauge.at(-1), 41);
  assert.deepEqual(painted.footer.at(-1), [41, 'opus']);
  assert.deepEqual(tile.tegami, letter);

  // The next push moves the reading; the letter going away closes the ladder.
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 57, model: 'opus', stance: 'replying' }] });
  assert.equal(painted.gauge.at(-1), 57);
  assert.equal(tile.tegami, null);
  assert.ok(painted.closed >= 1);

  // CLOSE: an unsubscribed tile hears nothing more.
  const heard = painted.gauge.length;
  tile.unsubscribeHome();
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 90, model: 'opus' }] });
  assert.equal(painted.gauge.length, heard);

  assert.deepEqual(asked, [], 'no request: not /ctx, not /tegami, nothing');
});

test('opening the ladder is the one read of the desks; a push asks nothing', async () => {
  const { tile } = fakeTile('alpha');
  Object.assign(tile, { drawLadder() { this.drawn = desksOf(this.session); } });
  tile.subscribeHome();
  asked.length = 0;

  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 12, model: 'opus', tegami: { docs: [] } }] });
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 13, model: 'opus', tegami: { docs: [] } }] });
  assert.deepEqual(asked, [], 'a pushed row costs the tile no request at all');

  answer = { alpha: { desks: [{ repo: 'ronin_cowork', branch: 'team/front-2/front2_tile' }] } };
  tile.toggleLadder();
  await settle();
  assert.deepEqual(asked, ['/api/desks'], 'the ladder reads the desks when it opens, once');
  assert.equal(tile.ladderOpen, true);
  assert.deepEqual(tile.drawn, answer.alpha);
  tile.unsubscribeHome();
});

test('the docs list hears the rows from enter to close, and nothing after', () => {
  const heard = [];
  const docs = buildDocs(null, inert(), (name) => { heard.push(name); return false; });
  store.receive({ t: 'home', rows: [{ name: 'gamma', tegami: { docs: ['A.md'] } }] });
  assert.deepEqual(heard, [], 'built but not entered: not listening');

  docs.enter();
  assert.ok(heard.includes('gamma'), 'enter draws the snapshot');
  store.receive({ t: 'home', rows: [{ name: 'delta', tegami: { docs: ['B.md'] } }] });
  assert.ok(heard.includes('delta'), 'a push while open redraws');

  docs.close();
  store.receive({ t: 'home', rows: [{ name: 'epsilon', tegami: { docs: ['C.md'] } }] });
  assert.ok(!heard.includes('epsilon'), 'closed: the push is not heard');
  assert.deepEqual(asked.filter((url) => url !== '/api/desks'), [], 'the tracked shelf asks no route');
});
