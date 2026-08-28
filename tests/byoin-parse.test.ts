// The promotion receipt must name WHICH test failed, not only that check-tests did.
// bin/ronin-byoin prints the `not ok` items under a FAIL line, ten spaces in; the parser
// used to keep only the verdict lines, so every receipt read "check-tests: FAIL" and the
// failing test's name lived nowhere but the lead's terminal (2026-08-28).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseByoinOutput } from '../src/promotion/byoin.js';

const sample = [
  'RONIN BYOIN — /x',
  '',
  '  ok    parse — every client module',
  '  ok    check-docs',
  '  FAIL  check-tests',
  '          not ok 41 - crash: a lock left by a dead process is reclaimed; a live holder is waited for',
  '          # tests 311',
  '          # fail 1',
  '  SKIP  smoke-ui — repository-only mode does not drive a live UI',
  '  ok    tsc',
  'BYOIN: 1 gate(s) failed — check-tests',
].join('\n');

test('a FAIL gate carries the named failing items and the tail as its detail', () => {
  const { gates, verdict } = parseByoinOutput(sample);
  const tests = gates.find((g) => g.name === 'check-tests');
  assert.ok(tests && tests.status === 'FAIL');
  assert.match(tests!.detail ?? '', /not ok 41 - crash: a lock left by a dead process/);
  assert.match(tests!.detail ?? '', /# fail 1/);
  assert.equal(verdict, 'BYOIN: 1 gate(s) failed — check-tests');
});

test('ok and SKIP gates keep only their own line; indented lines never leak onto them', () => {
  const { gates } = parseByoinOutput(sample);
  assert.equal(gates.find((g) => g.name === 'tsc')?.detail, undefined);
  assert.equal(gates.find((g) => g.name === 'smoke-ui')?.detail, 'repository-only mode does not drive a live UI');
  assert.equal(gates.find((g) => g.name === 'parse')?.detail, 'every client module');
  assert.equal(gates.length, 5);
});
