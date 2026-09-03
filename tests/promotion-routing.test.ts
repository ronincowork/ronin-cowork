import test from 'node:test';
import assert from 'node:assert/strict';
import { filesNamedByFailedGates } from '../src/promotion/routing.js';
import type { RepoProof } from '../src/promotion/receipts.js';

const proof = (detail: string): RepoProof => ({
  repo: 'ronin_cowork', candidate: 'abc', mode: 'full', passed: false,
  gates: [{ name: 'check-docs', status: 'FAIL', detail }], verdict: 'failed',
});

test('failure routing selects only exact changed paths named by failed gates', () => {
  assert.deepEqual(
    filesNamedByFailedGates(proof('FAIL docs/worktrees.md:106 — bad claim'), ['docs/worktrees.md', 'public/js/cowork-view.js']),
    ['docs/worktrees.md'],
  );
});

test('failure routing does not guess when a gate names no changed path', () => {
  assert.deepEqual(filesNamedByFailedGates(proof('three assertions failed'), ['a.ts', 'b.ts']), []);
});
