import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('behaviour books resolve across both shadowable shelves and ignore unusable input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-behaviours-'));
  process.env.RONIN_SOPS_DIR = path.join(root, 'sops');
  process.env.RONIN_WAYS_DIR = path.join(root, 'ways');
  await mkdir(process.env.RONIN_SOPS_DIR, { recursive: true });
  await mkdir(process.env.RONIN_WAYS_DIR, { recursive: true });
  await writeFile(path.join(process.env.RONIN_SOPS_DIR, 'github.md'), '# My GitHub\n\nMine.\n');
  await writeFile(path.join(process.env.RONIN_WAYS_DIR, 'my_way.md'), '# My Way\n\nMine.\n');
  try {
    const { resolveBehaviourBooks } = await import('../src/behaviours.js');
    const answer = await resolveBehaviourBooks([
      'sops:github', 'ways:cut_code', 'ways:my_way', 'ways:missing', 'bad', 'ways:cut_code',
    ]);
    assert.deepEqual(answer.delivered.map((row) => row.book), ['sops:github', 'ways:cut_code', 'ways:my_way']);
    assert.equal(answer.delivered[0]?.file, path.join(process.env.RONIN_SOPS_DIR, 'github.md'));
    assert.equal(answer.delivered[2]?.file, path.join(process.env.RONIN_WAYS_DIR, 'my_way.md'));
    assert.deepEqual(answer.ignored, ['behaviours[bad]', 'behaviours[ways:missing]']);
  } finally {
    delete process.env.RONIN_SOPS_DIR;
    delete process.env.RONIN_WAYS_DIR;
    await rm(root, { recursive: true, force: true });
  }
});
