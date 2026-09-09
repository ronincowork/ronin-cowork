import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureMikaHome } from '../src/mika-runtime.js';

test('Mika home is a private stable store outside project-root selection', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-mika-home-'));
  const dir = path.join(root, 'private-mika');
  process.env.RONIN_MIKA_HOME_DIR = dir;
  assert.equal(await ensureMikaHome(), dir);
  assert.equal((await lstat(dir)).isSymbolicLink(), false);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);
  delete process.env.RONIN_MIKA_HOME_DIR;
});
