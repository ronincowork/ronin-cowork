#!/usr/bin/env node
/**
 * The unit floor — logic in isolation, house-wide. tests/*.test.ts via node's own
 * runner, TypeScript served by tsx (already the tree's runtime; zero new tooling).
 *
 *   node scripts/check-tests.mjs
 *
 * A unit test is a GATE in BYOIN's sense: it asks whether the repo is honest with
 * itself, so it runs with NO live machine — never shells tmux, never opens a socket,
 * never touches a store, never needs a browser. Anything needing the machine already
 * has an owner (doctor, smoke, smoke-ui). Hence BIND below: src/config.ts resolves
 * the bind address by shelling `tailscale ip -4` at import time unless BIND is set,
 * and a unit test importing src/ modules must not wake that up.
 *
 * This is the unit half of the two kinds of test; BYOIN stays the one whole-install
 * verdict and carries this gate the way it carries every entry in the verify chain.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');

// THE UNIT FLOOR IS tests/*.test.ts — ONE LEVEL, NEVER A WALK. A recursive walk here
// swept tests/integration/two-leg.test.ts into every BYOIN run for weeks. That file
// spawns a real SHIWAKE server, which is the exact thing the contract above forbids a
// unit test from doing, and its teardown signalled the `npx` intermediary rather than
// the server — so each run orphaned a wrapper+child pair holding ~30 MB and a port.
// 362 of them were resident before anyone noticed (OPEN_THREADS 4.34). The recursion
// was the defect: both this file's header and that test's own header already said it
// was to be run deliberately, not swept.
const files = [];
const nested = [];
if (fs.existsSync(TESTS)) {
  for (const e of fs.readdirSync(TESTS, { withFileTypes: true })) {
    const p = path.join(TESTS, e.name);
    // .ts for src/, .js for the client's pure cores — public/js has no TypeScript
    // and never will (the no-bundler/no-client-TS ruling), so its tests are plain JS.
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

// NAMED, NEVER SILENT. A gate that quietly stops covering something is worse than one
// that fails: say what is out of scope and who owns it, so it cannot go dark unnoticed.
if (nested.length) {
  console.log(`not the unit floor, not run here: ${nested.join(', ')} — these need a live`);
  console.log('machine, so they are run deliberately (see each file\'s header) or by CI.');
}
console.log(`running ${files.length} test file(s) in tests/`);
const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-test-run-'));
// Several suites exercise real Git locks and compare-and-swap races. Running test files
// concurrently makes those machine-level fixtures contend on smaller CI runners and
// produces false promotion failures; the unit floor is deterministic, one file at a time.
const r = spawnSync('node', ['--import', 'tsx', '--import', './tests/fixture-teardown.mjs', '--test', '--test-concurrency=1', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, BIND: process.env.BIND || '127.0.0.1', TMPDIR: runRoot, TSX_DISABLE_CACHE: '1' },
});
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
process.exit(r.status ?? 1);
