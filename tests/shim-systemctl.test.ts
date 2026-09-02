import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* THE SYSTEMCTL SHIM MUST FIND THE REAL SYSTEMCTL PAST EVERY SHIM — its own symlinks
 * AND other checkouts' copies. The floor projects bin/shim/systemctl into every
 * session's command store as a symlink; with the repo's bin/shim and a session's store
 * both on PATH, stripping only the caller's directory handed the shim a symlink to
 * itself, it exec'd itself forever, and serviceUnit() timed out into a false "unit
 * absent" while /usr/bin/systemctl showed ronin.service healthy (2026-09-02, the
 * promotion blocker). A promotion candidate's checkout carries its own DIFFERENT
 * bin/shim/systemctl (another inode -ef cannot catch), so the shim also rejects any
 * candidate whose resolved directory ends in bin/shim. Test authored by @worktree_audit
 * (four cases); the fifth pins the different-inode rule. Every case runs under a hard
 * timeout: recursion is the failure. */

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shimDir = path.join(repo, 'bin', 'shim');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-shim-systemctl-'));
const fake = path.join(temp, 'fakebin');
const projected = path.join(temp, 'session-commands', 'coordinator');
await fs.mkdir(fake, { recursive: true });
await fs.mkdir(projected, { recursive: true });
await fs.writeFile(path.join(fake, 'systemctl'), '#!/bin/sh\nprintf "REAL %s\\n" "$*"\n', { mode: 0o755 });
await fs.writeFile(path.join(fake, 'tmux'), '#!/bin/sh\n[ "$1" = list-sessions ] && printf "agent_a\\ngrid_view\\n"\n', { mode: 0o755 });
// The projection: symlinks back into the repo's shims, exactly as routine-tools.ts makes them.
await fs.symlink(path.join(shimDir, 'systemctl'), path.join(projected, 'systemctl'));
await fs.symlink(path.join(shimDir, 'tmux'), path.join(projected, 'tmux'));

const PATH = [projected, shimDir, fake, '/usr/bin', '/bin'].join(':');
const run = async (bin: string, args: string[], extra: Record<string, string> = {}) => {
  try {
    const r = await exec(bin, args, { env: { PATH, HOME: os.homedir(), ...extra }, timeout: 5_000 });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    const x = e as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
    return { code: x.killed ? 'TIMEOUT' : (x.code ?? 1), out: x.stdout ?? '', err: x.stderr ?? '' };
  }
};

test('through the projected symlink, the shim reaches the real systemctl instead of itself', async () => {
  const r = await run(path.join(projected, 'systemctl'), ['--user', 'status', 'ronin']);
  assert.equal(r.code, 0, `${r.code} ${r.err}`);
  assert.equal(r.out.trim(), 'REAL --user status ronin');
});

test('by its repo path, with the projected symlink also on PATH, the shim still reaches the real one', async () => {
  const r = await run(path.join(shimDir, 'systemctl'), ['--user', 'show', 'ronin', '-p', 'ActiveState']);
  assert.equal(r.code, 0, `${r.code} ${r.err}`);
  assert.equal(r.out.trim(), 'REAL --user show ronin -p ActiveState');
});

test('the tmux-server guard still refuses with sessions live, asking the real tmux past its shim', async () => {
  const r = await run(path.join(projected, 'systemctl'), ['--user', 'restart', 'tmux-server']);
  assert.equal(r.code, 4, `${r.code} ${r.out} ${r.err}`);
  assert.match(r.err, /ronin-guard: refusing/);
  assert.match(r.err, /agent_a/);
  assert.doesNotMatch(r.err, /grid_view/, 'viewer sessions are not counted');
});

test('the escape hatch still passes the restart through to the real systemctl', async () => {
  const r = await run(path.join(projected, 'systemctl'), ['--user', 'restart', 'tmux-server'], { RONIN_KILL_TMUX: '1' });
  assert.equal(r.code, 0, `${r.code} ${r.err}`);
  assert.equal(r.out.trim(), 'REAL --user restart tmux-server');
});

test('a different checkout\'s own bin/shim copy on PATH is rejected too (not the same inode)', async () => {
  // A promotion candidate carries its own bin/shim/systemctl — a distinct FILE that -ef
  // can never match. With both checkouts on PATH, the two copies once resolved each other.
  const candidate = path.join(temp, 'candidate', 'bin', 'shim');
  await fs.mkdir(candidate, { recursive: true });
  await fs.copyFile(path.join(shimDir, 'systemctl'), path.join(candidate, 'systemctl'));
  await fs.chmod(path.join(candidate, 'systemctl'), 0o755);
  const both = [candidate, projected, shimDir, fake, '/usr/bin', '/bin'].join(':');
  const r = await (async () => {
    try {
      const x = await exec(path.join(shimDir, 'systemctl'), ['--user', 'is-active', 'ronin'], { env: { PATH: both, HOME: os.homedir() }, timeout: 5_000 });
      return { code: 0, out: x.stdout, err: x.stderr };
    } catch (e) {
      const x = e as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean };
      return { code: x.killed ? 'TIMEOUT' : (x.code ?? 1), out: x.stdout ?? '', err: x.stderr ?? '' };
    }
  })();
  assert.equal(r.code, 0, `${r.code} ${r.err}`);
  assert.equal(r.out.trim(), 'REAL --user is-active ronin');
});
