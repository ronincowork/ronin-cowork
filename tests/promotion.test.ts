/**
 * TEAM PROMOTION — the executor against a scratch git repository, every machine effect faked.
 *
 * What is load-bearing (docs/control-surface.md, strict gates): a failed proof leaves
 * `dev` untouched; a conflict is contained in the candidate; refs move by compare-and-swap
 * in receipt order and the first race STOPS the rest; an interrupted receipt blocks the
 * team until resumed or abandoned; resume rebuilds from current tips; a health failure is
 * reverted through the same door and the range stays attributed; bisect names the first
 * failing hand-in. BYOIN, restart, health and the wipeboard are fakes — the real ones are
 * `byoin.ts`/`health.ts` and they need a machine.
 *
 * Real git in a temp dir; no tmux, no socket, no live store (both stores are pointed at
 * the temp dir before the modules load).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-promotion-'));
process.env.RONIN_WORKTREES_DIR = path.join(root, 'worktrees');
process.env.RONIN_PROMOTION_LEDGER_DIR = path.join(root, 'ledger');
process.env.BIND = '127.0.0.1';
const P = await import('../src/promotion/promote.js');
const R = await import('../src/promotion/receipts.js');
const C = await import('../src/promotion/candidate.js');
type Effects = import('../src/promotion/promote.js').Effects;
type RepoCandidate = import('../src/promotion/receipts.js').RepoCandidate;

const LEDGER = process.env.RONIN_PROMOTION_LEDGER_DIR;
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const sh = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

/** A repo on `dev` with one file, and a team line with `n` hand-ins on it, each touching its own file. */
async function fixture(name: string, handIns = 2): Promise<{ dir: string; base: string; line: string[] }> {
  // One worktrees store per fixture: in life a repo NAME is one repository, so the
  // candidate folder `.candidates/<repo>/dev` is one folder; here every fixture is
  // 'cowork', and the executor rightly refuses a candidate folder it did not make.
  process.env.RONIN_WORKTREES_DIR = path.join(root, 'worktrees', Math.random().toString(36).slice(2, 8));
  const dir = path.join(root, 'repos', `${name}-${Math.random().toString(36).slice(2, 6)}`);
  await fs.mkdir(dir, { recursive: true });
  sh(dir, 'init', '-q', '-b', 'dev');
  await fs.writeFile(path.join(dir, 'README.md'), `# ${name}\n`);
  sh(dir, 'add', '-A'); sh(dir, 'commit', '-q', '-m', 'base');
  const base = sh(dir, 'rev-parse', 'HEAD');
  sh(dir, 'branch', 'team/comp/dev', base);
  // Hand-ins land on the line in a throwaway worktree so the mounted dev stays put.
  const wt = path.join(root, 'wt', `${name}-line-${Math.random().toString(36).slice(2, 6)}`);
  sh(dir, 'worktree', 'add', '-q', wt, 'team/comp/dev');
  const line: string[] = [];
  for (let i = 1; i <= handIns; i++) {
    await fs.writeFile(path.join(wt, `hand-in-${i}.txt`), `${name} ${i}\n`);
    sh(wt, 'add', '-A'); sh(wt, 'commit', '-q', '-m', `hand-in ${i}`);
    line.push(sh(wt, 'rev-parse', 'HEAD'));
  }
  sh(dir, 'worktree', 'remove', '--force', wt);
  return { dir, base, line };
}

const spec = (repo: string, dir: string) => ({ repo, dir, line: 'team/comp/dev', target: 'dev' });

const pass = (c: RepoCandidate): import('../src/promotion/receipts.js').RepoProof => ({ repo: c.repo, candidate: c.candidate, mode: 'full', passed: true, gates: [{ name: 'check-x', status: 'ok' }], verdict: 'BYOIN: the repo is clean' });
const fail = (c: RepoCandidate): import('../src/promotion/receipts.js').RepoProof => ({ repo: c.repo, candidate: c.candidate, mode: 'full', passed: false, gates: [{ name: 'check-tests', status: 'FAIL', detail: 'not ok 3' }], verdict: 'BYOIN: 1 gate(s) failed — check-tests' });

function fakes(over: Partial<Effects> = {}): Effects {
  return {
    byoin: async (c) => pass(c),
    compat: async () => ({ passed: true, checks: [{ name: 'compat', status: 'SKIP', detail: 'faked' }] }),
    restart: async () => ({ unit: 'fake', at: new Date().toISOString(), ok: true }),
    health: async () => ({ passed: true, checks: [{ name: 'api/health', status: 'ok' }], at: new Date().toISOString() }),
    notify: async () => 'posted',
    handInsFor: C.derivedHandIns,
    ...over,
  };
}

