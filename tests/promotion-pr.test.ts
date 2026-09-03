// `ronin-promote pr <team>` — the release PR from the ledger, no hand-assembled gh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPullRequest, prBody, prTitle, type Exec } from '../src/promotion/pr.js';
import type { PromotionReceipt } from '../src/promotion/receipts.js';

const HEAD = '141cafdb768b41c3044156ccf312ce52a575d014';
const receipt = {
  id: '20260828T190743Z-promote-ronin_comps-uuo5', kind: 'team_promotion', team: 'ronin_comps', state: 'complete', by: 'comp_fable',
  repos: [{ repo: 'ronin_cowork', candidate: HEAD }],
  proofs: [{ repo: 'ronin_cowork', candidate: HEAD, mode: 'full', passed: true, verdict: 'BYOIN: the repo is clean (17 ok, 3 skipped).', gates: [
    { name: 'check-tests', status: 'ok' }, { name: 'smoke-ui', status: 'SKIP', detail: 'repository-only mode' }, { name: 'tsc', status: 'ok' },
  ] }],
  advances: [{ repo: 'ronin_cowork', to: HEAD, status: 'done' }],
  health: { passed: true, checks: [{ name: 'api/health', status: 'ok' }, { name: 'smoke-ui', status: 'ok' }] },
} as unknown as PromotionReceipt;

test('the body is the template shape: what changed, the receipt fence CI parses, the checklist with SKIPs named', () => {
  const body = prBody({ receipt, repo: 'ronin_cowork', subjects: ['No lead set: the session holds the job'], head: HEAD });
  assert.match(body, /^## What this changes\n\n- No lead set: the session holds the job/);
  assert.match(body, /```ronin-promotion-receipt\n\{"id":"promotion-141cafdb768b".*\n```/);
  assert.match(body, /candidate is this PR's head SHA \(`141cafdb768b`\)/);
  assert.match(body, /SKIPs in the receipt's proof: `smoke-ui` — repository-only mode.*`api\/health` ok, `smoke-ui` ok/);
  assert.ok(!body.includes('ronin_cowork'), 'the public receipt uses public repo names');
});

test('title: the one subject, or the count', () => {
  assert.equal(prTitle(['Fix the thing'], 'dev', 'master'), 'Fix the thing');
  assert.equal(prTitle(['a', 'b', 'c'], 'dev', 'master'), 'dev → master: 3 commits');
});

function fakeExec(state: { head: string; open: Array<{ number: number; url: string }>; calls: string[][] }): Exec {
  return async (cmd, args) => {
    state.calls.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'rev-parse') return state.head + '\n';
    if (cmd === 'git' && args[0] === 'log') return 'One subject\n';
    if (cmd === 'git') return '';
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(state.open);
    if (args[0] === 'pr' && args[1] === 'create') return 'https://github.com/x/y/pull/40\n';
    if (args[0] === 'pr' && args[1] === 'edit') return '';
    return '';
  };
}

test('warns and opens when the working line moved past the last complete promotion', async () => {
  const st = { head: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', open: [], calls: [] as string[][] };
  const warnings: string[] = [];
  const out = await openPullRequest({ repo: 'ronin_cowork', dir: '/x', working: 'dev', stable: 'master', receipt }, { exec: fakeExec(st), gh: 'gh', log: (line) => warnings.push(line) });
  assert.equal(out.action, 'created');
  assert.match(warnings.join('\n'), /opening the PR anyway/);
  assert.ok(st.calls.some((c) => c[0] === 'git' && c[1] === 'push'));
});

test('pushes the working line, then creates the PR; an open one is updated, never duplicated', async () => {
  const st = { head: HEAD, open: [] as Array<{ number: number; url: string }>, calls: [] as string[][] };
  const created = await openPullRequest({ repo: 'ronin_cowork', dir: '/x', working: 'dev', stable: 'master', receipt }, { exec: fakeExec(st), gh: 'gh' });
  assert.equal(created.action, 'created');
  assert.equal(created.url, 'https://github.com/x/y/pull/40');
  assert.ok(st.calls.some((c) => c.join(' ') === 'git push -q origin dev'));
  const create = st.calls.find((c) => c[1] === 'pr' && c[2] === 'create')!;
  assert.deepEqual(create.slice(3, 7), ['--base', 'master', '--head', 'dev']);
  assert.match(create[create.indexOf('--body') + 1]!, /```ronin-promotion-receipt/);

  const st2 = { head: HEAD, open: [{ number: 39, url: 'https://github.com/x/y/pull/39' }], calls: [] as string[][] };
  const updated = await openPullRequest({ repo: 'ronin_cowork', dir: '/x', working: 'dev', stable: 'master', receipt }, { exec: fakeExec(st2), gh: 'gh' });
  assert.equal(updated.action, 'updated');
  assert.equal(updated.url, 'https://github.com/x/y/pull/39');
  assert.ok(st2.calls.some((c) => c[1] === 'pr' && c[2] === 'edit' && c[3] === '39'));
  const editAt = st2.calls.findIndex((c) => c[1] === 'pr' && c[2] === 'edit');
  const pushAt = st2.calls.findIndex((c) => c[0] === 'git' && c[1] === 'push');
  assert.ok(editAt >= 0 && pushAt > editAt, 'an existing PR gets the new receipt before the push triggers CI');
  assert.ok(!st2.calls.some((c) => c[1] === 'pr' && c[2] === 'create'));
});
