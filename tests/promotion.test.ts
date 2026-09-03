/**
 * TEAM PROMOTION — the executor against a scratch git repository, every machine effect faked.
 *
 * Promotion behavior is exercised against scratch repositories: a failed proof reports
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

function fakes(over: Partial<Effects> = {}): Effects {
  return {
    restart: async () => ({ unit: 'fake', at: new Date().toISOString(), ok: true }),
    health: async () => ({ passed: true, checks: [{ name: 'api/health', status: 'ok' }], at: new Date().toISOString() }),
    notify: async () => 'posted',
    handInsFor: C.derivedHandIns,
    ...over,
  };
}

const quiet = { ledgerDir: LEDGER, log: () => undefined };

test('happy path: candidate = dev + line, CAS advance, mounted dev refreshed', async () => {
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
  assert.deepEqual(r.proofs, []);
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

test('HTTP promotion replies with the restarting receipt before post-restart health completes it', async () => {
  const cw = await fixture('http-restart', 1);
  let handedOff = '';
  let restarts = 0;
  let healthChecks = 0;
  const fx = fakes({
    restart: async () => { restarts++; return { unit: 'fake', at: new Date().toISOString(), ok: true }; },
    health: async () => { healthChecks++; return { passed: true, checks: [{ name: 'api/health', status: 'ok' }], at: new Date().toISOString() }; },
  });
  const reply = await P.promoteTeam({
    team: 'http-restart', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fx,
    deferRestart: async (receipt) => { handedOff = receipt.id; }, ...quiet,
  });
  assert.equal(reply.ok, true);
  assert.equal(reply.receipt?.state, 'restarting');
  assert.equal(handedOff, reply.receipt?.id);
  assert.equal(restarts, 0);
  assert.equal(healthChecks, 0);

  const done = await P.finishPromotionRestart(reply.receipt!, { effects: fx, ledgerDir: LEDGER });
  assert.equal(done.receipt?.state, 'complete');
  assert.equal(restarts, 1);
  assert.equal(healthChecks, 1);
  assert.equal((await R.readReceipt(handedOff, LEDGER))?.health?.passed, true);
});

test('resume accepts a restarting receipt and records restart health', async () => {
  const cw = await fixture('resume-restart', 1);
  const fx = fakes();
  const started = await P.promoteTeam({
    team: 'resume-restart', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fx,
    deferRestart: async () => undefined, ...quiet,
  });
  assert.equal(started.receipt?.state, 'restarting');

  const resumed = await P.resumePromotion({ id: started.receipt!.id, by: 'lead', effects: fx, ...quiet });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.receipt?.state, 'complete');
  assert.equal(resumed.receipt?.restart?.ok, true);
  assert.equal(resumed.receipt?.health?.passed, true);
});

test('explicit resume refreshes an old restarting receipt before handing it to boot recovery', async () => {
  const cw = await fixture('resume-old-restart', 1);
  const started = await P.promoteTeam({
    team: 'resume-old-restart', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(),
    deferRestart: async () => undefined, ...quiet,
  });
  const old = { ...started.receipt!, updated_at: '2000-01-01T00:00:00.000Z' };
  await R.writeReceipt(old, LEDGER);
  let handedOff = '';
  const resumed = await P.resumePromotion({
    id: old.id, by: 'lead', effects: fakes(), ledgerDir: LEDGER,
    deferRestart: async (receipt) => { handedOff = receipt.id; },
  });
  assert.equal(resumed.ok, true);
  assert.equal(handedOff, old.id);
  assert(Date.parse(resumed.receipt!.updated_at) > Date.parse(old.updated_at));
  assert.equal((await R.readReceipt(old.id, LEDGER))?.updated_at, resumed.receipt?.updated_at);
  await P.finishPromotionRestart(resumed.receipt!, { effects: fakes(), ledgerDir: LEDGER });
});

test('promotions from different teams answer BUSY immediately with the active receipt state', async () => {
  const first = await fixture('box-lock-first', 1);
  const second = await fixture('box-lock-second', 1);
  const held = await P.promoteTeam({
    team: 'alpha', repos: [spec('first', first.dir)], by: 'lead', effects: fakes(),
    deferRestart: async () => undefined, ...quiet,
  });
  assert.equal(held.receipt?.state, 'restarting');
  const lines: string[] = [];
  await assert.rejects(P.promoteTeam({
    team: 'beta', repos: [spec('second', second.dir)], by: 'lead', effects: fakes(), restart: false,
    ledgerDir: LEDGER, log: (line) => lines.push(line),
  }), { message: `BUSY: alpha's ${held.receipt!.id} is restarting` });
  await P.finishPromotionRestart(held.receipt!, { effects: fakes(), ledgerDir: LEDGER });
  assert.equal(lines.length, 0);
});

test('a promotion reclaims a lock older than the in-flight window and says why', async () => {
  const cw = await fixture('stale-box-lock', 1);
  await R.acquirePromotionLock({ id: 'old-receipt', team: 'old-team', at: new Date(0).toISOString() }, LEDGER);
  const lines: string[] = [];
  const out = await P.promoteTeam({
    team: 'new-team', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false,
    ledgerDir: LEDGER, log: (line) => lines.push(line),
  });
  assert.equal(out.ok, true);
  assert(lines.some((line) => line === "reclaiming stale promotion lock: old-team's old-receipt exceeded the in-flight window"));
});

test('a conflict is contained in the candidate: refused at prepare, dev and its worktree untouched', async () => {
  const cw = await fixture('cowork', 1);
  // dev gains a commit that collides with hand-in 1.
  await fs.writeFile(path.join(cw.dir, 'hand-in-1.txt'), 'dev says otherwise\n');
  sh(cw.dir, 'add', '-A'); sh(cw.dir, 'commit', '-q', '-m', 'dev moves');
  const devTip = sh(cw.dir, 'rev-parse', 'dev');
  const out = await P.promoteTeam({ team: 'clash', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(out.ok, true);
  assert.equal(out.receipt, null);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), devTip);
  assert.equal(sh(cw.dir, 'status', '--porcelain'), '', 'no half-merge anywhere near the funnel');
  const cdir = C.candidateDir('cowork', 'dev');
  assert.equal(sh(cdir, 'status', '--porcelain'), '', 'the candidate was aborted clean too');
});

test('a dirty reviewed integration worktree is refused with a recovery-oriented explanation', async () => {
  const cw = await fixture('cowork', 1);
  await fs.writeFile(path.join(cw.dir, 'README.md'), 'someone typed here\n');
  const out = await P.promoteTeam({ team: 'dirty', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(out.ok, true);
  assert.equal(out.receipt, null);
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
  assert.equal(blocked.ok, true);

  assert.equal(blocked.receipt?.repos[0].expected_old, moved, 'the next promotion built on the tip that raced us');
  assert.equal(sh(sv.dir, 'rev-parse', 'dev'), blocked.receipt?.repos[0].candidate);
  assert.ok(await fs.stat(path.join(sv.dir, 'racer.txt')), 'the racer\'s work survived');
  assert.ok(await fs.stat(path.join(sv.dir, 'hand-in-1.txt')), 'and ours landed');
});

test('a process that died mid-advance leaves `advancing` — it blocks, abandon records what moved, and moved refs stay moved', async () => {
  const cw = await fixture('cowork', 1);
  const r = R.advanceState(R.advanceState(R.newReceipt({ team: 'dead', repos: [], by: 't' }), 'proving'), 'advancing');
  await R.writeReceipt(r, LEDGER);
  const blocked = await P.promoteTeam({ team: 'dead', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), restart: false, ...quiet });
  assert.equal(blocked.ok, true);
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

test('dry run proves and writes nothing, moves nothing', async () => {
  const cw = await fixture('cowork', 1);
  const before = (await R.listReceipts(undefined, LEDGER)).length;
  const out = await P.promoteTeam({ team: 'dry', repos: [spec('cowork', cw.dir)], by: 'lead', effects: fakes(), dryRun: true, ...quiet });
  assert.equal(out.ok, true);
  assert.equal(out.receipt?.state, 'proving');
  assert.equal((await R.listReceipts(undefined, LEDGER)).length, before);
  assert.equal(sh(cw.dir, 'rev-parse', 'dev'), cw.base);
});
