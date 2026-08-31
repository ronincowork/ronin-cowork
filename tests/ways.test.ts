import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('ways merge owner books over stock whole-file and append new names', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-ways-'));
  process.env.RONIN_WAYS_DIR = path.join(root, 'ways');
  await mkdir(process.env.RONIN_WAYS_DIR, { recursive: true });
  await writeFile(path.join(process.env.RONIN_WAYS_DIR, 'cut_code.md'), '# My Cut\n\nMine.\n');
  await writeFile(path.join(process.env.RONIN_WAYS_DIR, 'my_way.md'), '# My Way\n\nNew.\n');
  try {
    const { listWays } = await import('../src/ways.js');
    const rows = await listWays();
    const cut = rows.find((row) => row.name === 'cut_code');
    assert.deepEqual(cut, { name: 'cut_code', label: 'My Cut', blurb: 'Mine.', origin: 'user', shadowed: true });
    assert.equal(rows.find((row) => row.name === 'my_way')?.origin, 'user');
  } finally {
    delete process.env.RONIN_WAYS_DIR;
    await rm(root, { recursive: true, force: true });
  }
});
