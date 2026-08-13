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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');

const files = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    // .ts for src/, .js for the client's pure cores — public/js has no TypeScript
    // and never will (the no-bundler/no-client-TS ruling), so its tests are plain JS.
    else if (e.name.endsWith('.test.ts') || e.name.endsWith('.test.js')) files.push(p);
  }
})(TESTS);

if (!files.length) {
  console.log('FAILED — tests/ holds no *.test.ts. The unit floor exists now; an empty floor is a gate lying green.');
  process.exit(1);
}

console.log(`running ${files.length} test file(s) in tests/`);
const r = spawnSync('node', ['--import', 'tsx', '--test', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, BIND: process.env.BIND || '127.0.0.1' },
});
process.exit(r.status ?? 1);