const quiet = { ledgerDir: LEDGER, log: () => undefined };

test('happy path: candidate = dev + line, full BYOIN on that exact SHA, CAS advance, mounted dev refreshed, receipt CI can consume', async () => {
  const cw = await fixture('cowork');
  const out = await P.promoteTeam({ team: 'happy', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(out.ok, true, out.message);
  const r = out.receipt!;
  assert.equal(r.state, 'complete');
  assert.deepEqual(r.history.map((h) => h.state), ['preparing', 'proving', 'advancing', 'complete']);
  const c = r.repos[0];
  assert.equal(c.expected_old, cw.base);
  assert.equal(c.line_tip, cw.line[1]);
  assert.deepEqual(c.hand_in_receipts, cw.line, 'one derived hand-in per first-parent commit, oldest first (no ledger rows in this fixture)');
  assert.deepEqual(c.files.sort(), ['hand-in-1.txt', 'hand-in-2.txt']);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), c.candidate, 'dev is at the candidate');
  assert.equal(sh(cw.dir, 'rev-parse', 'HEAD'), c.candidate, 'the mounted worktree followed');
  assert.equal(await fs.readFile(path.join(cw.dir, 'hand-in-2.txt'), 'utf8'), 'cowork 2\n', 'the files followed too');
  assert.equal(sh(cw.dir, 'status', '--porcelain'), '', 'and it is clean');
  // What Fable 5's verify-promotion-receipt.mjs asserts for a dev → master PR at this SHA:
  assert.equal(r.proofs[0].candidate, c.candidate);
  assert.equal(r.proofs[0].mode, 'full');
  assert.equal(r.proofs[0].passed, true);
  assert.deepEqual(r.advances[0], { ...r.advances[0], repo: 'cowork', to: c.candidate, status: 'done' });
  assert.equal(r.reverted_by, undefined);
  const shared = R.toChangeSet(r);
  assert.equal(shared.state, 'complete');
  assert.equal(shared.repos[0].advanced_to, c.candidate);
  // And it is on disk, and the team is not blocked.
  assert.equal((await R.readReceipt(r.id, LEDGER))?.state, 'complete');
  assert.equal(await R.blockingReceipt('happy', LEDGER), null);
  // Nothing more to promote now.
  const again = await P.promoteTeam({ team: 'happy', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(again.nothing, true);
  assert.equal(again.receipt, null, 'nothing to promote writes no receipt');
});

test('a failed proof leaves dev untouched and names the gates, the files and the hand-ins', async () => {
  const cw = await fixture('cowork');
  const out = await P.promoteTeam({ team: 'red', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes({ byoin: async (c) => fail(c) }), restart: false, ...quiet });
  assert.equal(out.ok, false);
  const r = out.receipt!;
  assert.equal(r.state, 'failed');
  assert.equal(r.failure?.stage, 'proving');
  assert.deepEqual(r.failure?.gates, ['cowork:check-tests']);
  assert.deepEqual(r.failure?.hand_in_receipts, cw.line);
  assert.deepEqual([...(r.failure?.files ?? [])].sort(), ['hand-in-1.txt', 'hand-in-2.txt']);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), cw.base, 'dev did not move');
  assert.equal(await R.blockingReceipt('red', LEDGER), null, 'failed does not block — nothing moved');
});

test('a conflict is contained in the candidate: refused at prepare, dev and its worktree untouched', async () => {
  const cw = await fixture('cowork', 1);
  // dev gains a commit that collides with hand-in 1.
  await fs.writeFile(path.join(cw.dir, 'hand-in-1.txt'), 'dev says otherwise\n');
  sh(cw.dir, 'add', '-A'); sh(cw.dir, 'commit', '-q', '-m', 'dev moves');
  const devTip = sh(cw.dir, 'rev-parse', 'dev');
  const out = await P.promoteTeam({ team: 'clash', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(out.ok, false);
  assert.equal(out.receipt?.state, 'failed');
  assert.equal(out.receipt?.failure?.stage, 'preparing');
  assert.deepEqual(out.receipt?.repos[0].conflict_files, ['hand-in-1.txt']);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), devTip);
  assert.equal(sh(cw.dir, 'status', '--porcelain'), '', 'no half-merge anywhere near the funnel');
  const cdir = C.candidateDir('cowork', 'dev');
  assert.equal(sh(cdir, 'status', '--porcelain'), '', 'the candidate was aborted clean too');
});

