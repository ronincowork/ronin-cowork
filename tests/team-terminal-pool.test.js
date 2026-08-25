import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarmTerminalPool } from '../public/js/team-terminal-pool.js';

function harness() {
  const records = [];
  const container = { append: (el) => { el.appended = true; } };
  const createHost = ({ mode }) => {
    const record = { mode, opens: [], fits: 0, focuses: 0, destroys: 0, removed: 0 };
    const el = { hidden: false, remove: () => { record.removed += 1; } };
    const tile = { focusTerminal: () => { record.focuses += 1; } };
    const host = {
      el,
      mount: (session) => { record.opens.push(session); return tile; },
      fit: () => { record.fits += 1; },
      destroy: () => { record.destroys += 1; },
      switchSession: () => { throw new Error('a warm revisit must not switch transport'); },
    };
    records.push(record);
    return host;
  };
  return { records, container, createHost };
}

test('seats are lazy: entry costs nothing, first show mounts, revisits stay warm', () => {
  // THE CONTRACT CHANGED 2026-08-25 (owner-driven): sync reserves SEATS and mounts
  // nothing — seven members on page entry used to mean seven hidden xterm instances
  // parsing seven busy sessions on the main thread, and the page crawled. A member's
  // terminal now exists from its first show; after that, revisits are warm as before.
  const h = harness();
  const pool = createWarmTerminalPool(h);
  pool.sync(['alpha', 'beta']);
  assert.equal(h.records.length, 0, 'page entry opens no transport at all');
  assert.equal(pool.size, 2, 'but both seats are reserved');
  assert.equal(pool.has('alpha'), true);

  assert.equal(pool.show('alpha'), true);
  assert.deepEqual(h.records.map((r) => [r.mode, r.opens]), [['full', ['alpha']]], 'first show mounts');
  assert.equal(pool.show('beta'), true);
  assert.equal(pool.show('alpha'), true);
  assert.deepEqual(h.records.map((r) => r.opens.length), [1, 1], 'revisits never reopen transport');
  assert.equal(h.records[0].focuses, 2);
  assert.equal(h.records[1].focuses, 1);
});

test('membership loss and page cleanup destroy every MOUNTED host exactly once', () => {
  const h = harness();
  const pool = createWarmTerminalPool(h);
  pool.sync(['alpha', 'beta']);
  pool.show('beta', false); // beta's is the only transport open

  const result = pool.sync(['alpha', 'gamma']);
  assert.equal(result.removedActive, true);
  assert.equal(h.records[0].destroys, 1, 'lost member transport closes immediately');
  assert.equal(h.records[0].removed, 1, 'lost member wrapper leaves the page');
  assert.equal(pool.size, 2, 'alpha and gamma keep their (unmounted) seats');

  // An unmounted seat destroys cleanly — there is nothing to close, and nothing throws.
  pool.destroyAll();
  assert.deepEqual(h.records.map((r) => r.destroys), [1], 'only ever-mounted hosts close');
  assert.deepEqual(h.records.map((r) => r.removed), [1]);
  assert.equal(pool.size, 0);
  assert.equal(pool.active, '');
});

test('the warm cap: a fifth mount closes the coldest transport but keeps its seat', () => {
  const h = harness();
  const pool = createWarmTerminalPool({ ...h, warmCap: 4 });
  const crew = ['a', 'b', 'c', 'd', 'e'];
  pool.sync(crew);
  for (const name of ['a', 'b', 'c', 'd']) pool.show(name, false);
  assert.equal(h.records.length, 4, 'four warm terminals, at the cap');
  assert.deepEqual(h.records.map((r) => r.destroys), [0, 0, 0, 0]);

  pool.show('e', false); // the fifth — 'a' is coldest and must give up its transport
  assert.equal(h.records[0].destroys, 1, "a's transport closed");
  assert.equal(h.records[0].removed, 1);
  assert.equal(pool.has('a'), true, 'but a keeps its seat');
  assert.equal(pool.size, 5, 'no member lost its place on the team');

  // Revisiting the evicted member simply pays the mount again — sixth record, and now
  // 'b' is coldest and gives way.
  pool.show('a', false);
  assert.equal(h.records.length, 6, 'a remounted fresh');
  assert.equal(h.records[1].destroys, 1, "b's transport closed in a's favour");
  assert.equal(h.records[5].opens[0], 'a');

  // The member being shown is never evicted, whatever the cap arithmetic says.
  assert.equal(pool.active, 'a');
});

test('a cap of 4 never touches a team of 4 — the grid-sized case stays fully warm', () => {
  const h = harness();
  const pool = createWarmTerminalPool({ ...h, warmCap: 4 });
  pool.sync(['a', 'b', 'c', 'd']);
  for (const name of ['a', 'b', 'c', 'd', 'a', 'b']) pool.show(name, false);
  assert.deepEqual(h.records.map((r) => r.destroys), [0, 0, 0, 0], 'nothing ever evicted');
  assert.deepEqual(h.records.map((r) => r.opens.length), [1, 1, 1, 1], 'nothing ever remounted');
});
