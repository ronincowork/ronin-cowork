import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listTeamTemplates, removeTeamTemplate, saveTeamTemplate } from '../src/team-templates.js';

test('Team templates persist a reusable draft without Team identity or transaction state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-team-templates-'));
  const before = process.env.RONIN_CATALOGS_DIR;
  process.env.RONIN_CATALOGS_DIR = dir;
  try {
    await saveTeamTemplate('dev-team', {
      team: { name: 'one-off', wipeboard: 'one-off', objective: 'Build it' },
      seats: [{ seat_id: 'seat-1', session_role: 'CutCode' }],
      transaction: { committed_team: 'one-off' },
    });
    const [saved] = await listTeamTemplates();
    assert.equal(saved.name, 'dev-team');
    assert.deepEqual(saved.draft.team, { name: '', wipeboard: '', objective: 'Build it' });
    assert.equal(saved.draft.transaction, undefined);
    await removeTeamTemplate('dev-team');
    assert.deepEqual(await listTeamTemplates(), []);
  } finally {
    if (before === undefined) delete process.env.RONIN_CATALOGS_DIR; else process.env.RONIN_CATALOGS_DIR = before;
    await rm(dir, { recursive: true, force: true });
  }
});