test('a dirty reviewed integration worktree is refused with a recovery-oriented explanation', async () => {
  const cw = await fixture('cowork', 1);
  await fs.writeFile(path.join(cw.dir, 'README.md'), 'someone typed here\n');
  const out = await P.promoteTeam({ team: 'dirty', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(out.ok, false);
  assert.match(out.receipt?.repos[0].refused ?? '', /diagnose and preserve/);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), cw.base);
  assert.equal(await fs.readFile(path.join(cw.dir, 'README.md'), 'utf8'), 'someone typed here\n', 'the dirt is still theirs');
});

test('coordinated promotion: a race after the first ref moved stops the rest, blocks the team, and resume rebuilds from current tips', async () => {
  const cw = await fixture('cowork', 1);
  const sv = await fixture('services', 1);
  let moved = '';
  const fx = fakes({
    beforeAdvance: async (repo) => {
      if (repo !== 'services') return;
      // Someone advanced services' dev between proving and the swap.
      const wt = path.join(root, 'wt', 'race');
      sh(sv.dir, 'worktree', 'add', '-q', '--detach', wt, 'dev');
      await fs.writeFile(path.join(wt, 'racer.txt'), 'x\n');
      sh(wt, 'add', '-A'); sh(wt, 'commit', '-q', '-m', 'racer');
      moved = sh(wt, 'rev-parse', 'HEAD');
      sh(sv.dir, 'update-ref', 'refs/heads/dev', moved);
      sh(sv.dir, 'reset', '-q', '--hard', moved);
      sh(sv.dir, 'worktree', 'remove', '--force', wt);
    },
  });
  const out = await P.promoteTeam({ team: 'race', repos: [spec('cowork', cw.dir), spec('services', sv.dir)], by: 'lead', effects: fx, restart: false, ...quiet });
  assert.equal(out.ok, false);
  const r = out.receipt!;
  assert.equal(r.state, 'interrupted');
  assert.equal(r.advances[0].status, 'done');
  assert.equal(r.advances[1].status, 'raced');
  assert.equal(r.advances[1].found, moved);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), r.repos[0].candidate, 'cowork moved');
  assert.equal(sh(sv.dir, 'rev-parse', 'dev'), moved, 'services was NOT overwritten');
  assert.match(R.summarize(r), /landing: cowork done, services raced/);
  assert.equal(R.toChangeSet(r).state, 'interrupted');

  // Blocked until recovered.
  const blocked = await P.promoteTeam({ team: 'race', repos: [spec('services', sv.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /resume or abandon/);

  // Resume: services is rebuilt on its CURRENT tip (racer + hand-in), cowork stays done.
  const res = await P.resumePromotion({ id: r.id, by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(res.ok, true, res.message);
  const orig = (await R.readReceipt(r.id, LEDGER))!;
  assert.equal(orig.state, 'complete');
  assert.match(orig.failure?.message ?? '', /finished by /);
  const rebuilt = res.receipt!;
  assert.notEqual(rebuilt.id, r.id, 'the rebuild is its own receipt');
  assert.equal(rebuilt.repos[0].expected_old, moved, 'built on the tip that raced us');
  assert.equal(sh(sv.dir, 'rev-parse', 'dev'), rebuilt.repos[0].candidate);
  assert.ok(await fs.stat(path.join(sv.dir, 'racer.txt')), 'the racer\'s work survived');
  assert.ok(await fs.stat(path.join(sv.dir, 'hand-in-1.txt')), 'and ours landed');
  assert.equal(await R.blockingReceipt('race', LEDGER), null);
});

test('a process that died mid-advance leaves `advancing` — it blocks, abandon records what moved, and moved refs stay moved', async () => {
  const cw = await fixture('cowork', 1);
  const r = R.advanceState(R.advanceState(R.newReceipt({ team: 'dead', repos: [], by: 't' }), 'proving'), 'advancing');
  await R.writeReceipt(r, LEDGER);
  const blocked = await P.promoteTeam({ team: 'dead', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(blocked.ok, false);
  const ab = await P.abandonPromotion(r.id, 'the lead gave up', LEDGER);
  assert.equal(ab.ok, true);
  assert.equal(ab.receipt?.state, 'abandoned');
  assert.deepEqual(ab.receipt?.history.map((h) => h.state), ['preparing', 'proving', 'advancing', 'interrupted', 'abandoned']);
  assert.equal(await R.blockingReceipt('dead', LEDGER), null);
});

test('dev is live: health failure after restart is reverted through the same door, attributed, and the lead is told', async () => {
  const cw = await fixture('cowork', 2);
  const notices: string[] = [];
  let healthCalls = 0;
  const fx = fakes({
    health: async () => (++healthCalls === 1
      ? { passed: false, checks: [{ name: 'smoke-ui', status: 'FAIL', detail: 'the page is blank' }], at: new Date().toISOString() }
      : { passed: true, checks: [{ name: 'api/health', status: 'ok' }], at: new Date().toISOString() }),
    notify: async (_d, _t, text) => { notices.push(text); return 'posted'; },
  });
  const out = await P.promoteTeam({ team: 'live', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fx, ...quiet });
  assert.equal(out.ok, false);
  const r = out.receipt!;
  assert.equal(r.state, 'reverted');
  assert.deepEqual(r.history.map((h) => h.state), ['preparing', 'proving', 'advancing', 'restarting', 'reverted']);
  assert.equal(r.health?.passed, false);
  assert.ok(r.reverted_by, 'points at the revert receipt');
  const rev = (await R.readReceipt(r.reverted_by!, LEDGER))!;
  assert.equal(rev.kind, 'team_revert');
  assert.equal(rev.revert_of, r.id);
  assert.equal(rev.state, 'complete');
  assert.equal(rev.repos[0].expected_old, r.repos[0].candidate, 'the revert was built on what the promotion landed');
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), rev.repos[0].candidate, 'dev is at the revert');
  assert.equal(await fs.stat(path.join(cw.dir, 'hand-in-2.txt')).catch(() => null), null, 'the promoted files are gone again');
  assert.equal(await fs.readFile(path.join(cw.dir, 'README.md'), 'utf8'), '# cowork\n');
  assert.equal(sh(cw.dir, 'branch', '--list', 'revert/*'), '', 'the throwaway revert branch is gone');
  assert.equal(healthCalls, 2, 'health ran after the promotion and after the revert');
  assert.equal(notices.length, 1);
  assert.match(notices[0], /REVERTED/);
  assert.match(notices[0], new RegExp(`${r.repos[0].expected_old.slice(0, 7)}..${r.repos[0].candidate.slice(0, 7)}`), 'the range stays attributed');
});

test('manual revert is candidate-first: a failed BYOIN leaves dev at the promoted tip', async () => {
  const cw = await fixture('cowork', 1);
  const promoted = await P.promoteTeam({ team: 'revert-red', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(promoted.ok, true);
  const before = sh(cw.dir, 'rev-parse', 'dev');
  const out = await P.revertPromotion({ receipt: promoted.receipt!, by: 'lead', effects: fakes({ byoin: async (c) => fail(c) }), ...quiet });
  assert.equal(out.ok, false);
  assert.equal(out.receipt?.state, 'failed');
  assert.equal(out.receipt?.failure?.stage, 'proving');
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), before, 'the target ref never moved before the revert candidate proved');
  assert.ok(await fs.stat(path.join(cw.dir, 'hand-in-1.txt')), 'the promoted content remains live');
  assert.equal(sh(cw.dir, 'branch', '--list', 'revert/*'), '', 'the throwaway branch is removed after failure');
});

test('bisect names the first hand-in whose candidate fails, and the files it touched', async () => {
  const cw = await fixture('cowork', 3);
  const fx = fakes({
    byoin: async (c, cdir) => ((await fs.stat(path.join(cdir, 'hand-in-2.txt')).catch(() => null)) ? fail(c) : pass(c)),
  });
  const b = await P.bisectLine({ spec: spec('cowork', cw.dir), effects: fx, log: () => undefined });
  assert.equal(b.culprit, cw.line[1]);
  assert.deepEqual(b.files, ['hand-in-2.txt']);
  assert.deepEqual(b.steps.map((s) => s.passed), [true, false]);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), cw.base, 'bisect moves nothing');
});

test('dry run proves and writes nothing, moves nothing', async () => {
  const cw = await fixture('cowork', 1);
  const before = (await R.listReceipts(undefined, LEDGER)).length;
  const out = await P.promoteTeam({ team: 'dry', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), dryRun: true, ...quiet });
  assert.equal(out.ok, true);
  assert.equal(out.receipt?.state, 'proving');
  assert.equal((await R.listReceipts(undefined, LEDGER)).length, before);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), cw.base);
});
