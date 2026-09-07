import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-staging-client-'));

test('the staged client loads its own assets and keeps no production placeholder', async () => {
  execFileSync(process.execPath, ['scripts/stage.mjs'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, RONIN_STAGING_DIR: root },
  });
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /__RONIN_ASSET_VERSION__/);
  assert.match(html, /href="\/staging\/style\.css"/);
  assert.match(html, /src="\/staging\/js\/main\.js"/);
});

test.after(async () => { await rm(root, { recursive: true, force: true }); });
