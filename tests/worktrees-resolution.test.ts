/**
 * RONIN WORKTREES MATRIX — executable proof of the single typed switching seam.
 *
 * Roots owns compatibility parsing and every type below. These tests deliberately start
 * with normalized repository inputs: no Routine read, RONIN_REPO parse, desks= comparison,
 * environment flag, or second applicability switch belongs here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {
  resolveWorktrees,
  type WorktreesCapability,
  type WorktreesRepositoryInput,
  type WorktreesSetting,
} from '../src/worktrees-resolution.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-worktrees-matrix-'));

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

interface RepositoryFixture {
  input: WorktreesRepositoryInput;
  checkout: string;
  managed: string;
}

async function repository(name: string, worktrees: WorktreesSetting): Promise<RepositoryFixture> {
  const checkout = path.join(tmp, `${name}-checkout`);
  const managed = path.join(tmp, `${name}-managed`);
  await fs.mkdir(checkout, { recursive: true });
  git(checkout, 'init', '-q', '-b', 'main');
  git(checkout, 'config', 'user.email', 'matrix@example.invalid');
  git(checkout, 'config', 'user.name', 'matrix');
  await fs.writeFile(path.join(checkout, 'seed.txt'), `${name}\n`);
  git(checkout, 'add', 'seed.txt');
  git(checkout, 'commit', '-q', '-m', 'seed');
  git(checkout, 'branch', 'agent-worktree');
  git(checkout, 'worktree', 'add', '-q', managed, 'agent-worktree');
  return {
    checkout,
    managed,
    input: {
      project_root: name,
      repo: name,
      checkout,
      managed: { worktree: managed, branch: 'agent-worktree', line: 'team/matrix/dev' },
      worktrees,
      branches: { working: worktrees === 'enabled' ? 'dev' : 'main', stable: 'main' },
      applicability_source: 'RONIN_REPO',
    },
  };
}

async function editAndCommit(location: string, marker: string): Promise<string> {
  const file = path.join(location, `${marker}.txt`);
  await fs.writeFile(file, `${marker}\n`);
  git(location, 'add', path.basename(file));
  git(location, 'commit', '-q', '-m', marker);
  return git(location, 'rev-parse', 'HEAD');
}

const agent = (worktrees: WorktreesSetting): WorktreesCapability => ({
  worktrees,
  provenance: worktrees === 'enabled' ? 'team:routines.ronin_worktrees' : 'campaign:routines.ronin_worktrees',
});

for (const [agentSetting, repositorySetting, expectedMode, expectedReason] of [
  ['disabled', 'disabled', 'direct', 'agent_disabled'],
  ['disabled', 'enabled', 'direct', 'agent_disabled'],
  ['enabled', 'disabled', 'direct', 'repository_disabled'],
  ['enabled', 'enabled', 'managed', 'agent_and_repository_enabled'],
] as const) {
  test(`matrix: Agent ${agentSetting}, repository ${repositorySetting} edits and commits through ${expectedMode}`, async () => {
    const fixture = await repository(`cell-${agentSetting}-${repositorySetting}`, repositorySetting);
    const resolution = resolveWorktrees({ capability: agent(agentSetting), repositories: [fixture.input] });
    const row = resolution.repositories[0]!;
    const expectedLocation = expectedMode === 'managed' ? fixture.managed : fixture.checkout;
    const untouchedLocation = expectedMode === 'managed' ? fixture.checkout : fixture.managed;
    const untouchedBefore = git(untouchedLocation, 'rev-parse', 'HEAD');

    assert.equal(resolution.packet, agentSetting);
    assert.equal(row.mode, expectedMode);
    assert.equal(row.worktrees, expectedMode === 'managed' ? 'enabled' : 'disabled');
    assert.equal(row.reason, expectedReason);
    assert.equal(row.location, expectedLocation);
    assert.equal(row.provenance.repository, 'RONIN_REPO');

    const committed = await editAndCommit(row.location, `edit-${agentSetting}-${repositorySetting}`);
    assert.equal(git(expectedLocation, 'rev-parse', 'HEAD'), committed, 'the selected location carries the edit and commit');
    assert.equal(git(untouchedLocation, 'rev-parse', 'HEAD'), untouchedBefore, 'the other checkout/worktree was not committed');
  });
}

test('mixed assignment resolves each repository independently and preserves both rows', async () => {
  const managed = await repository('mixed-managed', 'enabled');
  const direct = await repository('mixed-direct', 'disabled');
  const resolution = resolveWorktrees({ capability: agent('enabled'), repositories: [managed.input, direct.input] });

  assert.deepEqual(
    resolution.repositories.map(({ repo, mode, location, reason }) => ({ repo, mode, location, reason })),
    [
      { repo: 'mixed-managed', mode: 'managed', location: managed.managed, reason: 'agent_and_repository_enabled' },
      { repo: 'mixed-direct', mode: 'direct', location: direct.checkout, reason: 'repository_disabled' },
    ],
    'the primary/first repository does not leak its applicability into the next row',
  );

  const managedCheckoutBefore = git(managed.checkout, 'rev-parse', 'HEAD');
  const directManagedBefore = git(direct.managed, 'rev-parse', 'HEAD');
  const managedCommit = await editAndCommit(resolution.repositories[0]!.location, 'mixed-managed-edit');
  const directCommit = await editAndCommit(resolution.repositories[1]!.location, 'mixed-direct-edit');

  assert.equal(git(managed.managed, 'rev-parse', 'HEAD'), managedCommit);
  assert.equal(git(direct.checkout, 'rev-parse', 'HEAD'), directCommit);
  assert.equal(git(managed.checkout, 'rev-parse', 'HEAD'), managedCheckoutBefore);
  assert.equal(git(direct.managed, 'rev-parse', 'HEAD'), directManagedBefore);
});

test('enabled plus enabled refuses a missing managed candidate by repository name', async () => {
  const fixture = await repository('missing-managed', 'enabled');
  const input: WorktreesRepositoryInput = { ...fixture.input, managed: undefined };
  assert.throws(
    () => resolveWorktrees({ capability: agent('enabled'), repositories: [input] }),
    /Worktrees is enabled for missing-managed, but no managed candidate was supplied/,
  );
});

test.after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});
