import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, SILENT_MS } from '../public/js/store.js';

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

// Every request the store could make would go through fetch; count them.
const requests = [];
globalThis.fetch = async (url) => { requests.push(String(url)); return new Response('[]'); };

function rig() {
  requests.length = 0;
  const timers = [];
  const later = (fn) => { timers.push(fn); return timers.length; };
  const sockets = fakeSockets();
  const store = createStore({ open: sockets.open, later, cancel: () => {} });
  return { store, sockets, timers };
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

test('the store reads nothing: boot, reconnect, resume and every message arrive by push alone', async () => {
  const { store, sockets, timers } = rig();
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  sockets.made[0].push({ t: 'home', rows: [{ name: 'alpha', stance: 'working' }] });
  sockets.made[0].push({ t: 'teams', rosters: [{ name: 'front-2' }] });
  sockets.made[0].drop();
  timers[0]();
  sockets.made[1].up(); // a reconnect
  store.renew(); // a resume on a live socket
  sockets.made[1].push({ t: 'sessions', list: [{ name: 'alpha' }, { name: 'beta' }] });
  await settle();

  assert.deepEqual(requests, [], 'nothing asks REST for a resource the server pushes');
  assert.deepEqual(store.get('home'), [{ name: 'alpha', stance: 'working' }]);
  sockets.made[1].push({ t: 'home', rows: [{ name: 'alpha', stance: 'awaiting_you' }] });
  assert.deepEqual(store.get('home'), [{ name: 'alpha', stance: 'awaiting_you' }], 'the newer push wins');
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

test('the sessions reducer runs before any subscriber and is handed the list it replaces', () => {
  const { store, sockets } = rig();
  const order = [];
  store.reduce('sessions', (list, previous) => order.push(['reduce', list.length, previous?.length]));
  store.subscribe('sessions', () => order.push(['subscriber']));
  store.connect();
  sockets.made[0].up();
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  sockets.made[0].push({ t: 'sessions', list: [{ name: 'alpha' }, { name: 'beta' }] });
  assert.deepEqual(order, [['reduce', 1, undefined], ['subscriber'], ['reduce', 2, 1], ['subscriber']]);
});

test('teams arrive with their rosters, and an unchanged push paints nothing', () => {
  const { store, sockets } = rig();
  store.connect();
  sockets.made[0].up();
  const heard = [];
  store.subscribe('teams', (rosters) => heard.push(rosters));
  sockets.made[0].push({ t: 'teams', rosters: [{ name: 'front-2', objective: 'One store' }] });
  sockets.made[0].push({ t: 'teams', rosters: [{ name: 'front-2', objective: 'One store' }] });
  sockets.made[0].push({ t: 'desks', list: { alpha: {} } });
  assert.deepEqual(heard, [[{ name: 'front-2', objective: 'One store' }]]);
  assert.equal(store.get('desks'), undefined, 'desks are not a store resource');
  assert.deepEqual(requests, []);
});

test('renew on a dropped socket reconnects at once and cancels the pending retry', () => {
  const sockets = fakeSockets();
  const cancelled = [];
  const store = createStore({
    open: sockets.open, later: () => 'retry-1', cancel: (handle) => cancelled.push(handle) });
  store.connect();
  sockets.made[0].up();
  sockets.made[0].drop();
  store.renew();
  assert.equal(sockets.made.length, 2);
  assert.ok(cancelled.includes('retry-1'));
});

test('a forced renew replaces a socket that still says open, and its late close is not news', () => {
  const sockets = fakeSockets();
  const retries = [];
  const store = createStore({ open: sockets.open, later: (fn) => retries.push(fn), cancel: () => {} });
  let closes = 0;
  store.onClose(() => { closes += 1; });
  const heard = [];
  store.subscribe('sessions', (list) => heard.push(list.map((s) => s.name)));
  store.connect();
  const stale = sockets.made[0];
  stale.close = () => stale.drop();
  stale.up();
  stale.push({ t: 'sessions', list: [{ name: 'alpha' }] });

  store.renew(); // a plain renew leaves an open socket alone
  assert.equal(sockets.made.length, 1);

  store.renew({ force: true });
  assert.equal(sockets.made.length, 2, 'a new socket');
  assert.equal(closes, 0, 'the replaced socket closing raises no failure');
  assert.equal(retries.length, 0, 'and schedules no retry');
  store.renew({ force: true }); // asked again while the new socket is connecting
  assert.equal(sockets.made.length, 2, 'a connecting socket is left to finish');

  sockets.made[1].up();
  sockets.made[1].push({ t: 'sessions', list: [{ name: 'alpha' }, { name: 'newborn' }] });
  assert.deepEqual(heard, [['alpha'], ['alpha', 'newborn']], 'the new socket delivers what the dead one missed');
});

test('a feed silent past the beat is replaced without a word, and the new one drops the ended row', () => {
  const sockets = fakeSockets();
  const pending = new Map();
  let ids = 0;
  const quiet = (fn, ms) => { ids += 1; pending.set(ids, { fn, ms }); return ids; };
  const cancel = (id) => pending.delete(id);
  const store = createStore({ open: sockets.open, later: () => 'retry', cancel, quiet });
  let closes = 0;
  store.onClose(() => { closes += 1; });
  const heard = [];
  store.subscribe('sessions', (list) => heard.push(list.map((s) => s.name)));
  store.connect();
  const dead = sockets.made[0];
  dead.close = () => dead.drop();
  dead.up();
  dead.push({ t: 'sessions', list: [{ name: 'front_fable' }, { name: 'alpha' }] });
  dead.push({ t: 'beat' });
  assert.equal(pending.size, 1, 'each message puts the one check off');
  const [[, check]] = pending;
  assert.equal(check.ms, SILENT_MS);

  // The link died under the page: front_fable ends, and nothing more arrives.
  check.fn();
  assert.equal(sockets.made.length, 2, 'a new socket');
  assert.equal(closes, 0, 'silently: no failure bar');
  sockets.made[1].up();
  sockets.made[1].push({ t: 'sessions', list: [{ name: 'alpha' }] });
  assert.deepEqual(heard, [['front_fable', 'alpha'], ['alpha']]);
});
