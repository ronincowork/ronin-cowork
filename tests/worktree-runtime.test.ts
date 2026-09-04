import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { materializeNodeModules } from '../src/worktree-runtime.js';

test('managed worktree dependencies cannot mutate the operator install', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ronin-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const live = path.join(root, 'live');
  const desk = path.join(root, 'desk');
  await mkdir(path.join(live, 'node_modules', 'tsx'), { recursive: true });
  await mkdir(desk);
  await writeFile(path.join(live, 'node_modules', 'tsx', 'package.json'), '{"name":"tsx"}\n');
  await symlink(path.join(live, 'node_modules'), path.join(desk, 'node_modules'));

  await materializeNodeModules(live, desk);
  await rm(path.join(desk, 'node_modules'), { recursive: true, force: true });

  assert.equal(await readFile(path.join(live, 'node_modules', 'tsx', 'package.json'), 'utf8'), '{"name":"tsx"}\n');
});
