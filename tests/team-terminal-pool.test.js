import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarmTerminalPool } from '../public/js/team-terminal-pool.js';

/**
 * The tiered pool's contract, run with a hand-cranked clock.
 *
 * HOT is the visible member; WARM is hidden-but-streaming inside the grace; COLD is a
 * seat. The harness host mirrors the real terminal-tile-host: mount() (re)attaches when
 * the session differs — which after park() it always does, because park detaches —
 * park() closes transport, hide() conceals without touching transport, destroy() ends it.
 */
function harness() {
  const records = [];
  const container = { append: (el) => { el.appended = true; } };
  const createHost = ({ mode }) => {
    const record = { mode, opens: [], parks: 0, fits: 0, focuses: 0, destroys: 0, removed: 0, el: null };
    const el = { hidden: false, remove: () => { record.removed += 1; } };
    record.el = el;
    const tile = { focusTerminal: () => { record.focuses += 1; } };
    let session = '';
    let parked = true;
    const host = {
      el,
      get parked() { return parked; },
      get session() { return session; },
      mount: (name) => {
        parked = false;
        el.hidden = false;
        if (session !== name) { record.opens.push(name); session = name; }
        return tile;
      },
      park: () => { record.parks += 1; parked = true; session = ''; },
      hide: () => { el.hidden = true; },
      fit: () => { record.fits += 1; },
      destroy: () => { record.destroys += 1; },
    };
    records.push(record);
    return host;
  };
  return { records, container, createHost };
}

/** A scheduler the test winds by hand. */
function clock() {
  let pending = [];
  return {
    schedule: (fn, ms) => { const id = { fn, ms }; pending.push(id); return id; },
    cancel: (id) => { pending = pending.filter((p) => p !== id); },
    fire: () => { const due = pending; pending = []; for (const p of due) p.fn(); },
    get armed() { return pending.length; },
  };
}

const pool = (h, c, opts = {}) =>
  createWarmTerminalPool({ ...h, schedule: c.schedule, cancel: c.cancel, streamCap: 4, ...opts });

test('seats are free: entry mounts nothing; the first show pays the one mount', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b', 'c']);
  assert.equal(h.records.length, 0, 'page entry opens no transport at all');
  assert.equal(p.size, 3);
  p.show('a', false);
  assert.deepEqual(h.records.map((r) => r.opens), [['a']]);
  assert.equal(p.streamingCount, 1);
});

test('flipping inside the grace is warm — no reopen, no park', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b']);
  p.show('a', false);
  p.show('b', false);
  p.show('a', false);
  p.show('b', false);
  assert.deepEqual(h.records.map((r) => r.opens.length), [1, 1], 'each transport opened once');
  assert.deepEqual(h.records.map((r) => r.parks), [0, 0], 'the grace kept both warm');
  assert.equal(h.records[0].el.hidden, true, 'the one not being watched is concealed');
  assert.equal(h.records[1].el.hidden, false);
});

test('warmth is durable: no clock ever parks a shown tile', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b']);
  p.show('a', false);
  p.show('b', false); // a is hidden but stays hot — the owner toggles between these
  c.fire();
  c.fire();
  assert.deepEqual(h.records.map((r) => r.parks), [0, 0], 'nothing parked, however long the clock runs');
  assert.equal(p.streamingCount, 2, 'both stay ready to flip to');

  p.show('a', false);
  assert.deepEqual(h.records[0].opens, ['a'], 'the flip back cost nothing');
});

test('a re-show after a cap park pays exactly one reattach', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b', 'c', 'd', 'e']);
  for (const name of ['a', 'b', 'c', 'd', 'e']) p.show(name, false); // a parked by the cap
  assert.equal(h.records[0].parks, 1);
  p.show('a', false);
  assert.deepEqual(h.records[0].opens, ['a', 'a'], 'one reattach, tmux repaints at once');
  assert.equal(h.records[0].destroys, 0, 'parking never destroys');
});

test('a PINNED member is never parked — not by the cap, not by anything but its seat', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['lead', 'a', 'b', 'c', 'd']);
  p.show('lead', false); // the lead opens first and is pinned
  p.setPinned(['lead']);
  for (const name of ['a', 'b', 'c', 'd']) p.show(name, false); // cap pressure builds
  assert.equal(h.records[0].parks, 0, 'the lead kept its stream through all of it');
  assert.equal(h.records[1].parks, 1, 'the coldest UNPINNED member yielded instead');
  assert.equal(p.streamingCount, 4, 'the cap held');

  const result = p.sync(['a', 'b', 'c', 'd']); // the lead leaves the team
  assert.equal(result.removedActive, false);
  assert.equal(h.records[0].destroys, 1, 'membership loss is the one thing that takes a pin');
});

