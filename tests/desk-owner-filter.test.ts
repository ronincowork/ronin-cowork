import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-desk-owner-'));
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
const { listDeskRecords, writeDesk } = await import('../src/desks/registry.js');
type Rec = Parameters<typeof writeDesk>[0];

test('the owner filter picks a session\'s desks, shared ones included, from the records alone', async (t) => {
  t.after(() => fs.rm(tmp, { recursive: true, force: true }));
  const rec = (branch: string, session: string, owners?: string[]) => ({ repo: 'ronin', branch, session, ...(owners ? { owners } : {}) }) as unknown as Rec;
  await writeDesk(rec('team/t/agent', 'agent'));
  await writeDesk(rec('team/t/peer', 'peer', ['peer', 'agent']));
  await writeDesk(rec('team/t/other', 'other'));
  assert.deepEqual((await listDeskRecords({ owner: 'agent' })).map((r) => r.branch), ['team/t/agent', 'team/t/peer']);
  assert.deepEqual((await listDeskRecords({ session: 'agent' })).map((r) => r.branch), ['team/t/agent'], 'session still means the first owner only');
});
