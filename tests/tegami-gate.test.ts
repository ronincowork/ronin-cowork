import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/* LAUNCH_READY leg 3 — `writeGate` is loud, and it is a GUEST in the session's letter.
 * Its refusals are the interesting half: the moment an agent has written a real ladder,
 * those are its words. The store root is redirected per the env contract in src/stores.ts
 * so this test never touches a real session. */
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-gate-test-'));
process.env.RONIN_SESSION_DIR = root;
const { checkoutAt, seedTegami, writeGate, tegamiPath, envWithoutGitLocation } = await import('../src/tegami.js');
const { sessionKey } = await import('../src/session-dir.js');
const exec = promisify(execFile);

async function letter(name: string, ladder: string): Promise<string> {
  const file = tegamiPath(await sessionKey(name));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, ['# TEGAMI', '', '```json', `{ "objective": "keep me",`, `  "role_family": "developer",`, `  "session_role": "CutCode",`, `  "ladder": ${ladder} }`, '```', ''].join('\n'));
  return file;
}
const bodyOf = async (f: string) => JSON.parse((await fs.readFile(f, 'utf8')).match(/```json\n([\s\S]*?)\n```/)![1]);

test('an empty ladder takes the gate, and nothing else in the letter moves', async () => {
  const f = await letter('gate_empty', '[]');
  assert.equal(await writeGate('gate_empty', 'The agent never came up.'), true);
  const b = await bodyOf(f);
  assert.deepEqual(b.ladder, [{ gate: 'The agent never came up.', status: 'ACTIVE' }]);
  assert.equal(b.objective, 'keep me'); // the session's own words survive
  assert.equal(b.role_family, 'developer');
  assert.equal(b.session_role, 'CutCode');
});

test("a real ladder is the agent's words and is refused, untouched", async () => {
  const real = '[ { "phase": "find the cause", "legs": [ { "title": "read the tape", "status": "ACTIVE" } ] } ]';
  const f = await letter('gate_busy', real);
  const before = await fs.readFile(f, 'utf8');
  assert.equal(await writeGate('gate_busy', 'clobber me'), false);
  assert.equal(await fs.readFile(f, 'utf8'), before); // byte for byte
});

test('a gate we wrote can be replaced, and cleared when the hold resolves', async () => {
  const f = await letter('gate_clear', '[]');
  await writeGate('gate_clear', 'asking you something');
  assert.equal(await writeGate('gate_clear', 'still asking'), true);
  assert.deepEqual((await bodyOf(f)).ladder, [{ gate: 'still asking', status: 'ACTIVE' }]);
  assert.equal(await writeGate('gate_clear', ''), true);
  assert.deepEqual((await bodyOf(f)).ladder, []);
});

test('no letter, or a letter with no json block, is a refusal and not a crash', async () => {
  assert.equal(await writeGate('gate_absent', 'x'), false);
  const f = tegamiPath(await sessionKey('gate_mangled'));
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, 'somebody hand-mangled this letter\n');
  assert.equal(await writeGate('gate_mangled', 'x'), false);
});

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

  const file = await seedTegami('checkout_seed', 'CutCode', checkout);
  assert.ok(file);
  const body = await bodyOf(file!);
  assert.deepEqual(body.repos, [checkout]);
  // The axis is seeded, and the derived teams block starts present (empty = a ronin).
  assert.equal(body.session_role, 'CutCode');
  assert.deepEqual(body.teams, []);
});

test('a seeded letter carries a blank axis as an empty string, never as a missing key', async () => {
  // A launch with no session_role is ordinary — the tile's own picker. The key is
  // present and empty because "asked and answered none" is a fact, and a reader must
  // not have to tell it apart from a letter written by a schema that had no such key.
  const file = await seedTegami('blank_role_seed', '');
  assert.ok(file);
  const body = await bodyOf(file!);
  assert.equal(body.session_role, '');
  assert.deepEqual(body.mandate, { reach: 'plan', recruit: 'propose agents', output: ['open'] });
  assert.deepEqual(body.teams, [], 'a ronin: on no team, and the block says so');
});

test('a managed launch seeds every assigned worktree and line', async () => {
  const repos = [
    { repo: 'cowork', branch: 'team/campaign/docs', worktree: '/worktrees/cowork/docs', line: 'team/campaign/dev' },
    { repo: 'services', branch: 'team/campaign/docs', worktree: '/worktrees/services/docs', line: 'team/campaign/dev' },
  ];
  const file = await seedTegami('multi_desk_seed', 'WriteDocs', repos);
  assert.ok(file);
  assert.deepEqual((await bodyOf(file!)).repos, repos);
});
