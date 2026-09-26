import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Just enough browser for tile.js and its imports to evaluate; no Tile is constructed here.
const noop = () => {};
const inert = () => new Proxy({}, { get: (held, key) => (key in held ? held[key] : (key === 'style' || key === 'dataset' || key === 'classList') ? { add: noop, remove: noop, toggle: noop } : noop) });
globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: noop }), addEventListener: noop, location: { hash: '' } };
globalThis.document = { addEventListener: noop, createElement: inert, querySelector: () => null, getElementById: () => null, documentElement: { dataset: {}, style: {} }, body: inert() };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.location = { hash: '', protocol: 'http:', host: 'test', search: '' };
const asked = [];
globalThis.fetch = async (url) => { asked.push(String(url)); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); };

const { store } = await import('../public/js/store.js');
const { Tile } = await import('../public/js/tile.js');

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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

  assert.deepEqual(asked.filter((url) => /\/api\/sessions\/[^/]+\/(ctx|tegami)\b/.test(url)), []);
});

test('the browser keeps no clock for the gauge, the work record, or the docs list', async () => {
  const [tile, layout, phone, docs, host] = await Promise.all([
    read('public/js/tile.js'), read('public/js/layout.js'), read('public/js/phone.js'),
    read('public/js/docs.js'), read('public/js/terminal-tile-host.js'),
  ]);
  assert.doesNotMatch(tile, /\/ctx'|\/tegami'/, 'tile.js asks neither route');
  assert.doesNotMatch(layout, /refreshCtx|refreshTegami/);
  assert.doesNotMatch(phone, /refreshTegami/);
  assert.doesNotMatch(docs, /setInterval/);
  assert.match(host, /tile\.unsubscribeHome\?\.\(\)/, 'destroying the tile closes its subscription');
});
