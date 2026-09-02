import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RoutineRow } from '../src/definitions.js';
import { projectRoutineTools } from '../src/routine-tools.js';
import type { ResolvedRoutine } from '../src/routines.js';

const exec = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-routine-tools-'));
process.env.RONIN_SESSION_COMMANDS_DIR = temp;

const routine = (name: string, enabled: boolean, tools: string[]): ResolvedRoutine => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false,
  reading: [], sops: [], macros: [], actions: [], tools, mcp: [], requires: [],
  enabled, stated_by: 'campaign', required_by: [],
} satisfies RoutineRow & ResolvedRoutine);

test('birth PATH exposes enabled tools by name without inheriting a Ronin PATH', async () => {
  const projected = await projectRoutineTools('pathless', [
    routine('ronin_base', true, ['tejun']),
    routine('ronin_worktrees', false, ['tejun-desk']),
  ], '/usr/bin:/bin');
  const tejun = await exec('/bin/sh', ['-c', 'command -v tejun'], { env: { PATH: projected.path } });
  assert.equal(tejun.stdout.trim(), path.join(projected.dir, 'tejun'));
  await assert.rejects(() => exec('/bin/sh', ['-c', 'command -v tejun-desk'], { env: { PATH: projected.path } }));
  assert.ok(projected.delivered.includes('shim/tmux'), 'the tmux guard is Routine floor');
});

test('missing enabled tools are visible and do not refuse projection', async () => {
  const projected = await projectRoutineTools('missing', [routine('example', true, ['not-installed'])]);
  assert.ok(projected.missing.includes('not-installed'));
});

/* A BORN SESSION RUNS ITS TOOLS THROUGH THESE SYMLINKS, so every ronin_bin tool that
 * locates the repository from its own path must resolve the link first (measured
 * 2026-09-02: `tejun-desk`, `tejun-wipeboard`, `read_tegami`, `write_tegami`, `tejun`
 * all failed from a projected session, and the guard shims had been fixed the day
 * before). Each is run exactly as a session would type it, with an invocation that stops
 * before it needs a tmux session, and must not report a path it could not reach. */
const REACH_FAILURES = /Cannot find module|command not found|No such file or directory|NO-REPO/;
test('projected ronin_bin tools resolve the symlink and reach the repository', async () => {
  const tools = ['tejun', 'tejun-desk', 'tejun-wipeboard', 'tejun-send', 'read_tegami', 'write_tegami', 'tejun-survey', 'tejun-account'];
  const projected = await projectRoutineTools('resolve', [routine('ronin_base', true, tools)]);
  for (const t of tools) assert.ok(projected.delivered.includes(t), `${t} projected`);
  const env = { ...process.env, PATH: projected.path, RONIN_SESSION_DIR: temp };
  delete env.TMUX; delete env.TMUX_PANE;
  const run = async (args: string[]) => {
    try {
      const r = await exec('/bin/sh', ['-c', `${args.join(' ')} </dev/null`], { env, timeout: 60_000 });
      return { code: 0, out: r.stdout + r.stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return { code: err.code ?? 1, out: (err.stdout ?? '') + (err.stderr ?? '') };
    }
  };
  const tejun = await run(['tejun']);
  assert.match(tejun.out, /forkit/, `tejun lists the stock macros through the symlink: ${tejun.out}`);
  const desk = await run(['tejun-desk', '--help']);
  assert.equal(desk.code, 0);
  assert.match(desk.out, /^usage: tejun-desk/, desk.out);
  for (const args of [['tejun-wipeboard'], ['tejun-send'], ['read_tegami', '--session', 'nobody'], ['write_tegami', '--session', 'nobody', '--at', '1'], ['tejun-survey'], ['tejun-account']]) {
    const r = await run(args);
    assert.doesNotMatch(r.out, REACH_FAILURES, `${args.join(' ')}: ${r.out}`);
  }
});
