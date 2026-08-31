import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-funnel-recovery-'));
process.env.RONIN_WORKTREES_DIR = path.join(root, 'worktrees');
process.env.RONIN_PROMOTION_LEDGER_DIR = path.join(root, 'ledger');
const F = await import('../src/promotion/funnel-recovery.js');
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function fixture(): Promise<string> {
  const dir = path.join(root, `repo-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'dev');
  await fs.writeFile(path.join(dir, 'kept.txt'), 'base\n');
  await fs.writeFile(path.join(dir, 'overlap.txt'), 'base\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'branch', 'team/demo/dev');
  const line = path.join(root, `line-${Math.random().toString(36).slice(2)}`);
  git(dir, 'worktree', 'add', '-q', line, 'team/demo/dev');
  await fs.writeFile(path.join(line, 'overlap.txt'), 'candidate\n');
  git(line, 'add', '-A'); git(line, 'commit', '-q', '-m', 'candidate');
  git(dir, 'worktree', 'remove', '--force', line);
  const saved = path.join(root, `saved-${Math.random().toString(36).slice(2)}`);
  git(dir, 'worktree', 'add', '-q', '-b', 'agent/saved-copy', saved, 'dev');
  await fs.writeFile(path.join(saved, 'kept.txt'), 'already committed\n');
  git(saved, 'add', '-A'); git(saved, 'commit', '-q', '-m', 'saved elsewhere');
  git(dir, 'worktree', 'remove', '--force', saved);
  await fs.writeFile(path.join(dir, 'kept.txt'), 'already committed\n');
  await fs.writeFile(path.join(dir, 'overlap.txt'), 'unique local version\n');
  await fs.writeFile(path.join(dir, 'untracked.txt'), 'unique untracked\n');
  return dir;
}

test('diagnoses provenance and overlap, preserves the whole dirty state, then clears only verified tracked dirt', async () => {
  const dir = await fixture();
  const ledger = path.join(root, `receipts-${Math.random().toString(36).slice(2)}`);
  const r = await F.diagnoseFunnel({ repo: 'demo', dir, line: 'team/demo/dev', target: 'dev' }, 'owner-agent', ledger);
  assert.equal(r.state, 'diagnosed');
  assert.equal(r.paths.find((p) => p.path === 'kept.txt')?.classification, 'preserved');
  assert.ok(r.paths.find((p) => p.path === 'kept.txt')?.identical_refs.includes('agent/saved-copy'));
  assert.equal(r.paths.find((p) => p.path === 'overlap.txt')?.classification, 'unique');
  assert.equal(r.paths.find((p) => p.path === 'overlap.txt')?.overlaps_candidate, true);
  assert.equal(r.paths.find((p) => p.path === 'untracked.txt')?.tracked, false);

  const saved = await F.preserveFunnel(r.id, ledger);
  assert.equal(saved.state, 'preserved');
  assert.match(saved.recovery_ref ?? '', /^recovery\//);
  assert.equal(git(dir, 'show', `${saved.recovery_ref}:overlap.txt`), 'unique local version');
  assert.equal(git(dir, 'show', `${saved.recovery_ref}:untracked.txt`), 'unique untracked');

  const clean = await F.clearFunnel(r.id, ledger);
  assert.equal(clean.state, 'clean');
  assert.equal(await fs.readFile(path.join(dir, 'kept.txt'), 'utf8'), 'base\n');
  assert.equal(await fs.readFile(path.join(dir, 'overlap.txt'), 'utf8'), 'base\n');
  assert.equal(await fs.readFile(path.join(dir, 'untracked.txt'), 'utf8'), 'unique untracked\n', 'untracked work is preserved in place too');
  assert.equal(git(dir, 'status', '--porcelain').trim(), '?? untracked.txt');
});

test('stops when content drifts after diagnosis and does not create a recovery branch', async () => {
  const dir = await fixture();
  const ledger = path.join(root, `receipts-${Math.random().toString(36).slice(2)}`);
  const r = await F.diagnoseFunnel({ repo: 'demo', dir, line: 'team/demo/dev', target: 'dev' }, 'owner-agent', ledger);
  await fs.writeFile(path.join(dir, 'overlap.txt'), 'changed again\n');
  const stopped = await F.preserveFunnel(r.id, ledger);
  assert.equal(stopped.state, 'stopped');
  assert.match(stopped.history.at(-1)?.detail ?? '', /overlap.txt/);
  assert.equal(git(dir, 'branch', '--list', `recovery/${r.id}`), '');
});
