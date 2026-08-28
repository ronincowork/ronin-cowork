/**
 * PROMOTION RECEIPTS — the ledger's contract, in a temp store, no git and no tmux.
 *
 * What is load-bearing: a receipt only moves forward through allowed states; a receipt
 * that moved ANY ref and stopped blocks the team until resumed or abandoned; the ledger
 * lists oldest-first and finds the last good promotion. `promote.ts` leans on exactly
 * these; the git half is `tests/promotion.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-promotion-ledger-'));
process.env.RONIN_PROMOTION_LEDGER_DIR = root;
const R = await import('../src/promotion/receipts.js');

const repo = (name: string): import('../src/promotion/receipts.js').RepoCandidate => ({
  repo: name,
  dir: `/nowhere/${name}`,
  line: 'team/comp/dev',
  target: 'dev',
  expected_old: 'a'.repeat(40),
  line_tip: 'b'.repeat(40),
  candidate: 'c'.repeat(40),
  hand_in_receipts: [],
  sessions: [],
  files: [],
  advanced_to: '',
});

test('a receipt walks forward only — the lie "complete after failed" is impossible', () => {
  let r = R.newReceipt({ team: 'comp', repos: [repo('cowork')], by: 'test' });
  assert.equal(r.state, 'preparing');
  r = R.advanceState(r, 'proving');
  r = R.advanceState(r, 'advancing');
  r = R.advanceState(r, 'restarting');
  r = R.advanceState(r, 'complete');
  assert.deepEqual(r.history.map((h) => h.state), ['preparing', 'proving', 'advancing', 'restarting', 'complete']);
  assert.throws(() => R.advanceState(r, 'preparing'), /cannot go from 'complete'/);
  const failed = R.advanceState(R.newReceipt({ team: 'comp', repos: [], by: 'test' }), 'failed');
  assert.throws(() => R.advanceState(failed, 'complete'), /cannot go from 'failed'/);
});

test('failed means dev untouched; interrupted means some ref moved — and only the latter blocks', () => {
  const base = R.advanceState(R.advanceState(R.newReceipt({ team: 'comp', repos: [repo('cowork'), repo('services')], by: 'test' }), 'proving'), 'advancing');
  const none = { ...base, advances: [{ repo: 'cowork', target: 'dev', from: 'a', to: 'c', status: 'pending' as const }] };
  assert.equal(R.anyAdvanced(none), false);
  const some = { ...base, advances: [{ repo: 'cowork', target: 'dev', from: 'a', to: 'c', status: 'done' as const }, { repo: 'services', target: 'dev', from: 'a', to: 'c', status: 'raced' as const }] };
  assert.equal(R.anyAdvanced(some), true);
  assert.equal(R.blocksTeam(base), true, 'a process that died mid-advance leaves advancing behind — that blocks');
  assert.equal(R.blocksTeam(R.advanceState(some, 'interrupted')), true);
  assert.equal(R.blocksTeam(R.advanceState(R.advanceState(some, 'interrupted'), 'abandoned')), false);
  assert.match(R.summarize(R.advanceState(some, 'interrupted')), /landing: cowork done, services raced/);
});

test('the ledger: temp+rename writes, oldest-first listing, blocking and last-good lookups', async () => {
  const a = R.newReceipt({ team: 'comp', repos: [repo('cowork')], by: 'test' });
  await R.writeReceipt(a);
  assert.deepEqual(await R.readReceipt(a.id), a);
  assert.equal(await R.readReceipt('nope'), null);
  const files = await fs.readdir(root);
  assert.ok(files.every((f) => f.endsWith('.json')), `no temp files left behind: ${files}`);

  // ids are time-prefixed; force distinct stamps so order is not luck.
  await new Promise((res) => setTimeout(res, 1100));
  let b = R.newReceipt({ team: 'comp', repos: [repo('cowork')], by: 'test' });
  b = R.advanceState(R.advanceState(R.advanceState(R.advanceState(b, 'proving'), 'advancing'), 'restarting'), 'complete');
  await R.writeReceipt(b);
  const other = R.newReceipt({ team: 'wispr', repos: [], by: 'test' });
  await R.writeReceipt(other);

  const comp = await R.listReceipts('comp');
  assert.deepEqual(comp.map((r) => r.id), [a.id, b.id]);
  assert.equal((await R.listReceipts()).length, 3);
  assert.equal((await R.lastGoodPromotion('comp'))?.id, b.id);
  assert.equal(await R.blockingReceipt('comp'), null, 'preparing and complete do not block');

  const stuck = R.advanceState(R.advanceState(R.newReceipt({ team: 'comp', repos: [repo('cowork')], by: 'test' }), 'proving'), 'advancing');
  await R.writeReceipt(stuck);
  assert.equal((await R.blockingReceipt('comp'))?.id, stuck.id);
  assert.equal(await R.blockingReceipt('wispr'), null, 'a block is per team');
});

test('a revert receipt points at what it reverts, and its id says so', () => {
  const r = R.newReceipt({ team: 'comp', kind: 'team_revert', repos: [], by: 'health', revert_of: 'x' });
  assert.equal(r.revert_of, 'x');
  assert.match(r.id, /-revert-comp-/);
  assert.match(R.newReceipt({ team: 'comp', repos: [], by: 't' }).id, /-promote-comp-/);
});
