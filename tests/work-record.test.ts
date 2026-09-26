import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* The field verbs of work-record: one field, one call, no block. Each edits the current
 * letter and runs it through the same validator as a whole-block save, so "at", "docs"
 * and "teams" are carried through and the shape rules hold. The tool learns which session
 * it is from tmux; a fake tmux on PATH answers for a session called "probe", and the
 * session store is a scratch directory (RONIN_SESSION_DIR), so nothing here touches a
 * real letter or the live server. */

const root = path.resolve(import.meta.dirname, '..');
const tool = path.join(root, 'ronin_bin', 'work-record');

function fixture(): { dir: string; env: NodeJS.ProcessEnv; letter: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'work-record-'));
  mkdirSync(path.join(dir, 'sessions'));
  writeFileSync(path.join(dir, 'tmux'), [
    '#!/bin/sh',
    'case "$1" in',
    '  display-message) echo "@1";;',
    "  list-windows) printf 'probe\\t@1\\n';;",
    "  list-sessions) case \"$*\" in *ronin-key*) printf 'probe\\tprobe-key\\t1\\n';; *) printf 'probe\\t\\n';; esac;;",
    '  *) exit 1;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(path.join(dir, 'curl'), [
    '#!/bin/sh',
    "case \"$*\" in *'/api/team-rosters/team/projects/issue'*) printf '{\"ok\":true,\"id\":\"team/1\"}';; *'/api/team-rosters/team/projects/1/return'*) case \"$*\" in *backlog*) a=backlog;; *done*) a=done;; *) a=inbox;; esac; printf '{\"ok\":true,\"project\":{\"id\":\"team/1\"},\"area\":\"%s\",\"focus\":\"none\"}' \"$a\";; *) exit 1;; esac",
    '',
  ].join('\n'), { mode: 0o755 });
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1', RONIN_SESSION_DIR: path.join(dir, 'sessions') };
  delete env.TMUX;
  return { dir, env, letter: path.join(dir, 'sessions', 'probe-key', 'tegami.md') };
}

type Block = { objective: string; repos: Array<{ repo: string; branch: string }>; ladder: Array<Record<string, unknown>>; projects?: Array<Record<string, unknown>>; docs?: string[]; at?: unknown };
const block = (letter: string): Block => {
  const m = /```json\n([\s\S]*?)\n```/.exec(readFileSync(letter, 'utf8'));
  assert.ok(m, 'the letter has a json block');
  return JSON.parse(m[1]) as Block;
};
const run = (env: NodeJS.ProcessEnv, args: string[], input?: string) =>
  execFileSync(tool,
    args[0] === 'project' ? args
      : args[0] === '--doc' ? ['document', 'add', args[1]]
        : args[0] === '--undoc' ? ['document', 'remove', args[1]]
          : ['update_record', ...args],
    { encoding: 'utf8', env, input, stdio: ['pipe', 'pipe', 'pipe'] });

test('help is side-effect-free, actionable, and separates lead positioning', () => {
  for (const flag of ['--help', '-h']) {
    const r = spawnSync(tool, [flag], { encoding: 'utf8', env: { ...process.env, TMUX: '', TMUX_PANE: '' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /document add/);
    assert.match(r.stdout, /--objective <text>/);
    assert.match(r.stdout, /--phase <title>/);
    assert.match(r.stdout, /--leg N <title>/);
    assert.match(r.stdout, /--status N\[\.M\] PLANNED\|ACTIVE\|DONE/);
    assert.match(r.stdout, /workspace add <repo-or-url> \[--branch <branch>\]/);
    assert.match(r.stdout, /Lead positioning is a separate form/);
    assert.match(r.stdout, /--session <name> --at N\[\.M\]/);
    assert.doesNotMatch(r.stderr, /cannot tell which session/);
  }
  const direct = spawnSync(tool, ['--objective', 'not an alias'], { encoding: 'utf8', env: { ...process.env, TMUX: '', TMUX_PANE: '' } });
  assert.equal(direct.status, 2);
  assert.match(direct.stderr, /work-record update_record --objective <text>/);
});

test('field verbs edit one field each and carry the pointer and the doc list through', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'start', ladder: [{ gate: 'go', status: 'DONE' }, { phase: 'one', status: 'ACTIVE', legs: [{ title: 'a', status: 'ACTIVE' }] }] }));
  run(f.env, ['--session', 'probe', '--at', '2.1']);
  run(f.env, ['--doc', path.join(root, 'README.md')]);

  run(f.env, ['--objective', 'the new sentence']);
  let b = block(f.letter);
  assert.equal(b.objective, 'the new sentence');
  assert.deepEqual(b.at, { rung: 2, leg: 1 }, 'a wording change keeps the pointer');
  assert.deepEqual(b.docs, [path.join(root, 'README.md')], 'and the doc list');
  assert.equal(b.ladder.length, 2, 'and the ladder');

  run(f.env, ['--leg', '2', 'second leg', '--done', '2.1', '--active', '2.2']);
  b = block(f.letter);
  const legs = b.ladder[1].legs as Array<{ title: string; status: string }>;
  assert.deepEqual(legs, [{ title: 'a', status: 'DONE' }, { title: 'second leg', status: 'ACTIVE' }]);
  assert.equal(b.at, undefined, 'a shape change clears the pointer, as a whole-block save does');
  assert.deepEqual(b.docs, [path.join(root, 'README.md')]);

  run(f.env, ['--phase', 'two', '--leg', '3', 'x', '--gate', 'wait for owner', '--rung', '3', 'two, renamed', '--leg', '3.1', 'x renamed', '--status', '4', 'ACTIVE', '--status', '2.2', 'DONE']);
  b = block(f.letter);
  assert.equal(b.ladder.length, 4);
  assert.equal(b.ladder[2].phase, 'two, renamed');
  assert.deepEqual(b.ladder[2].legs, [{ title: 'x renamed', status: 'PLANNED' }]);
  assert.deepEqual(b.ladder[3], { gate: 'wait for owner', status: 'ACTIVE' });

  run(f.env, ['--repo', 'ronin_cowork:team/x', '--repo', 'ronin_cowork:team/x', '--unrepo', 'nothing:here']);
  assert.deepEqual(block(f.letter).repos, [{ repo: 'ronin_cowork', branch: 'team/x' }], 'a repo row is kept once');

  run(f.env, ['--drop', '3.1', '--drop', '3']);
  b = block(f.letter);
  assert.equal(b.ladder.length, 3);
  assert.deepEqual(b.ladder[2], { gate: 'wait for owner', status: 'ACTIVE' });
});

