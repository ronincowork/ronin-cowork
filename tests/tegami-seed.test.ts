import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/* The birth letter: what a newborn's work record is seeded with. The store root is
 * redirected per the env contract in src/resources.ts so this test never touches a real
 * session. */
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-gate-test-'));
process.env.RONIN_SESSION_DIR = root;
const { checkoutAt, seedTegami, envWithoutGitLocation } = await import('../src/tegami.js');
const exec = promisify(execFile);

const bodyOf = async (f: string) => JSON.parse((await fs.readFile(f, 'utf8')).match(/```json\n([\s\S]*?)\n```/)![1]);

test('a birth letter records the actual launch checkout as an editable repos list', async () => {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-checkout-test-'));
  // Scrubbed for the same reason checkoutAt scrubs: under a git hook, GIT_DIR would
  // point these at the REAL repository rather than the temporary one.
  const gitEnv = { env: envWithoutGitLocation() };
  await exec('git', ['init', '-b', 'feature/tegami', repo], gitEnv);
  await exec('git', ['-C', repo, 'remote', 'add', 'origin', 'git@github.com:ronin/example.git'], gitEnv);
  const checkout = await checkoutAt(repo);
  assert.deepEqual(checkout, {
    repo: 'git@github.com:ronin/example.git',
    branch: 'feature/tegami',
    worktree: repo,
  });

  const file = await seedTegami('checkout_seed', checkout);
  assert.ok(file);
  const body = await bodyOf(file!);
  assert.deepEqual(body.repos, [checkout]);
  assert.ok(!('session_role' in body), 'the retired role axis is not seeded');
  assert.deepEqual(body.teams, []);
});

test('a seeded letter carries mandate and derived teams without the retired role axis', async () => {
  const file = await seedTegami('role_free_seed');
  assert.ok(file);
  const body = await bodyOf(file!);
  assert.ok(!('session_role' in body));
  assert.deepEqual(body.mandate, { reach: 'plan', recruit: 'propose agents', output: ['open'] });
  assert.deepEqual(body.teams, [], 'a ronin: on no team, and the block says so');
  assert.deepEqual(body.holds, [], 'a newborn holds no work items');
  assert.ok(!('ladder' in body) && !('docs' in body), 'the ladder and docs live on work items, not in the letter');
});

test('a managed launch seeds every assigned worktree and line', async () => {
  const repos = [
    { repo: 'cowork', branch: 'team/campaign/docs', worktree: '/worktrees/cowork/docs', line: 'team/campaign/dev' },
    { repo: 'services', branch: 'team/campaign/docs', worktree: '/worktrees/services/docs', line: 'team/campaign/dev' },
  ];
  const file = await seedTegami('multi_desk_seed', repos);
  assert.ok(file);
  assert.deepEqual((await bodyOf(file!)).repos, repos);
});
