import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { addCurrentBehaviourAt, birthMandateFromReceipt } from '../src/agent-composition.js';

test('legacy receipts do not invent immutable birth mandate facts', () => {
  assert.equal(birthMandateFromReceipt({ behaviours: [] }), null);
  assert.deepEqual(birthMandateFromReceipt({ mandate: { reach: 'execute', recruit: 'nobody', output: ['code', 'an artifact'] } }), {
    reach: 'execute', recruit: 'nobody', output: ['code', 'an artifact'],
  });
});

test('concurrent Behavior additions serialize without losing either row', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-composition-'));
  try {
    await Promise.all([
      addCurrentBehaviourAt(dir, { name: 'one', path: '/one' }),
      addCurrentBehaviourAt(dir, { name: 'two', path: '/two' }),
    ]);
    const rows = JSON.parse(await readFile(path.join(dir, 'composition-additions.json'), 'utf8'));
    assert.deepEqual(rows.map((row: { name: string }) => row.name).sort(), ['one', 'two']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent identical additions accept and deliver teaching exactly once', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-composition-same-'));
  let deliveries = 0;
  try {
    const results = await Promise.all([
      addCurrentBehaviourAt(dir, { name: 'one', path: '/one' }, async () => ++deliveries),
      addCurrentBehaviourAt(dir, { name: 'one', path: '/one' }, async () => ++deliveries),
    ]);
    assert.equal(deliveries, 1);
    assert.deepEqual(results.map((row) => row.added).sort(), [false, true]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