test('workspace commands edit exact repository URLs and acknowledge changed rows truthfully', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  const call = (args: string[]) => spawnSync(tool, args, { encoding: 'utf8', env: f.env });
  const old = 'https://github.com/ronincowork/ronin-cowork.git';
  const next = 'https://github.com/ronincowork/samurai_lab.git';
  let result = call(['workspace', 'add', old, '--branch', 'dev']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /repository .*ronin-cowork\.git:dev listed/);
  result = call(['workspace', 'remove', old, '--branch', 'dev']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /1 row\(s\) removed/);
  result = call(['workspace', 'remove', old]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /no row matched; unchanged/);
  assert.doesNotMatch(result.stderr, /removed/);
  result = call(['workspace', 'add', next, '--branch', 'main']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(block(f.letter).repos, [{ repo: next, branch: 'main' }]);
  result = call(['workspace', 'list']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [{ repo: next, branch: 'main' }]);
  result = call(['update_record', '--unrepo', `${next}:main`]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /1 row\(s\) removed/);
  assert.deepEqual(block(f.letter).repos, []);
});

test('field verbs refuse a wrong position, a wrong status, a missing value, and mixing with the other forms', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'start', ladder: [{ gate: 'go', status: 'ACTIVE' }, { phase: 'one', legs: [{ title: 'a' }] }] }));
  const refuse = (args: string[]) => {
    const r = spawnSync(tool, ['update_record', ...args], { encoding: 'utf8', env: f.env });
    assert.equal(r.status, 3, args.join(' '));
    return r.stderr;
  };
  assert.match(refuse(['--leg', '1', 'on a gate']), /rung 1 is a gate/);
  assert.match(refuse(['--status', '2.9', 'DONE']), /rung 2 has 1 leg\(s\); 9 is out of range/);
  assert.match(refuse(['--status', '2.1', 'MAYBE']), /PLANNED, ACTIVE or DONE/);
  assert.match(refuse(['--drop', 'seven']), /N or N\.M/);
  assert.match(refuse(['--objective']), /--objective needs a value/);
  assert.match(refuse(['--objective', 'x', '--doc', 'README.md']), /travel alone/);
  assert.equal(block(f.letter).objective, 'start', 'a refused verb leaves the letter untouched');
});

test('a field verb on a session with no letter yet starts one', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, ['--objective', 'first words', '--gate', 'go']);
  const b = block(f.letter);
  assert.equal(b.objective, 'first words');
  assert.deepEqual(b.ladder, [{ gate: 'go', status: 'PLANNED' }]);
});

