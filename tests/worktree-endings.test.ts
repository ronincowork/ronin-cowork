import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-endings-'));
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
const repo = path.join(tmp, 'repo');
const worktree = path.join(tmp, 'desk');
const sh = (dir: string, args: string[]) => execFileSync('git', ['-C', dir, ...args]).toString().trim();
await fs.mkdir(repo);
sh(repo, ['init', '-q', '-b', 'dev']);
sh(repo, ['config', 'user.name', 'test']);
sh(repo, ['config', 'user.email', 'test@example.invalid']);
await fs.writeFile(path.join(repo, 'base.txt'), 'base\n');
sh(repo, ['add', '.']); sh(repo, ['commit', '-q', '-m', 'base']);
sh(repo, ['worktree', 'add', '-q', '-b', 'team/t/a', worktree, 'dev']);
sh(worktree, ['config', 'user.name', 'test']); sh(worktree, ['config', 'user.email', 'test@example.invalid']);
await fs.writeFile(path.join(worktree, 'staged.txt'), 'staged\n'); sh(worktree, ['add', 'staged.txt']);
await fs.writeFile(path.join(worktree, 'loose.txt'), 'loose\n');

const { inspectEnding, closeoutMessage, parsePorcelainZ } = await import('../src/desks/ending.js');
const { isTeamLineEndingFact } = await import('../src/desks/ending-runtime.js');
const { quarantineDesk, readQuarantine, writeDiscardReceipt } = await import('../src/desks/quarantine.js');

test('porcelain parser keeps staged, unstaged, and untracked names separate', () => {
  assert.deepEqual(parsePorcelainZ('A  staged.txt\0 M tracked.txt\0?? loose.txt\0'), {
    staged: ['staged.txt'], unstaged: ['tracked.txt'], untracked: ['loose.txt'],
  });
});

test('an unassigned session desk is never classified as a team-line fact', () => {
  const common = {
    repo: 'r', branch: 'team/t/session', line: 'team/t/dev', repo_dir: '/r', worktree: '/w', mounted: false,
    tip: 'tip', line_tip: 'line', owners: ['session'], team: 't',
  };
  assert.equal(isTeamLineEndingFact({ ...common, kind: 'desk' }), false);
  assert.equal(isTeamLineEndingFact({ ...common, kind: 'team_line' }), true);
});

test('ending preflight names sole-owner work and prompts only reachable owners', async () => {
  const tip = sh(repo, ['rev-parse', 'team/t/a']);
  const line_tip = sh(repo, ['rev-parse', 'dev']);
  const preflight = await inspectEnding({
    scope: 'session', subject: 'a', requested_action: 'archive',
    desks: [{ kind: 'desk', repo: 'r', branch: 'team/t/a', line: 'dev', repo_dir: repo, worktree, mounted: true,
      tip, line_tip, owners: ['a', 'dead'], team: 't' }],
    ownerReachable: (owner) => owner === 'a',
  });
  assert.deepEqual(preflight.choices, ['prompt', 'ignore']);
  assert.deepEqual(preflight.prompt_targets, ['a']);
  assert.deepEqual(preflight.unresolved[0].changes, { staged: ['staged.txt'], unstaged: [], untracked: ['loose.txt'] });
  assert.match(closeoutMessage(preflight, 'a'), /staged\.txt, loose\.txt/);
  assert.doesNotMatch(closeoutMessage(preflight, 'a'), /dead/);
});

test('Ignore custody writes patches, untracked files, manifest, and an explicit ref', async () => {
  const preflight = await inspectEnding({
    scope: 'session', subject: 'a', requested_action: 'delete',
    desks: [{ kind: 'desk', repo: 'r', branch: 'team/t/a', line: 'dev', repo_dir: repo, worktree, mounted: true,
      tip: sh(repo, ['rev-parse', 'team/t/a']), line_tip: sh(repo, ['rev-parse', 'dev']), owners: ['a'], team: 't' }],
    ownerReachable: () => false,
  });
  const manifest = await quarantineDesk(preflight.unresolved[0], 'fixture');
  assert.equal(sh(repo, ['rev-parse', manifest.quarantine_ref]), manifest.tip);
  assert.equal(await fs.readFile(path.join(process.env.RONIN_DESKS_DIR!, 'quarantine/r/fixture/untracked/loose.txt'), 'utf8'), 'loose\n');
  assert.match(await fs.readFile(path.join(process.env.RONIN_DESKS_DIR!, 'quarantine/r/fixture/staged.patch'), 'utf8'), /staged\.txt/);
  assert.deepEqual(await readQuarantine('r', 'fixture'), manifest);
});

test('discard requires confirmation and records the exact commits and files', async () => {
  await assert.rejects(writeDiscardReceipt({ confirmation: '', repo: 'r', branch: 'b', owners: ['a'], commits: ['1'], files: ['x'] }), /explicit confirmation/);
  const receipt = await writeDiscardReceipt({ confirmation: 'DISCARD r:b', repo: 'r', branch: 'b', owners: ['a'], commits: ['1'], files: ['x'] });
  assert.equal(receipt.confirmation, 'DISCARD r:b');
  assert.deepEqual(receipt.commits, ['1']);
  assert.deepEqual(receipt.files, ['x']);
});
