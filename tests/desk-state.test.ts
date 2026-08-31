import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/* CONTROL SURFACE, Fable 4 — desk state is DERIVED from git, never asked of the agent.
 * Every repo here is a throwaway under tmpdir; nothing touches a real checkout, a real
 * letter, or the live tmux server. */
const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-desk-state-'));
process.env.RONIN_SESSION_DIR = path.join(root, 'sessions');
const { deriveDesk, fromStatus, rollup, locatorFrom, sameDesk, shortRepo } = await import('../src/desk-state.js');
const { readRepos, tegamiPath } = await import('../src/tegami.js');
const { sessionKey } = await import('../src/session-dir.js');

const git = async (dir: string, ...args: string[]) =>
  (await exec('git', ['-C', dir, ...args], { env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } })).stdout.trim();

/** A repo on `dev`, a team line cut from it, and a desk worktree on the team line. */
async function repoWithDesk(name: string) {
  const home = path.join(root, name);
  await fs.mkdir(home, { recursive: true });
  await git(home, 'init', '-q', '-b', 'dev');
  await fs.writeFile(path.join(home, 'a.txt'), 'one\n');
  await git(home, 'add', '.');
  await git(home, 'commit', '-q', '-m', 'one');
  await git(home, 'branch', 'team/comp/dev');
  const desk = path.join(root, 'worktrees', name, 'team', 'comp', 'fable');
  await git(home, 'worktree', 'add', '-q', '-b', 'team/comp/fable', desk, 'team/comp/dev');
  await git(home, 'branch', '--set-upstream-to=team/comp/dev', 'team/comp/fable');
  return { home, desk };
}

test('a plain checkout is one desk with no line — nothing invented', async () => {
  const home = path.join(root, 'plain');
  await fs.mkdir(home, { recursive: true });
  await git(home, 'init', '-q', '-b', 'dev');
  await fs.writeFile(path.join(home, 'a.txt'), 'x\n');
  await git(home, 'add', '.');
  await git(home, 'commit', '-q', '-m', 'x');
  const d = await deriveDesk({ repo: home, branch: 'dev' }, { root: 'plain', dir: home }, 's');
  assert.equal(d.line, null);
  assert.equal(d.ahead, null);
  assert.equal(d.worktree, home);
  assert.equal(d.readout, 'open');
  assert.equal(d.dirty, false);
  assert.equal(d.root, 'plain');
  assert.ok(d.tip);
  assert.equal(d.source, 'git');
  assert.equal(d.pending, null);
  const r = rollup([d]);
  assert.deepEqual(r, { desks: 1, private: 0, dirty: 0, pending: 0, parked: 0, blocked: 0, lined: 0 });
});

test('a desk on a team line: worktree found, line from upstream, ahead counted, dirt counted', async () => {
  const { home, desk } = await repoWithDesk('lined');
  await fs.writeFile(path.join(desk, 'b.txt'), 'two\n');
  await git(desk, 'add', '.');
  await git(desk, 'commit', '-q', '-m', 'two');
  await fs.writeFile(path.join(desk, 'c.txt'), 'unsaved\n');
  const d = await deriveDesk({ repo: home, branch: 'team/comp/fable' }, { root: 'r', dir: home }, 'fable');
  assert.equal(d.worktree, desk);
  assert.equal(d.line, 'team/comp/dev');
  assert.equal(d.ahead, 1);
  assert.equal(d.behind, 0);
  assert.deepEqual(d.dirty_files, ['c.txt']);
  assert.equal(d.dirty, true);
  assert.notEqual(d.tip, d.line_tip);
  assert.equal(rollup([d]).private, 1);
  assert.equal(rollup([d]).dirty, 1);
});

test('the line moving shows as behind; a branch with no worktree is a parked desk', async () => {
  const { home } = await repoWithDesk('parked');
  await fs.writeFile(path.join(home, 'z.txt'), 'line moved\n');
  await git(home, 'add', '.');
  await git(home, 'commit', '-q', '-m', 'line moved');
  await git(home, 'branch', '-f', 'team/comp/dev', 'dev');
  await git(home, 'worktree', 'remove', '--force', path.join(root, 'worktrees', 'parked', 'team', 'comp', 'fable'));
  const d = await deriveDesk({ repo: home, branch: 'team/comp/fable' }, { root: 'r', dir: home }, 'fable');
  assert.equal(d.worktree, null);
  assert.equal(d.readout, 'parked');
  assert.equal(d.mounted, false);
  assert.equal(d.behind, 1);
  assert.equal(d.dirty, null);
  assert.equal(rollup([d]).parked, 1);
});

