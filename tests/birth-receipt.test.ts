import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistBirthReceiptAt } from '../src/launch-ledger.js';

test('the Cowork birth receipt persists in the newborn session directory', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-birth-receipt-'));
  const session = path.join(root, 'agent-123');
  try {
    const receipt = { routines: [{ name: 'ronin_worktrees', on: true, delivered: true, missing: [] }] };
    const at = await persistBirthReceiptAt(session, receipt);
    assert.equal(at, path.join(session, 'birth-receipt.json'));
    assert.deepEqual(JSON.parse(await fs.readFile(at, 'utf8')), receipt);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
