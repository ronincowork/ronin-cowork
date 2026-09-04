#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');

const files = [];
const nested = [];
if (fs.existsSync(TESTS)) {
  for (const e of fs.readdirSync(TESTS, { withFileTypes: true })) {
    const p = path.join(TESTS, e.name);
    if (e.isFile() && (e.name.endsWith('.test.ts') || e.name.endsWith('.test.js'))) files.push(p);
    else if (e.isDirectory()) {
      const held = fs.readdirSync(p).filter((n) => n.endsWith('.test.ts') || n.endsWith('.test.js'));
      if (held.length) nested.push(`tests/${e.name}/ (${held.length})`);
    }
  }
}

if (!files.length) {
  console.log('FAILED — tests/ holds no *.test.ts. The unit floor exists now; an empty floor is a gate lying green.');
  process.exit(1);
}

if (nested.length) {
  console.log(`not the unit floor, not run here: ${nested.join(', ')} — these need a live`);
  console.log('machine, so they are run deliberately (see each file\'s header) or by CI.');
}
console.log(`running ${files.length} test file(s) in tests/`);
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-test-run-'));
const tmuxRoot = path.join(runRoot, 't');
fs.mkdirSync(tmuxRoot);
const inheritedTmux = process.env.TMUX
  ? Object.fromEntries(['@ronin-url', '@ronin-cli-token'].map((option) => {
      const read = spawnSync('tmux', ['show-option', '-s', '-qv', option], { encoding: 'utf8' });
      return [option, read.status === 0 ? read.stdout : null];
    }))
  : null;
// The live server's identity before the run, read through this pane's own $TMUX. A run
// that replaces it names itself below instead of needing an afternoon of forensics.
const livePid = () => {
  if (!process.env.TMUX) return null;
  const read = spawnSync('tmux', ['display-message', '-p', '#{pid}'], { encoding: 'utf8' });
  return read.status === 0 ? read.stdout.trim() : null;
};
const liveBefore = livePid();
// Test servers (tests/helpers/testserver.ts → ronin-testserver) live under this run's own
// root, so what a run opens is the run's to close, and a leftover is this run's leak.
// Short and under /tmp on purpose: a Unix socket path is capped at 107 bytes, and a
// session's TMPDIR can be long enough to push `<root>/<name>/tmux-<uid>/<name>` past it.
const serversRoot = fs.mkdtempSync('/tmp/ronin-testserver-');
const testEnv = { ...process.env, BIND: process.env.BIND || '127.0.0.1', TMPDIR: runRoot, TMUX_TMPDIR: tmuxRoot, RONIN_TESTSERVER_ROOT: serversRoot, RONIN_TEST_RUNNER: '1', TSX_DISABLE_CACHE: '1' };
delete testEnv.TMUX;
delete testEnv.TMUX_PANE;
const r = spawnSync('node', ['--import', 'tsx', '--import', './tests/fixture-teardown.mjs', '--test', '--test-concurrency=1', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
  env: testEnv,
});
if (inheritedTmux) {
  for (const [option, before] of Object.entries(inheritedTmux)) {
    const read = spawnSync('tmux', ['show-option', '-s', '-qv', option], { encoding: 'utf8' });
    const after = read.status === 0 ? read.stdout : null;
    if (after !== before) {
      console.error(`FAILED — unit tests changed the live tmux server's ${option} option.`);
      process.exitCode = 1;
    }
  }
}
const liveAfter = livePid();
if (liveBefore && liveAfter !== liveBefore) {
  console.error(`FAILED — this run replaced the tmux server (was ${liveBefore}, now ${liveAfter ?? 'none'}). A test reached the live server; every scratch server must come from tests/helpers/testserver.ts.`);
  process.exitCode = 1;
}
const openServers = [];
if (fs.existsSync(serversRoot)) {
  for (const name of fs.readdirSync(serversRoot)) {
    const wrapper = path.join(serversRoot, name, 'tmux');
    if (!fs.existsSync(wrapper)) continue;
    const alive = spawnSync(wrapper, ['display-message', '-p', '#{pid}'], { encoding: 'utf8' });
    if (alive.status !== 0) continue;
    openServers.push(`${name} (pid ${alive.stdout.trim()})`);
    spawnSync(wrapper, ['kill-server']); // the run's own server; its root goes with the run root
  }
}
if (openServers.length) {
  console.error(`FAILED — ${openServers.length} test server(s) left open: ${openServers.join(', ')}. Each test closes what it opened (closeTestServer). The runner closed these as a backstop.`);
  process.exitCode = 1;
}
fs.rmSync(serversRoot, { recursive: true, force: true });
fs.rmSync(tmuxRoot, { recursive: true, force: true });
const leaked = fs.readdirSync(runRoot);
fs.rmSync(runRoot, { recursive: true, force: true });
if (leaked.length) {
  const families = new Map();
  for (const name of leaked) {
    const family = name.replace(/[._-][A-Za-z0-9]{6,}$/, '');
    families.set(family, (families.get(family) || 0) + 1);
  }
  console.error(`FAILED — unit fixtures leaked ${leaked.length} temp entr${leaked.length === 1 ? 'y' : 'ies'}: ${[...families].map(([n, c]) => `${n} (${c})`).join(', ')}`);
  console.error('Each fixture must remove its mkdtemp directory in teardown. The runner removed this run root as a backstop.');
  process.exit(1);
}
process.exit(process.exitCode || r.status || 0);