test('the stream cap parks the coldest, never destroys, never touches the active', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  const crew = ['a', 'b', 'c', 'd', 'e'];
  p.sync(crew);
  for (const name of crew) p.show(name, false); // the fifth show breaches the cap
  assert.equal(h.records[0].parks, 1, 'a — least recently shown — gave up its stream');
  assert.deepEqual(h.records.map((r) => r.destroys), [0, 0, 0, 0, 0], 'nothing destroyed for the cap');
  assert.equal(p.size, 5, 'every member keeps a seat');
  assert.equal(p.streamingCount, 4);
  assert.equal(p.active, 'e');
});

test('a team of four flipped hard never feels the cap or the clock', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b', 'c', 'd']);
  for (const name of ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd']) p.show(name, false);
  assert.deepEqual(h.records.map((r) => r.opens.length), [1, 1, 1, 1], 'no reopens');
  assert.deepEqual(h.records.map((r) => r.parks), [0, 0, 0, 0], 'no parks while warm');
});

test('prewarm paints hidden, declines at the cap, and the grace collects it if never shown', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b', 'c', 'd', 'e']);
  p.show('a', false);
  assert.equal(p.prewarm('b'), true, 'hover starts b streaming');
  assert.equal(h.records[1].el.hidden, true, 'painted, but concealed');
  assert.equal(p.active, 'a', 'a hover never steals the stage');

  p.show('c', false); p.show('d', false); // cap reached: a, b, c, d streaming
  assert.equal(p.prewarm('e'), false, 'a hover never costs a genuinely warm member');

  c.fire(); // b was never shown — the grace collects it; the SHOWN tiles are untouched
  assert.equal(h.records[1].parks, 1, 'the unclaimed prewarm was parked');
  assert.equal(h.records[1].destroys, 0);
  assert.equal(h.records[0].parks, 0, 'a — shown earlier — kept its warmth');
});

test('a prewarmed member clicked inside the grace costs nothing more', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b']);
  p.show('a', false);
  p.prewarm('b');
  p.show('b', false);
  assert.deepEqual(h.records[1].opens, ['b'], 'the click reused the hover\'s transport');
  assert.equal(h.records[1].el.hidden, false);
});

test('membership loss and page exit destroy every host — streaming, warm or parked — once', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['a', 'b', 'c']);
  p.show('a', false); p.show('b', false);
  p.prewarm('c'); c.fire(); // c's unclaimed prewarm parks; a and b stay warm
  const result = p.sync(['b', 'c']); // a loses membership while warm
  assert.equal(result.removedActive, false);
  assert.equal(h.records[0].destroys, 1, 'the warm host still tears down fully');
  assert.equal(h.records[0].removed, 1);
  p.destroyAll();
  assert.deepEqual(h.records.map((r) => r.destroys), [1, 1, 1], 'each exactly once, parked included');
  assert.equal(p.size, 0);
  assert.equal(c.armed, 0, 'no timer outlives the page');
});

test('keepHot mounts the lead hidden at entry — hot without being on stage', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['lead', 'a']);
  p.setPinned(['lead']);
  assert.equal(p.keepHot('lead'), true);
  assert.equal(h.records[0].opens[0], 'lead', 'streaming from entry');
  assert.equal(h.records[0].el.hidden, true, 'but not on stage');
  assert.equal(p.active, '', 'nothing focused by keepHot itself');
  c.fire();
  assert.equal(h.records[0].parks, 0, 'no grace ever collects a keepHot — it is not a prewarm');
  assert.equal(p.keepHot('lead'), false, 'idempotent: already streaming');
});

test('a keepHot lead survives cap pressure like any pin', () => {
  const h = harness(); const c = clock();
  const p = pool(h, c);
  p.sync(['lead', 'a', 'b', 'c', 'd']);
  p.setPinned(['lead']);
  p.keepHot('lead');
  for (const name of ['a', 'b', 'c', 'd']) p.show(name, false);
  assert.equal(h.records[0].parks, 0, 'the hidden lead kept its stream through the squeeze');
  assert.equal(h.records[1].parks, 1, 'the coldest unpinned member yielded');
});
