import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ContributionRow } from '../src/resource-adapters.js';
import { projectRoutineTools } from '../src/routine-tools.js';
import type { ResolvedContribution } from '../src/instruction-cascade.js';

const exec = promisify(execFile);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-routine-tools-'));
process.env.RONIN_SESSION_COMMANDS_DIR = temp;
process.env.RONIN_TOOLS_DIR = path.join(temp, 'own-tools');

const routine = (name: string, enabled: boolean, tools: string[]): ResolvedContribution => ({
  name, label: name, blurb: '', origin: 'stock', shadowed: false,
  reading: [], tools, parts: [], requires: [],
  enabled, stated_by: 'campaign', required_by: [],
} satisfies ContributionRow & ResolvedContribution);

test('the PATH projector exposes supplied tools by name without inheriting a Ronin PATH', async () => {
  const projected = await projectRoutineTools('pathless', [
    routine('ronin_base', true, ['work-record', 'session_create', 'ronin-url']),
  ], '/usr/bin:/bin');
  for (const command of ['work-record', 'session_create', 'ronin-url']) {
    const found = await exec('/bin/sh', ['-c', `command -v ${command}`], { env: { PATH: projected.path } });
    assert.equal(found.stdout.trim(), path.join(projected.dir, command), command);
  }
  assert.ok(projected.delivered.includes('shim/tmux'), 'the tmux guard is Routine floor');
});

test('a Cowork capability projects the desk tool without an installation', async () => {
  const projected = await projectRoutineTools('worktree-root', [], '/usr/bin:/bin', {
    extraTools: ['worktree-desk'],
  });
  assert.ok(projected.delivered.includes('worktree-desk'));
  assert.equal(projected.delivered.filter((tool) => tool === 'worktree-desk').length, 1);
});

test('missing enabled tools are visible and do not refuse projection', async () => {
  const projected = await projectRoutineTools('missing', [routine('example', true, ['not-installed'])]);
  assert.ok(projected.missing.includes('not-installed'));
});

/* A BORN SESSION RUNS ITS TOOLS THROUGH THESE SYMLINKS, so every ronin_bin tool that
 * locates the repository from its own path must resolve the link first (measured
 * 2026-09-02: the desk tool, `edges wipeboard`, `work-record read`, `work-record update_record`
 * all failed from a projected session, and the guard shims had been fixed the day
 * before). Each is run exactly as a session would type it, with an invocation that stops
 * before it needs a tmux session, and must not report a path it could not reach.
 *
 * The same route carries the operator address: the shell callers of `ronin-url` find it
 * beside their own REAL file, never by name on PATH (OPEN_THREADS 4.48 measured every
 * caller broken when it was looked up by name). So each caller is run through its
 * projected symlink with only `RONIN_URL` set, and must arrive at the operator it names. */
