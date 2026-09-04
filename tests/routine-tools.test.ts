import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { RoutineRow } from '../src/resource-adapters.js';
import { projectRoutineTools } from '../src/routine-tools.js';
import type { ResolvedRoutine } from '../src/routines.js';

const exec = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-routine-tools-'));
process.env.RONIN_SESSION_COMMANDS_DIR = temp;
process.env.RONIN_TOOLS_DIR = path.join(temp, 'own-tools');

const routine = (name: string, enabled: boolean, tools: string[]): ResolvedRoutine => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false,
  reading: [], sops: [], macros: [], actions: [], tools, mcp: [], parts: [], requires: [],
  enabled, stated_by: 'campaign', required_by: [],
} satisfies RoutineRow & ResolvedRoutine);

test('birth PATH exposes enabled tools by name without inheriting a Ronin PATH', async () => {
  const projected = await projectRoutineTools('pathless', [
    routine('ronin_base', true, ['write_tegami', 'read_tegami', 'tejun-fork', 'ronin-url']),
    routine('ronin_worktrees', false, ['tejun-desk']),
  ], '/usr/bin:/bin');
  for (const command of ['write_tegami', 'read_tegami', 'tejun-fork', 'ronin-url']) {
    const found = await exec('/bin/sh', ['-c', `command -v ${command}`], { env: { PATH: projected.path } });
    assert.equal(found.stdout.trim(), path.join(projected.dir, command), command);
  }
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
 * before it needs a tmux session, and must not report a path it could not reach.
 *
 * The same route carries the operator address: the shell callers of `ronin-url` find it
 * beside their own REAL file, never by name on PATH (OPEN_THREADS 4.48 measured every
 * caller broken when it was looked up by name). So each caller is run through its
 * projected symlink with only `RONIN_URL` set, and must arrive at the operator it names. */
const REACH_FAILURES = /Cannot find module|command not found|No such file or directory|NO-REPO/;
const URL_CALLERS = ['tejun-fork', 'tejun-harakiri', 'tejun-session-set', 'tejun-team-set', 'tejun-teampage', 'mika'];
test('projected ronin_bin tools resolve the symlink and reach the repository and the operator', async (t) => {
  const tools = ['tejun', 'tejun-desk', 'tejun-wipeboard', 'tejun-send', 'read_tegami', 'write_tegami', 'tejun-survey', 'tejun-account', 'ronin-url', ...URL_CALLERS];
  const projected = await projectRoutineTools('resolve', [routine('ronin_base', true, tools)]);
  for (const t of tools) assert.ok(projected.delivered.includes(t), `${t} projected`);
  const reached: string[] = [];
  const operator = createServer((req, res) => {
    reached.push(req.url ?? '');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/harakiri') { res.statusCode = 404; res.end('{}'); return; } // 200 makes the tool wait 15s to die
    if (req.url === '/api/sessions') { res.end('[]'); return; }
    res.end(JSON.stringify({ stdout: req.url === '/api/cli/desk' ? 'usage: tejun-desk\n' : '', stderr: '', exit: 0 }));
  });
  await new Promise<void>((resolve) => operator.listen(0, '127.0.0.1', resolve));
  t.after(() => operator.close());
  const address = operator.address() as AddressInfo;
  const env = {
    ...process.env,
    PATH: projected.path,
    RONIN_SESSION_DIR: temp,
    RONIN_URL: `http://127.0.0.1:${address.port}`,
    RONIN_CLI_TOKEN: 'test-token',
  };
  delete env.TMUX; delete env.TMUX_PANE;
  const run = async (args: string[], extra: Record<string, string> = {}) => {
    try {
      const r = await exec('/bin/sh', ['-c', `${args.join(' ')} </dev/null`], { env: { ...env, ...extra }, timeout: 60_000 });
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
  // Each caller, past its own argument check, must knock on the fake operator: the only
  // way there is `$TOOL_DIR/ronin-url` resolved from the real file behind the symlink.
  const knocks: Array<[string[], string, Record<string, string>]> = [
    [['tejun-fork', '--name', 'reach'], '/api/session', {}],
    [['tejun-harakiri'], '/api/harakiri', { TMUX_PANE: '%0' }],
    [['tejun-session-set', 'reach'], '/api/session', {}],
    [['tejun-team-set', 'reach'], '/api/team', {}],
    [['mika'], '/api/mika', {}],
  ];
  for (const [args, door, extra] of knocks) {
    reached.length = 0;
    const r = await run(args, extra);
    assert.doesNotMatch(r.out, REACH_FAILURES, `${args.join(' ')}: ${r.out}`);
    assert.ok(reached.includes(door), `${args.join(' ')} reached ${door}; saw ${JSON.stringify(reached)}: ${r.out}`);
  }
  // tejun-teampage needs a live pane before it asks for the address; through the symlink
  // it must still reach its own refusal, not a missing helper.
  const page = await run(['tejun-teampage']);
  assert.doesNotMatch(page.out, REACH_FAILURES, page.out);
  assert.match(page.out, /NO-SESSION/, page.out);
});

test('a tool in the owner\'s tools store is projected by name, and shadows a shipped one', async () => {
  await fs.mkdir(process.env.RONIN_TOOLS_DIR!, { recursive: true });
  await fs.writeFile(path.join(process.env.RONIN_TOOLS_DIR!, 'tejun-review'), '#!/bin/sh\necho REVIEWED\n', { mode: 0o755 });
  await fs.writeFile(path.join(process.env.RONIN_TOOLS_DIR!, 'tejun'), '#!/bin/sh\necho MINE\n', { mode: 0o755 });
  const projected = await projectRoutineTools('owned', [routine('weekly_review', true, ['tejun-review', 'tejun', 'tejun-missing'])]);
  assert.deepEqual(projected.delivered, ['shim/tmux', 'tejun', 'tejun-review']);
  assert.deepEqual(projected.missing, ['tejun-missing']);
  assert.equal(await fs.readlink(path.join(projected.dir, 'tejun-review')), path.join(process.env.RONIN_TOOLS_DIR!, 'tejun-review'));
  assert.equal(await fs.readlink(path.join(projected.dir, 'tejun')), path.join(process.env.RONIN_TOOLS_DIR!, 'tejun'));
});
