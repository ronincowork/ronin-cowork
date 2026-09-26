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
  const read = async (url) => { reads.push(url); return { ok: true, data: url === '/api/desks' ? {} : [] }; };
  const timers = [];
  const later = (fn) => { timers.push(fn); return timers.length; };
  const sockets = fakeSockets();
  const store = createStore({ read, open: sockets.open, later, cancel: () => {} });
  return { store, reads, sockets, timers };
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

test('a pushed value is never overwritten by a read: boot, reconnect, resume and sessions read nothing', async () => {
  const { store, sockets, timers, reads } = rig();
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha', stance: 'working' }] });
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  sockets.made[0].drop();
  timers[0]();
  sockets.made[1].up(); // a reconnect
  store.renew(); // a resume on a live socket
  sockets.made[1].push({ t: 'sessions', list: [{ name: 'alpha' }, { name: 'beta' }] });
  await settle();

  assert.deepEqual(reads, [], 'nothing asks REST for a resource the server pushes');
  assert.deepEqual(store.get('home'), [{ name: 'alpha', stance: 'working' }]);

  sockets.made[1].push({ t: 'home', rows: [{ name: 'alpha', stance: 'awaiting_you' }] });
  assert.deepEqual(store.get('home'), [{ name: 'alpha', stance: 'awaiting_you' }], 'the newer push wins');
});

test('concurrent reads share one request', async () => {
  const { store, reads } = rig();
  let heard = 0;
  store.subscribe('teams', () => { heard += 1; });
  const [first, second] = await Promise.all([store.snapshot('teams'), store.snapshot('teams')]);
  assert.deepEqual(reads, ['/api/team-rosters']);
  assert.equal(heard, 1);
  assert.equal(first.changed, true);
  assert.equal(second.changed, true, 'both callers see the one read');
});

test('a sessions push that moved only activity stamps paints nothing', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  let paints = 0;
  store.subscribe('sessions', () => { paints += 1; });
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha', tags: ['front-2'], activity: 100 }] });
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha', tags: ['front-2'], activity: 250 }] }); // a forced tmux broadcast
  assert.equal(paints, 1);
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha', tags: ['front-2'], title: 'Alpha', activity: 300 }] });
  assert.equal(paints, 2, 'a painted field moving is a change');
});

test('a home push that moved only activity or stance time paints nothing', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  let paints = 0;
  store.subscribe('home', () => { paints += 1; });
  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha', stance: 'working', at: 1, activity: 1 }] });
  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha', stance: 'working', at: 2, activity: 2 }] });
  assert.equal(paints, 1);
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

test('a teams nudge re-reads the rosters; desks are read, never taken from the socket', async () => {
  const { store, sockets, reads } = rig();
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'teams' });
  await settle();
  assert.deepEqual(reads, ['/api/team-rosters']);

  let desks = null;
  store.subscribe('desks', (answer) => { desks = answer; });
  sockets.made[0].push({ t: 'desks', list: { alpha: { desks: [], rollup: {} } } });
  assert.equal(desks, null, 'a desks message is not a resource');
  await store.snapshot('desks');
  assert.deepEqual(reads, ['/api/team-rosters', '/api/desks']);
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