const REACH_FAILURES = /Cannot find module|command not found|No such file or directory|NO-REPO/;
const URL_CALLERS = ['session_archive', 'session_end', 'session_restore', 'session_check', 'session_create', 'session_set', 'team', 'edges', 'mika'];
test('projected ronin_bin tools resolve the symlink and reach the repository and the operator', async (t) => {
  const tools = [...new Set(['worktree-desk', 'edges', 'work-record', 'ronin-host', 'ronin-url', ...URL_CALLERS])];
  const projected = await projectRoutineTools('resolve', [routine('ronin_base', true, tools)]);
  for (const t of tools) assert.ok(projected.delivered.includes(t), `${t} projected`);
  const reached: string[] = [];
  const helpFacts = { provider: `provider-${process.pid}`, cli: `cli-${process.pid}`, model: `model-${process.pid}` };
  const operator = createServer((req, res) => {
    reached.push(req.url ?? '');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/harakiri') { res.statusCode = 404; res.end('{}'); return; } // 200 makes the tool wait 15s to die
    if (req.url === '/api/sessions') { res.end('[]'); return; }
    if (req.url === '/api/provider-catalog') {
      res.end(JSON.stringify({ providers: [{ provider: helpFacts.provider, cli: helpFacts.cli, models: [{ model: helpFacts.model }] }] }));
      return;
    }
    if (req.url === '/api/setup/runtime') {
      res.end(JSON.stringify({ providers: [{ id: helpFacts.cli, installed: true, activated: true }] }));
      return;
    }
    if (req.url === '/api/launch-seed') {
      res.end(JSON.stringify({ seeds: { provider: { value: helpFacts.provider }, model: { value: helpFacts.model } } }));
      return;
    }
    res.end(JSON.stringify({ stdout: req.url === '/api/cli/desk' ? 'usage: worktree-desk\n' : '', stderr: '', exit: 0 }));
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
  // Help parsing is shared by these wrappers and has its own command-level tests. One
  // projected representative proves that the symlink route reaches that parser without
  // paying for the same -h/--help/invalid subprocess matrix for every command here.
  for (const flag of ['-h', '--help']) {
    reached.length = 0;
    const help = await run(['work-record', flag]);
    assert.equal(help.code, 0, `work-record ${flag}: ${help.out}`);
    assert.match(help.out, /work.record/);
    assert.match(help.out, /Usage:/);
    assert.match(help.out, /Related:/);
    assert.equal(reached.length, 0, 'local help never contacts the operator');
  }
  const invalidHelp = await run(['work-record', '--help', 'extra']);
  assert.notEqual(invalidHelp.code, 0, 'projected wrapper refuses surplus help arguments');
  assert.match(invalidHelp.out, /Run work.record --help/);
  reached.length = 0;
  const hostHelp = await run(['ronin-host', '--help']);
  assert.equal(hostHelp.code, 0, hostHelp.out);
  assert.match(hostHelp.out, /ronin-host inspect \[path\]/);
  assert.match(hostHelp.out, /ronin-host account/);
  assert.match(hostHelp.out, /ronin-host secrets \[path\]/);
  assert.match(hostHelp.out, /ronin-host restart/);
  assert.equal(reached.length, 0, 'ronin-host help is local and reflects the projected command');
  const deskHelp = (await run(['worktree-desk', '--help'])).out;
  for (const task of ['open', 'assign', 'status', 'sync', 'hand-in', 'close', 'receipts', 'reply', 'handoff', 'discard', 'repository-init']) {
    assert.match(deskHelp, new RegExp(`worktree-desk ${task}`), `desk help includes ${task}`);
  }
  assert.match(deskHelp, /--source dev\|team/);
  assert.match(deskHelp, /only\s+destructive form/);
  assert.match(deskHelp, /refuses an occupied\s+desk without changing anything/);
  assert.match(deskHelp, /Hard Delete action/);
  assert.match(deskHelp, /None performs Git push/);

  const teamHelp = [
    (await run(['edges', 'team', '--help'])).out,
    (await run(['session_check', '--help'])).out,
    (await run(['session_create', '--help'])).out,
    (await run(['session_set', '--help'])).out,
    (await run(['team', '--help'])).out,
  ].join('\n');
  assert.match(teamHelp, /creates? an Agent/i);
  assert.match(teamHelp, /Create a Team/i);
  assert.match(teamHelp, /adds? membership/i);
  assert.match(teamHelp, /move an Agent/i);
  assert.match(teamHelp, /remove the old Team on that Team's page/i);
  assert.match(teamHelp, /sets? or changes? that Team's lead/i);
  assert.match(teamHelp, /--root <workspace-folder-handle>/);
  assert.doesNotMatch(teamHelp, /--root <path>/);
  for (const args of [['edges', 'wipeboard'], ['edges', 'send'], ['work-record', 'read', '--session', 'nobody'], ['work-record', 'update_record', '--session', 'nobody', '--at', '1'], ['ronin-host', 'inspect'], ['ronin-host', 'account']]) {
    const r = await run(args);
    assert.doesNotMatch(r.out, REACH_FAILURES, `${args.join(' ')}: ${r.out}`);
  }
  // Each caller, past its own argument check, must knock on the fake operator: the only
  // way there is `$TOOL_DIR/ronin-url` resolved from the real file behind the symlink.
  const knocks: Array<[string[], string, Record<string, string>]> = [
    [['session_archive', 'reach'], '/api/sessions/reach/archive', {}],
    [['session_end'], '/api/harakiri', { TMUX_PANE: '%0' }],
    [['session_restore', 'archive-id'], '/api/archived-sessions/archive-id/rehydrate', {}],
    [['session_check', 'reach'], '/api/sessions', {}],
    [['session_create', 'reach'], '/api/session', {}],
    [['session_set', 'reach', '--root', 'lab'], '/api/sessions', {}],
    [['team', 'roster', 'write', 'reach'], '/api/team', {}],
    // `mika` asks tmux first; a live Mika on the box must not turn this knock into a send.
    // (An existing empty dir: tmux falls back to /tmp when TMUX_TMPDIR is missing.)
    [['mika'], '/api/mika', { TMUX_TMPDIR: temp }],
  ];
  for (const [args, door, extra] of knocks) {
    reached.length = 0;
    const r = await run(args, extra);
    assert.doesNotMatch(r.out, REACH_FAILURES, `${args.join(' ')}: ${r.out}`);
    assert.ok(reached.includes(door), `${args.join(' ')} reached ${door}; saw ${JSON.stringify(reached)}: ${r.out}`);
  }
  // edges page needs a live pane before it asks for the address; through the symlink
  // it must still reach its own refusal, not a missing helper.
  const page = await run(['edges', 'page']);
  assert.doesNotMatch(page.out, REACH_FAILURES, page.out);
  assert.match(page.out, /NO-SESSION/, page.out);
});

test('a tool in the owner\'s tools store is projected by name, and shadows a shipped one', async () => {
  await fs.mkdir(process.env.RONIN_TOOLS_DIR!, { recursive: true });
  await fs.writeFile(path.join(process.env.RONIN_TOOLS_DIR!, 'review_tool'), '#!/bin/sh\necho REVIEWED\n', { mode: 0o755 });
  await fs.writeFile(path.join(process.env.RONIN_TOOLS_DIR!, 'owned_tool'), '#!/bin/sh\necho MINE\n', { mode: 0o755 });
  const projected = await projectRoutineTools('owned', [routine('weekly_review', true, ['review_tool', 'owned_tool', 'missing_tool'])]);
  assert.deepEqual(projected.delivered, ['owned_tool', 'review_tool', 'shim/tmux']);
  assert.deepEqual(projected.missing, ['missing_tool']);
  assert.equal(await fs.readlink(path.join(projected.dir, 'review_tool')), path.join(process.env.RONIN_TOOLS_DIR!, 'review_tool'));
  assert.equal(await fs.readlink(path.join(projected.dir, 'owned_tool')), path.join(process.env.RONIN_TOOLS_DIR!, 'owned_tool'));
});
