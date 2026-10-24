import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { birthMandateFromReceipt, currentBehavioursAt, writeCurrentBehavioursAt } from '../src/agent-composition.js';

test('legacy receipts do not invent immutable birth mandate facts', () => {
  assert.equal(birthMandateFromReceipt({ behaviours: [] }), null);
  assert.deepEqual(birthMandateFromReceipt({ mandate: { reach: 'execute', recruit: 'nobody', output: ['code', 'an artifact'] } }), {
    reach: 'execute', recruit: 'nobody', output: ['code', 'an artifact'],
  });
});

// UPDATE (owner, 2026-10-24): the chosen list is written whole, so an unticked behaviour — born
// or added — is simply not in it. A session from before Update, with additions only, still
// reads as born plus additions (a store move reads the old location).
test('the chosen Behaviors are one written list; an older session reads born plus additions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-composition-'));
  const born = [{ name: 'a', path: '/a' }];
  try {
    await writeFile(path.join(dir, 'composition-additions.json'), JSON.stringify([{ name: 'b', path: '/b' }]));
    assert.deepEqual(await currentBehavioursAt(dir, born), [{ name: 'a', path: '/a' }, { name: 'b', path: '/b' }]);
    await writeCurrentBehavioursAt(dir, [{ name: 'b', path: '/b' }]);
    assert.deepEqual(await currentBehavioursAt(dir, born), [{ name: 'b', path: '/b' }], 'a, born but unticked, is gone');
    await writeCurrentBehavioursAt(dir, []);
    assert.deepEqual(await currentBehavioursAt(dir, born), [], 'an empty written list is empty, not born');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
