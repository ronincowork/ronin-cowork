import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { listRoleFamilies, writeRoleTasks } from '../src/resource-adapters.js';

test('typed membership writer preserves the pin and returns shadow provenance after save', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'ronin-family-membership-'));
  const previous = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_CATALOGS_DIR = temp;
  try {
    await assert.rejects(
      writeRoleTasks('developer', ['CutCode']),
      /QuarterBack.*default_lead_role.*stays pinned.*Clear the `default_lead_role:` line/s,
    );
    assert.equal((await listRoleFamilies()).find((family) => family.name === 'developer')?.origin, 'stock');

    const saved = await writeRoleTasks('developer', ['QuarterBack', 'CutCode']);
    assert.deepEqual(saved, ['QuarterBack', 'CutCode']);
    const family = (await listRoleFamilies()).find((row) => row.name === 'developer');
    assert.equal(family?.origin, 'user');
    assert.equal(family?.shadowed, true);
    assert.deepEqual(family?.session_roles, ['QuarterBack', 'CutCode']);
  } finally {
    if (previous === undefined) delete process.env.RONIN_CATALOGS_DIR;
    else process.env.RONIN_CATALOGS_DIR = previous;
    await rm(temp, { recursive: true, force: true });
  }
});
