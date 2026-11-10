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
const { buildDocs } = await import('../public/js/docs.js');

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A Tile's own methods over the parts they paint, standing in for the DOM it would build. */
function fakeTile(session) {
  const tile = Object.create(Tile.prototype);
  const painted = { gauge: [], footer: [] };
  Object.assign(tile, {
    session,
    headHelp: {},
    gauge: { set: (value) => painted.gauge.push(value) },
    transcriptView: { setStance: (stance) => { painted.stance = stance; } },
    secretAsk: { sync: (row) => { painted.secretAsk = row?.secret_ask ?? null; } },
    setFooter: (pct, model) => painted.footer.push([pct, model]),
  });
  return { tile, painted };
}

test('a tile paints its gauge and work record from the pushed home row, and asks no route', () => {
  const { tile, painted } = fakeTile('alpha');
  tile.subscribeHome();
  const letter = { docs: ['PLAN.md'], items: [{ id: 'w1', title: 'Plan it', status: 'PLAN' }] };

  store.receive({ t: 'home', rows: [
    { name: 'beta', ctx: 12, model: 'other' },
    { name: 'alpha', ctx: 41, model: 'opus', stance: 'working', tegami: letter },
  ] });
  assert.equal(painted.gauge.at(-1), 41);
  assert.deepEqual(painted.footer.at(-1), [41, 'opus']);
  assert.deepEqual(tile.tegami, letter);
  assert.equal(painted.stance, 'working', 'the reading\'s stance is the row\'s');

  // The next push moves the reading; the letter going away goes from the tile too.
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 57, model: 'opus', stance: 'replying' }] });
  assert.equal(painted.gauge.at(-1), 57);
  assert.equal(tile.tegami, null);

  // CLOSE: an unsubscribed tile hears nothing more.
  const heard = painted.gauge.length;
  tile.unsubscribeHome();
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 90, model: 'opus' }] });
  assert.equal(painted.gauge.length, heard);

  assert.deepEqual(asked, [], 'no request: not /ctx, not /tegami, nothing');
});

test('a pushed row costs the tile no request at all', () => {
  const { tile } = fakeTile('alpha');
  tile.subscribeHome();
  asked.length = 0;
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 12, model: 'opus', tegami: { docs: [] } }] });
  store.receive({ t: 'home', rows: [{ name: 'alpha', ctx: 13, model: 'opus', tegami: { docs: [] } }] });
  assert.deepEqual(asked, []);
  tile.unsubscribeHome();
});

test('the docs list hears the rows from enter to close, and nothing after', () => {
  const heard = [];
  const docs = buildDocs(inert(), (name) => { heard.push(name); return false; });
  store.receive({ t: 'home', rows: [{ name: 'gamma', tegami: { docs: ['A.md'] } }] });
  assert.deepEqual(heard, [], 'built but not entered: not listening');

  docs.enter();
  assert.ok(heard.includes('gamma'), 'enter draws the snapshot');
  store.receive({ t: 'home', rows: [{ name: 'delta', tegami: { docs: ['B.md'] } }] });
  assert.ok(heard.includes('delta'), 'a push while open redraws');

  docs.close();
  store.receive({ t: 'home', rows: [{ name: 'epsilon', tegami: { docs: ['C.md'] } }] });
  assert.ok(!heard.includes('epsilon'), 'closed: the push is not heard');
  assert.deepEqual(asked.filter((url) => !url.startsWith('/api/desks')), [], 'the tracked shelf asks no route');
});
