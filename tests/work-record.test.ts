import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* The letter verbs of work-record: one field, one call, no block. Each edits the current
 * letter and runs it through the same validator as a whole-block save, so "at", "holds"
 * and "teams" are carried through and the shape rules hold. The ladder and docs live on
 * the focus work item and are tested against the routes in work-item-tools.test.ts. The
 * tool learns which session it is from tmux; a fake tmux on PATH answers for a session
 * called "probe", the session store is a scratch directory (RONIN_SESSION_DIR), and
 * RONIN_URL names a port nothing listens on, so nothing here reaches a live server. */

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
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1', RONIN_SESSION_DIR: path.join(dir, 'sessions'), RONIN_URL: 'http://127.0.0.1:9' };
  delete env.TMUX;
  return { dir, env, letter: path.join(dir, 'sessions', 'probe-key', 'tegami.md') };
}

type Block = { objective: string; repos: Array<{ repo: string; branch: string }>; holds?: string[]; at?: unknown };
const block = (letter: string): Block => {
  const m = /```json\n([\s\S]*?)\n```/.exec(readFileSync(letter, 'utf8'));
  assert.ok(m, 'the letter has a json block');
  return JSON.parse(m[1]) as Block;
};
const run = (env: NodeJS.ProcessEnv, args: string[], input?: string) =>
  execFileSync(tool,
    args[0] === '--doc' ? ['document', 'add', args[1]]
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

test('letter verbs edit one field each and carry the holds and the focus through', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'start' }));
  // Ronin moves holds and the focus; the Agent's own saves must carry them untouched.
  const text = readFileSync(f.letter, 'utf8').replace('"objective": "start"', '"objective": "start", "holds": ["w4", "w7"], "at": { "item": "w7", "rung": 2 }');
  writeFileSync(f.letter, text);
  run(f.env, ['--objective', 'the new sentence']);
  let b = block(f.letter);
  assert.equal(b.objective, 'the new sentence');
  assert.deepEqual(b.holds, ['w4', 'w7']);
  assert.deepEqual(b.at, { item: 'w7', rung: 2 });

  run(f.env, ['--repo', 'ronin_cowork:team/x', '--repo', 'ronin_cowork:team/x', '--unrepo', 'nothing:here']);
  assert.deepEqual(block(f.letter).repos, [{ repo: 'ronin_cowork', branch: 'team/x' }], 'a repo row is kept once');

  const r = spawnSync(tool, ['update_record'], { encoding: 'utf8', env: f.env, input: JSON.stringify({ objective: 'whole', holds: ['w1'] }) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /holds are maintained by Ronin and were ignored/);
  b = block(f.letter);
  assert.equal(b.objective, 'whole');
  assert.deepEqual(b.holds, ['w4', 'w7'], 'a whole-block save never writes holds');
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

test('letter verbs refuse a missing value and mixing with the other forms', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, [], JSON.stringify({ objective: 'start' }));
  const refuse = (args: string[]) => {
    const r = spawnSync(tool, ['update_record', ...args], { encoding: 'utf8', env: f.env });
    assert.equal(r.status, 3, args.join(' '));
    return r.stderr;
  };
  assert.match(refuse(['--objective']), /--objective needs a value/);
  assert.match(refuse(['--objective', 'x', '--doc', 'README.md']), /travel alone/);
  assert.equal(block(f.letter).objective, 'start', 'a refused verb leaves the letter untouched');
});

test('a letter verb on a session with no letter yet starts one', (t) => {
  const f = fixture();
  t.after(() => rmSync(f.dir, { recursive: true, force: true }));
  run(f.env, ['--objective', 'first words']);
  assert.equal(block(f.letter).objective, 'first words');
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

  execFileSync(projected('probe', 'work-record'), ['update_record', '--objective', 'through my own directory'], { encoding: 'utf8', env: noTmux, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal(block(f.letter).objective, 'through my own directory');
  const read = execFileSync(projected('probe', 'work-record'), ['read', '--json'], { encoding: 'utf8', env: noTmux, stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal((JSON.parse(read) as Block).objective, 'through my own directory');
  refused(reader, ['read', '--json']);
});
