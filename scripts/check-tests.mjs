#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
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

// A Node test file is an isolated worker already. The old runner then serialized all 187
// workers behind one shared TMPDIR, turning process startup and shell-heavy contracts into a
// five-minute queue. Four private shards preserve serial execution *inside* each ownership
// boundary while allowing independent files to run together. Never share these roots: the
// fixture exit hook and ronin-testserver cleanup deliberately own everything below them.
const SHARDS = Math.max(1, Math.min(Number(process.env.RONIN_TEST_SHARDS || 4) || 4, files.length));
const buckets = Array.from({ length: SHARDS }, () => ({ files: [], weight: 0 }));
for (const file of [...files].sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)) {
  const bucket = buckets.reduce((lightest, row) => row.weight < lightest.weight ? row : lightest);
  bucket.files.push(file);
  bucket.weight += fs.statSync(file).size;
}

const runShard = (bucket, index) => new Promise((resolve) => {
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `ronin-test-${index + 1}-`));
  const tmuxRoot = path.join(runRoot, 't');
  fs.mkdirSync(tmuxRoot);
  // Short and under /tmp on purpose: a Unix socket path is capped at 107 bytes.
  const serversRoot = fs.mkdtempSync(`/tmp/ronin-testserver-${index + 1}-`);
  const testEnv = {
    ...process.env,
    BIND: process.env.BIND || '127.0.0.1',
    TMPDIR: runRoot,
    TMUX_TMPDIR: tmuxRoot,
    RONIN_TESTSERVER_ROOT: serversRoot,
    RONIN_TEST_RUNNER: '1',
    TSX_DISABLE_CACHE: '1',
  };
  delete testEnv.TMUX;
  delete testEnv.TMUX_PANE;
  console.log(`  shard ${index + 1}/${SHARDS}: ${bucket.files.length} file(s)`);
  const child = spawn('node', ['--import', 'tsx', '--import', './tests/fixture-teardown.mjs', '--test', '--test-concurrency=1', ...bucket.files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: testEnv,
  });
  child.on('error', (error) => resolve({ status: 1, error, runRoot, tmuxRoot, serversRoot }));
  child.on('exit', (code, signal) => resolve({ status: code ?? 1, signal, runRoot, tmuxRoot, serversRoot }));
});

const results = await Promise.all(buckets.map(runShard));
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
let runnerFailed = false;
for (const [index, result] of results.entries()) {
  if (result.error) {
    console.error(`FAILED — shard ${index + 1} did not start: ${result.error.message}`);
    runnerFailed = true;
  }
  if (result.signal) console.error(`FAILED — shard ${index + 1} ended by ${result.signal}.`);
  if (result.status) runnerFailed = true;
  const openServers = [];
  if (fs.existsSync(result.serversRoot)) {
    for (const name of fs.readdirSync(result.serversRoot)) {
      const wrapper = path.join(result.serversRoot, name, 'tmux');
      if (!fs.existsSync(wrapper)) continue;
      const alive = spawnSync(wrapper, ['display-message', '-p', '#{pid}'], { encoding: 'utf8' });
      if (alive.status !== 0) continue;
      openServers.push(`${name} (pid ${alive.stdout.trim()})`);
      spawnSync(wrapper, ['kill-server']);
    }
  }
  if (openServers.length) {
    console.error(`FAILED — shard ${index + 1} left ${openServers.length} test server(s) open: ${openServers.join(', ')}. The runner closed these as a backstop.`);
    runnerFailed = true;
  }
  fs.rmSync(result.serversRoot, { recursive: true, force: true });
  fs.rmSync(result.tmuxRoot, { recursive: true, force: true });
  const leaked = fs.readdirSync(result.runRoot);
  fs.rmSync(result.runRoot, { recursive: true, force: true });
  if (leaked.length) {
    console.error(`FAILED — shard ${index + 1} cleanup left ${leaked.length} temp entr${leaked.length === 1 ? 'y' : 'ies'}: ${leaked.join(', ')}`);
    runnerFailed = true;
  }
}
process.exit(process.exitCode || (runnerFailed ? 1 : 0));
