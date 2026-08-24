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

test('revisiting a member only reveals and focuses its already-open full Tile', () => {
  const h = harness();
  const pool = createWarmTerminalPool(h);
  pool.sync(['alpha', 'beta']);
  assert.deepEqual(h.records.map((r) => [r.mode, r.opens]), [
    ['full', ['alpha']],
    ['full', ['beta']],
  ]);

  assert.equal(pool.show('alpha'), true);
  assert.equal(pool.show('beta'), true);
  assert.equal(pool.show('alpha'), true);
  assert.deepEqual(h.records.map((r) => r.opens.length), [1, 1], 'revisits never reopen transport');
  assert.equal(h.records[0].focuses, 2);
  assert.equal(h.records[1].focuses, 1);
});

test('membership loss and page cleanup destroy every affected host exactly once', () => {
  const h = harness();
  const pool = createWarmTerminalPool(h);
  pool.sync(['alpha', 'beta']);
  pool.show('beta', false);

  const result = pool.sync(['alpha', 'gamma']);
  assert.equal(result.removedActive, true);
  assert.equal(h.records[1].destroys, 1, 'lost member transport closes immediately');
  assert.equal(h.records[1].removed, 1, 'lost member wrapper leaves the page');
  assert.equal(pool.size, 2);

  pool.destroyAll();
  assert.deepEqual(h.records.map((r) => r.destroys), [1, 1, 1]);
  assert.deepEqual(h.records.map((r) => r.removed), [1, 1, 1]);
  assert.equal(pool.size, 0);
  assert.equal(pool.active, '');
});