test('the line is implied from the branch path when no upstream is set, only if the ref exists', async () => {
  const { home } = await repoWithDesk('implied');
  await git(home, 'branch', '--unset-upstream', 'team/comp/fable');
  const d = await deriveDesk({ repo: home, branch: 'team/comp/fable' }, { root: 'r', dir: home }, 'fable');
  assert.equal(d.line, 'team/comp/dev');
  await git(home, 'branch', 'team/other/x');
  const none = await deriveDesk({ repo: home, branch: 'team/other/x' }, { root: 'r', dir: home }, 'x');
  assert.equal(none.line, null, 'team/other/dev does not exist, so no line is invented');
});

test('a registry DeskStatus maps into the same shape, and its facts reach the roll-up', async () => {
  const st = {
    repo: 'cowork', root: 'cowork', branch: 'team/comp/fable', worktree: '/w/cowork/team/comp/fable', line: 'team/comp/dev',
    mode: 'reviewed' as const, session: 'fable', team: 'comp', assignment: 'fable@comp', state: 'parked' as const, opened_at: 'x',
    mounted: false, tip: 'abc', line_tip: 'def', dirty: false, dirty_files: [], ahead: 3, behind: 1,
    pending: { line_sha: 'def', by: 'wispr', at: 'y', overlap: ['a.txt'] }, last_hand_in: 'hi_1', blocked: 'candidate conflicted on a.txt',
  };
  const d = fromStatus(st);
  assert.equal(d.source, 'registry');
  assert.equal(d.readout, 'parked');
  assert.equal(d.worktree, null, 'unmounted: no path is claimed');
  assert.equal(d.dirty, null);
  assert.equal(d.ahead, 3);
  assert.equal(d.pending?.by, 'wispr');
  assert.equal(d.last_hand_in, 'hi_1');
  const r = rollup([d]);
  assert.deepEqual(r, { desks: 1, private: 3, dirty: 0, pending: 1, parked: 1, blocked: 1, lined: 1 });
});

test('an unresolved TEGAMI repo does not duplicate its registered desk', () => {
  const recorded = fromStatus({
    repo: 'ronin_cowork', root: 'ronin_cowork', branch: 'team/sea_settle/forms_ui', worktree: '/w/forms_ui',
    line: 'team/sea_settle/dev', mode: 'reviewed', session: 'forms_ui', team: 'sea_settle', assignment: 'forms_ui@sea_settle',
    state: 'open', opened_at: 'x', mounted: true, tip: 'abc', line_tip: 'def', dirty: false, dirty_files: [],
    ahead: 0, behind: 0, pending: null, last_hand_in: '', blocked: '',
  });
  assert.equal(sameDesk(recorded, { repo: 'ronin_cowork', branch: 'team/sea_settle/forms_ui' }, null), true);
  assert.equal(sameDesk(recorded, { repo: 'ronin_cowork', branch: 'team/sea_settle/other' }, null), false);
});

test('an unlocatable repo is an unknown desk, not an error', async () => {
  const d = await deriveDesk({ repo: 'https://example.invalid/x.git', branch: 'dev' }, null, 's');
  assert.equal(d.readout, 'unknown');
  assert.equal(d.short, 'x');
  assert.equal(shortRepo('https://github.com/ronincowork/ronin-cowork.git'), 'ronin-cowork');
});

test('locatorFrom matches a project root by remote (with or without .git) or by dir', async () => {
  const locate = locatorFrom([{ name: 'cowork', dir: '/r/cowork', remote: 'https://x/ronin-cowork.git' }]);
  assert.deepEqual(await locate('https://x/ronin-cowork'), { root: 'cowork', dir: '/r/cowork' });
  assert.deepEqual(await locate('/r/cowork'), { root: 'cowork', dir: '/r/cowork' });
  assert.equal(await locate('https://x/other.git'), null);
});

test('readRepos is a keyhole: optional worktree/line kept, junk dropped, no letter reads as none', async () => {
  const file = tegamiPath(await sessionKey('letter_repos'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, ['# TEGAMI', '', '```json', '{ "session_role": "CutCode",', '  "repos": [ {"repo":"https://x/a.git","branch":"team/comp/fable","worktree":"/w/a","line":"team/comp/dev","extra":1}, {"repo":"","branch":""}, 7 ],', '  "ladder": [] }', '```', ''].join('\n'));
  assert.deepEqual(await readRepos('letter_repos'), [{ repo: 'https://x/a.git', branch: 'team/comp/fable', worktree: '/w/a', line: 'team/comp/dev' }]);
  assert.deepEqual(await readRepos('never_born'), []);
});
