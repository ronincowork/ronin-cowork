import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('behaviours merge owner books over stock whole-file and append new names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-ways-'));
  process.env.RONIN_WAYS_DIR = path.join(root, 'ways');
  await mkdir(path.join(process.env.RONIN_WAYS_DIR, 'selected'), { recursive: true });
  await writeFile(path.join(process.env.RONIN_WAYS_DIR, 'selected', 'buildout.md'), '# My Buildout\n- **scope:** selected\n\nMine.\n');
  await writeFile(
    path.join(process.env.RONIN_WAYS_DIR, 'selected', 'my_way.md'),
    '# My Way\n- **scope:** selected\n- **kinds:** work, household, no_such_kind\n\nNew.\n',
  );
  try {
    const { listWays } = await import('../src/resources.js');
    const rows = await listWays();
    const buildout = rows.find((row) => row.name === 'buildout');
    assert.equal(buildout?.label, 'My Buildout');
    assert.equal(buildout?.content, '# My Buildout\n- **scope:** selected\n\nMine.\n');
    assert.equal(buildout?.scope, 'selected');
    assert.equal(buildout?.origin, 'user');
    assert.equal(buildout?.shadowed, true);
    const mine = rows.find((row) => row.name === 'my_way');
    assert.equal(mine?.origin, 'user');
    assert.deepEqual(mine?.kinds, ['work', 'household']);
    assert.equal(mine?.blurb, 'New.');
    assert.equal(rows.find((row) => row.name === 'recruit')?.origin, 'stock');
  } finally {
    delete process.env.RONIN_WAYS_DIR;
    await rm(root, { recursive: true, force: true });
  }
});

test('the general selectable stock shelf has the owner-approved five labels', async () => {
  const { listWays } = await import('../src/resources.js');
  const rows = (await listWays()).filter((row) => row.scope === 'selected' && !row.installation && row.origin === 'stock');
  assert.deepEqual(rows.map((row) => row.label), [
    'Write it Down', 'Planning', 'Team work', 'Visual Staging', 'Working with the User',
  ]);
  assert.equal(rows.some((row) => ['codebase_team', 'more_checkpoints'].includes(row.name)), false);
});
