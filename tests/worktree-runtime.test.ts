import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { linkNodeModules } from '../src/worktree-runtime.js';

test('a managed worktree links the home checkout node_modules and keeps one it already has', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ronin-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const desk = path.join(root, 'desk');
  const older = path.join(root, 'older');
  await mkdir(path.join(home, 'node_modules', 'tsx'), { recursive: true });
  await writeFile(path.join(home, 'node_modules', 'tsx', 'package.json'), '{"name":"tsx"}\n');
  await mkdir(desk);
  await mkdir(path.join(older, 'node_modules'), { recursive: true });

  await linkNodeModules(home, desk);
  await linkNodeModules(home, desk);
  assert.equal(await readlink(path.join(desk, 'node_modules')), path.join(home, 'node_modules'));

  await linkNodeModules(home, older);
  assert.equal((await lstat(path.join(older, 'node_modules'))).isSymbolicLink(), false);
});
