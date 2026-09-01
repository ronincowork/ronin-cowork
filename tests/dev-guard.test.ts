import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const guard = path.resolve('libexec/ronin-git-guard');
const git = (dir: string, args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

async function repo(branch: string, name: string, email: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-dev-guard-'));
  git(dir, ['init', '-q', '-b', branch]);
  git(dir, ['config', 'user.name', name]);
  git(dir, ['config', 'user.email', email]);
  await fs.writeFile(path.join(dir, 'RONIN_REPO'), 'mode=reviewed\nworking=dev\nstable=master\ndesks=managed\n');
  return dir;
}

const run = (dir: string) => spawnSync(guard, [], { cwd: dir, encoding: 'utf8' });

test('git guard refuses every human commit on the reviewed working line and teaches desks', async () => {
  const dir = await repo('dev', 'Ronin session alice', 'alice@sessions.ronin.local');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /reviewed integration line/);
  assert.match(r.stderr, /tejun-desk open/);
});

test('git guard refuses the stock anonymous identity on a private branch', async () => {
  const dir = await repo('desk', 'Ronin', 'ronin@localhost');
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stock Git identity/);
});

test('git guard accepts a stamped session identity on a private branch', async () => {
  const dir = await repo('desk', 'Ronin session alice', 'alice@sessions.ronin.local');
  assert.equal(run(dir).status, 0);
});
