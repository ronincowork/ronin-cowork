import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../public/js/store.js';

/** A socket the test drives: open it, push to it, drop it. */
function fakeSockets() {
  const made = [];
  const open = () => {
    const ws = { readyState: 0, sent: [], send(text) { this.sent.push(JSON.parse(text)); } };
    ws.up = () => { ws.readyState = 1; ws.onopen?.(); };
    ws.push = (message) => ws.onmessage?.({ data: JSON.stringify(message) });
    ws.drop = () => { ws.readyState = 3; ws.onclose?.(); };
    made.push(ws);
    return ws;
  };
  return { made, open };
}

function rig() {
  const reads = [];
  const rowsNow = [{ name: 'alpha', stance: 'working' }];
  const read = async (url) => { reads.push(url); return { ok: true, data: url === '/api/home' ? rowsNow : [] }; };
  const timers = [];
  const later = (fn) => { timers.push(fn); return timers.length; };
  const sockets = fakeSockets();
  const store = createStore({ read, open: sockets.open, later, cancel: () => {} });
  return { store, reads, sockets, timers, homeReads: () => reads.filter((url) => url === '/api/home').length };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('two subscribers, one pushed change: one paint each', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  const paints = { a: [], b: [] };
  store.subscribe('home', (rows) => paints.a.push(rows));
  store.subscribe('home', (rows) => paints.b.push(rows));

  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha', stance: 'replying' }] });

  assert.equal(paints.a.length, 1);
  assert.equal(paints.b.length, 1);
  assert.deepEqual(paints.a[0], [{ name: 'alpha', stance: 'replying' }]);
});

test('an unchanged push paints nothing, and a late subscriber is handed the snapshot', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  const rows = [{ name: 'alpha', stance: 'replying' }];
  sockets.made[0].push({ t: 'home', rows });
  let paints = 0;
  store.subscribe('home', () => { paints += 1; }); // open: the snapshot
  sockets.made[0].push({ t: 'home', rows: structuredClone(rows) }); // same rows again
  assert.equal(paints, 1);
  assert.deepEqual(store.get('home'), rows);
});

test('a closed subscriber hears nothing more', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  let paints = 0;
  const close = store.subscribe('home', () => { paints += 1; });
  close();
  sockets.made[0].push({ t: 'home', rows: [{ name: 'beta' }] });
  assert.equal(paints, 0);
});

test('reconnect fetches the home snapshot exactly once', async () => {
  const { store, sockets, timers, homeReads } = rig();
  store.connect();
  sockets.made[0].up(); // the first open: the page boots its own snapshot
  assert.equal(homeReads(), 0);

  sockets.made[0].drop();
  assert.equal(timers.length, 1, 'the feed schedules its own return');
  timers[0]();
  sockets.made[1].up();
  await settle();
  assert.equal(homeReads(), 1);

  // The pushed rows of this connection are held; asking again fetches nothing.
  sockets.made[1].push({ t: 'home', rows: [{ name: 'alpha' }] });
  await store.snapshot('home');
  assert.equal(homeReads(), 1);
});

test('concurrent snapshot reads share one request', async () => {
  const { store, homeReads } = rig();
  let heard = 0;
  store.subscribe('home', () => { heard += 1; });
  const [first, second] = await Promise.all([store.snapshot('home'), store.snapshot('home')]);
  assert.equal(homeReads(), 1);
  assert.equal(heard, 1);
  assert.equal(first.changed, true);
  assert.equal(second.changed, true, 'both callers see the one read');
});

test('until the server pushes rows, a sessions change reads the snapshot; after, it does not', async () => {
  const { store, sockets, homeReads } = rig();
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  await settle();
  assert.equal(homeReads(), 1);

  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha' }] });
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }, { name: 'beta' }] });
  await settle();
  assert.equal(homeReads(), 1);
});

test('the sessions reducer runs before any subscriber hears the change', () => {
  const { store, sockets } = rig();
  const order = [];
  store.reduce('sessions', () => order.push('reduce'));
  store.subscribe('sessions', () => order.push('subscriber'));
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  assert.deepEqual(order, ['reduce', 'subscriber']);
});

test('a teams nudge re-reads the rosters; desks arrive with their payload', async () => {
  const { store, sockets, reads } = rig();
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'teams' });
  await settle();
  assert.deepEqual(reads, ['/api/team-rosters']);

  let desks = null;
  store.subscribe('desks', (answer) => { desks = answer; });
  sockets.made[0].push({ t: 'desks', list: { alpha: { desks: [], rollup: {} } } });
  assert.deepEqual(desks, { alpha: { desks: [], rollup: {} } });
  assert.deepEqual(reads, ['/api/team-rosters'], 'desks are not re-read');
});

test('renew on a dropped socket reconnects at once and cancels the pending retry', () => {
  const reads = [];
  const sockets = fakeSockets();
  const cancelled = [];
  const store = createStore({ read: async (url) => { reads.push(url); return { ok: true, data: [] }; },
    open: sockets.open, later: () => 'retry-1', cancel: (handle) => cancelled.push(handle) });
  store.connect();
  sockets.made[0].up();
  sockets.made[0].drop();
  store.renew();
  assert.equal(sockets.made.length, 2);
  assert.ok(cancelled.includes('retry-1'));
});