test('project create, read and one-field write use the existing letter tools', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'session', ladder: [] }));
  run({ ...f.env, RONIN_URL: 'http://operator.test' }, ['project', 'create', '--team', 'team', '--title', 'First', '--objective', 'Ship it']);
  let p = block(f.letter).projects?.[0];
  assert.deepEqual(p, { id: 'team/1', title: 'First', objective: 'Ship it', stage: 'PLANNING', exit: 'none', status: 'yellow', ladder: [], evidence: [] });

  run(f.env, ['project', 'write', 'team/1', '--status', 'green']);
  p = block(f.letter).projects?.[0];
  assert.equal(p?.status, 'green');
  assert.equal(p?.title, 'First', 'an unrelated project field survives');

  run(f.env, ['project', 'write', 'team/1', '--ladder', JSON.stringify([{ stage: 'PLANNING' }, { stage: 'BUILDING', legs: [] }])]);
  run(f.env, ['project', 'write', 'team/1', '--leg', 'BUILDING', 'Implement it']);
  run(f.env, ['project', 'write', 'team/1', '--leg', 'BUILDING.1', 'done']);
  p = block(f.letter).projects?.[0];
  assert.deepEqual(p?.ladder, [{ stage: 'PLANNING' }, { stage: 'BUILDING', legs: [{ title: 'Implement it', done: true }] }]);

  const read = execFileSync(path.join(root, 'ronin_bin', 'work-record'), ['project', 'read', 'team/1'], { encoding: 'utf8', env: f.env });
  assert.equal((JSON.parse(read) as Record<string, unknown>).objective, 'Ship it');

  const returned = run({ ...f.env, RONIN_URL: 'http://operator.test' }, ['project', 'return', 'team/1']);
  assert.match(returned, /moved whole to Team team Inbox; holder: Team team; focus: none; next: team project assign team team\/1 <session>.*Remember to update your project/);
});

test('project lifecycle verbs state intent explicitly and preserve unrelated fields', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'session', projects: [{
    id: 'team/1', title: 'First', objective: 'Ship it', stage: 'PLANNING', exit: 'user',
    status: 'green', ladder: [{ stage: 'PLANNING' }], evidence: ['commit abc'],
  }], ladder: [] }));

  const invoke = (args: string[]) => run(f.env, ['project', ...args]);
  assert.match(invoke(['working', 'team/1']).trim(), /changed: status=yellow, exit=agent.*preserved: stage=PLANNING.*holder: @probe.*Remember to update your project\.$/);
  assert.deepEqual({ stage: block(f.letter).projects?.[0]?.stage, status: block(f.letter).projects?.[0]?.status, exit: block(f.letter).projects?.[0]?.exit }, { stage: 'PLANNING', status: 'yellow', exit: 'agent' });
  assert.match(invoke(['ready', 'team/1', '--for', 'lead']), /status=green, exit=lead/);
  assert.match(invoke(['stuck', 'team/1']), /status=red, exit=agent/);
  assert.match(invoke(['blocked', 'team/1', '--on', 'user']), /changed: exit=user; preserved: stage=PLANNING, status=red/);
  assert.match(invoke(['advance', 'team/1', '--to', 'BUILDING']), /changed: stage=BUILDING.*preserved: status=red, exit=user/);
  const p = block(f.letter).projects?.[0];
  assert.deepEqual(p?.ladder, [{ stage: 'PLANNING' }]);
  assert.deepEqual(p?.evidence, ['commit abc']);

  const before = readFileSync(f.letter, 'utf8');
  const bad = spawnSync(tool, ['project', 'ready', 'team/1', '--for', 'agent'], { encoding: 'utf8', env: f.env });
  assert.equal(bad.status, 3);
  assert.match(bad.stderr, /--for lead\|user/);
  assert.equal(readFileSync(f.letter, 'utf8'), before, 'invalid lifecycle intent leaves the letter untouched');
});

/* A born session reaches its tools through its own command directory,
 * <session-commands>/<session>/<tool>, and some agents' tool shells are not inside tmux
 * at all — no TMUX_PANE, no $TMUX. The directory name is then the one remaining truth
 * about who is calling, accepted only when it names a live session; by its real path the
 * parent is ronin_bin and the tool must still refuse. The refusal replaced a fallback
 * that wrote one session's ladder into another's letter, so both halves are pinned. */
test('the invocation path names the session when tmux does not, and never a guess', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  const noTmux = { ...f.env };
  delete noTmux.TMUX_PANE; delete noTmux.TMUX;
  const reader = path.join(root, 'ronin_bin', 'work-record');
  const projected = (session: string, name: string) => {
    mkdirSync(path.join(f.dir, 'session-commands', session), { recursive: true });
    const link = path.join(f.dir, 'session-commands', session, name);
    if (!existsSync(link)) symlinkSync(path.join(root, 'ronin_bin', name), link);
    return link;
  };
  const refused = (bin: string, args: string[]) => {
    const r = spawnSync(bin, args, { encoding: 'utf8', env: noTmux });
    assert.equal(r.status, 3, `${bin} ${args.join(' ')} refused`);
    assert.match(r.stderr, /cannot tell which session/);
  };
  refused(tool, ['update_record', '--objective', 'by its real path']);
  refused(projected('nobody', 'work-record'), ['update_record', '--objective', 'through a directory naming no session']);
  assert.deepEqual(readdirSync(path.join(f.dir, 'sessions')), [], 'a refusal writes nothing — not even a stray record at the store root');

  execFileSync(projected('probe', 'work-record'), ['update_record', '--objective', 'through my own directory', '--gate', 'go'], { encoding: 'utf8', env: noTmux, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal(block(f.letter).objective, 'through my own directory');
  const read = execFileSync(projected('probe', 'work-record'), ['read', '--json'], { encoding: 'utf8', env: noTmux, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal((JSON.parse(read) as Block).objective, 'through my own directory');
  refused(reader, ['read', '--json']);
});
