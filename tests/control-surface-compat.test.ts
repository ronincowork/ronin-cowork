/**
 * The compatibility edge of the control surface, as executable assertions.
 *
 * docs/worktrees.md moves reviewed work into managed repo desks — linked worktrees, each with
 * its own index. The legacy claim guard (bin/shim/git · .githooks/pre-commit ·
 * libexec/ronin-claim) exists for the opposite arrangement: many sessions in ONE shared
 * index. libexec/ronin-repo-mode is the single place that decides which of the two a
 * shell is standing in, and this file pins the contract from every side:
 *
 *   - the home checkout of a reviewed repo is a shared index: the guard is ON
 *   - a desk (linked worktree) has a private index: the guard is OFF, the shim is a
 *     pass-through, the hook says nothing
 *   - a declared-direct repo keeps today's behaviour in its shared checkout
 *   - overrides are explicit (RONIN_CLAIM_MODE, RONIN_CLAIM_OFF, RONIN_COMMIT_ALL)
 *   - RONIN_REPO is read as declared, and its absence means "undeclared", never a guess
 *
 * Everything runs through the REAL shim and the REAL hooks in a throwaway repository
 * that carries copies of them (core.hooksPath is per-repo config). No tmux, no store:
 * the claim file is named through the RONIN_CLAIM_FILE seam that exists for this file.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pexec = promisify(execFile);
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHIM_DIR = path.join(REPO, 'bin', 'shim');

type Run = { code: number; out: string; err: string };
const CLEAN_ENV: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined && !/^RONIN_/.test(k)) CLEAN_ENV[k] = v;
}
async function sh(cwd: string, cmd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  try {
    const { stdout, stderr } = await pexec(cmd, args, { cwd, env: { ...CLEAN_ENV, ...env, GIT_TERMINAL_PROMPT: '0' } });
    return { code: 0, out: stdout, err: stderr };
  } catch (e: any) {
    return { code: e.code ?? 1, out: e.stdout ?? '', err: e.stderr ?? '' };
  }
}
const realGit = (cwd: string, args: string[], env = {}) => sh(cwd, '/usr/bin/git', args, env);
// The shim resolves libexec relative to ITSELF (bin/shim/../../libexec), so it is the
// checked-in shim that runs, against whatever tree the cwd is in — exactly as on a box.
const shimGit = (cwd: string, args: string[], env = {}) =>
  sh(cwd, 'git', args, { ...env, PATH: `${SHIM_DIR}:${CLEAN_ENV.PATH ?? ''}` });
const facts = (s: string): Record<string, string> =>
  Object.fromEntries(s.trim().split('\n').map((l) => l.split('=', 2) as [string, string]));

async function makeRepo(name: string, declaration: string | null): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `ronin-compat-${name}-`));
  await realGit(dir, ['init', '-q', '-b', 'dev']);
  await realGit(dir, ['config', 'user.email', 'compat@test']);
  await realGit(dir, ['config', 'user.name', 'compat']);
  await realGit(dir, ['config', 'core.hooksPath', '.githooks']);
  await realGit(dir, ['config', 'commit.gpgsign', 'false']);
  // The guard's own files travel with the repo, so the hooks resolve them from the
  // toplevel of whichever worktree runs them.
  await fs.mkdir(path.join(dir, 'libexec'));
  await fs.mkdir(path.join(dir, '.githooks'));
  for (const f of ['ronin-claim', 'ronin-repo-mode']) await fs.copyFile(path.join(REPO, 'libexec', f), path.join(dir, 'libexec', f));
  for (const f of ['pre-commit', 'post-commit']) await fs.copyFile(path.join(REPO, '.githooks', f), path.join(dir, '.githooks', f));
  if (declaration !== null) await fs.writeFile(path.join(dir, 'RONIN_REPO'), declaration);
  await fs.writeFile(path.join(dir, 'README'), 'seed\n');
  await realGit(dir, ['add', '-A']);
  await realGit(dir, ['commit', '-q', '-m', 'seed'], { RONIN_COMMIT_ALL: '1' });
  return dir;
}
const MODE = (dir: string) => path.join(dir, 'libexec', 'ronin-repo-mode');

const reviewed = await makeRepo('reviewed', '# declared\nmode=reviewed\nworking=dev\nstable=master  # trailing comment\ndesks=managed\n');
const direct = await makeRepo('direct', 'mode=direct\nstable=main\ndesks=none\n');
const undeclared = await makeRepo('undeclared', null);
const desk = path.join(path.dirname(reviewed), path.basename(reviewed) + '-desk');
await realGit(reviewed, ['worktree', 'add', '-q', '-b', 'team/comp/fable', desk, 'dev']);
const claimDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-compat-claims-'));

test.after(async () => {
  for (const d of [desk, reviewed, direct, undeclared, claimDir]) await fs.rm(d, { recursive: true, force: true });
});

test('ronin-repo-mode reads RONIN_REPO as declared and measures the checkout', async () => {
  const home = facts((await sh(reviewed, MODE(reviewed), [])).out);
  assert.deepEqual(home, { arrangement: 'reviewed', working: 'dev', stable: 'master', desks: 'managed', checkout: 'home', index: 'shared', claim: 'on' });
  const atDesk = facts((await sh(desk, MODE(desk), [])).out);
  assert.equal(atDesk.checkout, 'desk');
  assert.equal(atDesk.index, 'private');
  assert.equal(atDesk.claim, 'off');
  assert.equal(atDesk.arrangement, 'reviewed', 'the declaration is the tree\'s, whichever worktree reads it');
  const d = facts((await sh(direct, MODE(direct), [])).out);
  assert.equal(d.arrangement, 'direct');
  assert.equal(d.working, '', 'a direct repo has no working line');
  assert.equal(d.claim, 'on', 'a direct repo\'s shared checkout keeps the guard');
  const u = facts((await sh(undeclared, MODE(undeclared), [])).out);
  assert.equal(u.arrangement, 'undeclared');
  assert.equal(u.desks, 'undeclared');
  assert.equal(u.claim, 'on', 'absence of RONIN_REPO is today\'s shared checkout, not a guess');
});

test('ronin-repo-mode: overrides are explicit and it fails open outside git', async () => {
  assert.equal((await sh(reviewed, MODE(reviewed), ['claim'], { RONIN_CLAIM_MODE: 'off' })).out.trim(), 'off');
  assert.equal((await sh(reviewed, MODE(reviewed), ['claim'], { RONIN_CLAIM_OFF: '1' })).out.trim(), 'off');
  assert.equal((await sh(desk, MODE(desk), ['claim'], { RONIN_CLAIM_MODE: 'shared' })).out.trim(), 'on', 'a deliberately shared desk can ask for the guard');
  const outside = facts((await sh(os.tmpdir(), MODE(reviewed), [])).out);
  assert.equal(outside.checkout, '');
  assert.equal(outside.claim, 'off');
  const bad = await sh(reviewed, MODE(reviewed), ['nonsense']);
  assert.equal(bad.code, 2);
});

test('shared checkout: the shim records the claim and the hook refuses a foreign staged file', async () => {
  const claimFile = path.join(claimDir, 'reviewed-staged');
  const env = { RONIN_CLAIM_FILE: claimFile };
  await fs.writeFile(path.join(reviewed, 'mine.txt'), 'mine\n');
  await fs.writeFile(path.join(reviewed, 'theirs.txt'), 'theirs\n');
  const add = await shimGit(reviewed, ['add', 'mine.txt'], env);
  assert.equal(add.code, 0, add.err);
  assert.equal((await fs.readFile(claimFile, 'utf8')).trim(), 'mine.txt', 'the add wrote down what it staged');
  // Another session, plain git, stages its own file into the same index.
  await realGit(reviewed, ['add', 'theirs.txt']);
  const refused = await realGit(reviewed, ['commit', '-q', '-m', 'carries a foreign file'], env);
  assert.notEqual(refused.code, 0, 'the commit must be refused');
  assert.match(refused.err, /REFUSED: this commit carries 1 file\(s\) your session never staged/);
  assert.match(refused.err, /theirs\.txt/);
  assert.match(refused.err, /SHARED checkout/);
  // Commit just yours, with the pathspec the message suggests; theirs stays staged.
  const own = await realGit(reviewed, ['commit', '-q', '-m', 'just mine', '--', 'mine.txt'], env);
  assert.equal(own.code, 0, own.err);
  assert.equal((await fs.stat(claimFile).then(() => true, () => false)), false, 'post-commit spent the claim');
  const staged = (await realGit(reviewed, ['diff', '--cached', '--name-only'])).out.trim();
  assert.equal(staged, 'theirs.txt', 'the other session\'s work is still staged, untouched');
  // The deliberate override lands it.
  const all = await realGit(reviewed, ['commit', '-q', '-m', 'landing theirs'], { ...env, RONIN_COMMIT_ALL: '1' });
  assert.equal(all.code, 0, all.err);
});

test('shared checkout reached by -C from another cwd: the add lands in THAT repo and is claimed there', async () => {
  // The shim once dropped `-C dir` on the way to ronin-claim, so the add ran in the caller's
  // cwd — every fixture that reaches its repo by -C broke, and a caller standing in the
  // shared checkout would have staged there. Run from a non-repo directory to prove the
  // globals travel.
  const claimFile = path.join(claimDir, 'by-C-staged');
  const env = { RONIN_CLAIM_FILE: claimFile };
  await fs.writeFile(path.join(reviewed, 'byc.txt'), 'via -C\n');
  const add = await shimGit(claimDir, ['-C', reviewed, 'add', 'byc.txt'], env);
  assert.equal(add.code, 0, add.err);
  assert.equal((await realGit(reviewed, ['diff', '--cached', '--name-only'])).out.trim(), 'byc.txt');
  assert.equal((await fs.readFile(claimFile, 'utf8')).trim(), 'byc.txt');
  const own = await realGit(reviewed, ['commit', '-q', '-m', 'via -C', '--', 'byc.txt'], env);
  assert.equal(own.code, 0, own.err);
  // `git -C dir add -- path` keeps its own `--` for git.
  await fs.writeFile(path.join(reviewed, '-weird.txt'), 'dash\n');
  const dashed = await shimGit(claimDir, ['-C', reviewed, 'add', '--', '-weird.txt'], { RONIN_CLAIM_FILE: path.join(claimDir, 'dash') });
  assert.equal(dashed.code, 0, dashed.err);
  assert.equal((await fs.readFile(path.join(claimDir, 'dash'), 'utf8')).trim(), '-weird.txt');
  await realGit(reviewed, ['commit', '-q', '-m', 'dash'], { RONIN_COMMIT_ALL: '1' });
});

test('stacked shims: a candidate checkout\'s shim ahead of the home shim still returns and stages once', async () => {
  // The first real promotion candidate put candidate/bin/shim before home/bin/shim on PATH.
  // A shim that strips only itself hands ronin-claim the OTHER shim's git, which strips
  // itself and reveals the first: two shims calling each other forever. Build a second
  // "candidate" copy of the shim tree and put it FIRST.
  const cand = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-compat-candidate-'));
  await fs.mkdir(path.join(cand, 'bin', 'shim'), { recursive: true });
  await fs.mkdir(path.join(cand, 'libexec'));
  await fs.copyFile(path.join(SHIM_DIR, 'git'), path.join(cand, 'bin', 'shim', 'git'));
  for (const f of ['ronin-claim', 'ronin-repo-mode']) await fs.copyFile(path.join(REPO, 'libexec', f), path.join(cand, 'libexec', f));
  const claimFile = path.join(claimDir, 'stacked-staged');
  await fs.writeFile(path.join(reviewed, 'stacked.txt'), 'stacked\n');
  const stackedPath = `${path.join(cand, 'bin', 'shim')}:${SHIM_DIR}:${CLEAN_ENV.PATH ?? ''}`;
  const run = sh(reviewed, 'git', ['add', 'stacked.txt'], { RONIN_CLAIM_FILE: claimFile, PATH: stackedPath });
  const timeout = new Promise<Run>((_, rej) => setTimeout(() => rej(new Error('the stacked shims never returned — shim-calls-shim loop')), 15000));
  const add = await Promise.race([run, timeout]);
  assert.equal(add.code, 0, add.err);
  assert.equal((await fs.readFile(claimFile, 'utf8')).trim(), 'stacked.txt');
  assert.equal((await realGit(reviewed, ['diff', '--cached', '--name-only'])).out.trim(), 'stacked.txt', 'staged exactly once, in the right repo');
  await realGit(reviewed, ['commit', '-q', '-m', 'stacked'], { RONIN_CLAIM_FILE: claimFile });
  await fs.rm(cand, { recursive: true, force: true });
});

test('desk: the shim passes through, records nothing, and the hook stays silent', async () => {
  const claimFile = path.join(claimDir, 'desk-staged');
  const env = { RONIN_CLAIM_FILE: claimFile };
  await fs.writeFile(path.join(desk, 'a.txt'), 'a\n');
  await fs.writeFile(path.join(desk, 'b.txt'), 'b\n');
  const add = await shimGit(desk, ['add', 'a.txt'], env);
  assert.equal(add.code, 0, add.err);
  assert.equal(await fs.stat(claimFile).then(() => true, () => false), false, 'no claim is recorded at a desk');
  // Even a claim file that somehow exists is not consulted: a private index has no foreign work.
  await fs.writeFile(claimFile, 'a.txt\n');
  await realGit(desk, ['add', 'b.txt']);
  const commit = await realGit(desk, ['commit', '-q', '-m', 'both, privately'], env);
  assert.equal(commit.code, 0, commit.err);
  assert.equal((await realGit(desk, ['log', '-1', '--format=%s'])).out.trim(), 'both, privately');
  // `git -C <desk> add` from elsewhere is judged in the desk, not in the cwd.
  await fs.writeFile(path.join(desk, 'c.txt'), 'c\n');
  const fromHome = await shimGit(reviewed, ['-C', desk, 'add', 'c.txt'], { RONIN_CLAIM_FILE: path.join(claimDir, 'never') });
  assert.equal(fromHome.code, 0, fromHome.err);
  assert.equal(await fs.stat(path.join(claimDir, 'never')).then(() => true, () => false), false);
});

test('direct-mode regression: a declared-direct shared checkout behaves as it always has', async () => {
  const claimFile = path.join(claimDir, 'direct-staged');
  const env = { RONIN_CLAIM_FILE: claimFile };
  await fs.writeFile(path.join(direct, 'idea.md'), 'an idea\n');
  await fs.writeFile(path.join(direct, 'other.md'), 'someone else\n');
  await shimGit(direct, ['add', 'idea.md'], env);
  assert.equal((await fs.readFile(claimFile, 'utf8')).trim(), 'idea.md');
  await realGit(direct, ['add', 'other.md']);
  const refused = await realGit(direct, ['commit', '-q', '-m', 'x'], env);
  assert.notEqual(refused.code, 0, 'direct mode still guards its shared index');
  const own = await realGit(direct, ['commit', '-q', '-m', 'idea', '--', 'idea.md'], env);
  assert.equal(own.code, 0, own.err);
});

/* ------------------------------------------------------------ the receipt at the PR */
// The dev → master PR consumes the team-promotion receipt (src/promotion/receipts.ts)
// instead of being the first full check. scripts/verify-promotion-receipt.mjs is what
// CI runs; these pin what it accepts and every way it refuses.
import { extractReceipt, receiptProblem } from '../scripts/verify-promotion-receipt.mjs';
import { publicPromotionReceipt } from '../src/promotion/receipts.js';
process.env.BIND ??= '127.0.0.1'; // src/ imports must not wake the tailscale probe (check-tests.mjs)
const { candidateEnv } = await import('../src/promotion/byoin.js');

test('the promotion runner spawns candidate checks outside every Ronin shim', () => {
  const from = {
    PATH: '/cand/bin/shim:/home/x/ronin-cowork/bin/shim/:/home/x/ronin-cowork/ronin_bin:/usr/local/bin:/usr/bin:/bin:/opt/shimmer/bin',
    GIT_DIR: '/leak/.git', GIT_WORK_TREE: '/leak', RONIN_REAL_GIT: '/usr/bin/git', HOME: '/home/x',
  } as NodeJS.ProcessEnv;
  const env = candidateEnv(from);
  assert.equal(env.PATH, '/home/x/ronin-cowork/ronin_bin:/usr/local/bin:/usr/bin:/bin:/opt/shimmer/bin', 'every */bin/shim entry is gone, nothing else is');
  assert.equal(env.GIT_DIR, undefined);
  assert.equal(env.GIT_WORK_TREE, undefined);
  assert.equal(env.RONIN_REAL_GIT, undefined);
  assert.equal(env.HOME, '/home/x');
  assert.equal(env.BIND, '127.0.0.1');
  assert.equal(candidateEnv({ PATH: '/usr/bin', BIND: '0.0.0.0' } as NodeJS.ProcessEnv).BIND, '0.0.0.0');
});

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const good = () => ({
  id: '20260828T090000Z-promote-comp-ab12', kind: 'team_promotion', team: 'comp', by: 'comps',
  created_at: 't', updated_at: 't', state: 'complete', history: [],
  repos: [{ repo: 'cowork', dir: '/x', line: 'team/comp/dev', target: 'dev', expected_old: '000', line_tip: '111', candidate: SHA, hand_in_receipts: [], files: [] }],
  proofs: [{ repo: 'cowork', candidate: SHA, mode: 'full', passed: true, gates: [{ name: 'tsc', status: 'ok' }], verdict: 'BYOIN ok' }],
  advances: [{ repo: 'cowork', target: 'dev', from: '000', to: SHA, status: 'done' }],
});

test('receipt: a complete receipt whose full proof and advance name this commit is proof', () => {
  assert.equal(receiptProblem(good(), 'cowork', SHA), null);
  assert.equal(receiptProblem(good(), 'cowork', SHA.slice(0, 12)), null, 'a short SHA that prefixes the candidate is the same commit');
});

test('receipt: every way it refuses names the reason', () => {
  const cases: [string, (r: any) => void, RegExp][] = [
    ['not complete', (r) => { r.state = 'advancing'; }, /'advancing', and only 'complete'/],
    ['other repo', (r) => { r.repos[0].repo = 'services'; }, /no candidate for repository 'cowork'/],
    ['other commit', (r) => { r.repos[0].candidate = 'ffff' + SHA.slice(4); }, /proves ffff.* not a1b2/],
    ['no proof', (r) => { r.proofs = []; }, /no BYOIN proof/],
    ['proof failed', (r) => { r.proofs[0].passed = false; }, /did not pass/],
    ['gates-only proof', (r) => { r.proofs[0].mode = 'gates'; }, /'gates', not the full/],
    ['advance raced', (r) => { r.advances[0].status = 'raced'; }, /'raced', not done/],
    ['reverted', (r) => { r.reverted_by = 'rev-1'; }, /reverted by rev-1/],
    ['wrong kind', (r) => { r.kind = 'hand_in'; }, /unknown receipt kind/],
  ];
  for (const [name, mutate, re] of cases) {
    const r = good(); mutate(r);
    const why = receiptProblem(r, 'cowork', SHA);
    assert.ok(why && re.test(why), `${name}: got ${why}`);
  }
  assert.match(receiptProblem(null, 'cowork', SHA)!, /not a JSON object/);
});

test('receipt: it rides the PR body in a ronin-promotion-receipt fence', () => {
  const body = `what + why\n\n\`\`\`ronin-promotion-receipt\n${JSON.stringify(good())}\n\`\`\`\n\nhow verified: receipt above`;
  const text = extractReceipt(body);
  assert.ok(text);
  assert.equal(receiptProblem(JSON.parse(text!), 'cowork', SHA), null);
  assert.equal(extractReceipt('no block here'), null);
  assert.equal(extractReceipt('```json\n{}\n```'), null, 'only the named fence counts');
});

test('receipt: its public projection contains proof, never private coordination metadata', () => {
  const privateReceipt = good() as any;
  for (const row of [...privateReceipt.repos, ...privateReceipt.proofs, ...privateReceipt.advances]) row.repo = 'ronin_cowork';
  const publicReceipt = publicPromotionReceipt(privateReceipt) as any;
  assert.equal(receiptProblem(publicReceipt, 'cowork', SHA), null);
  const json = JSON.stringify(publicReceipt);
  for (const secret of ['"team":"comp"', '"by":"comps"', '"ronin_cowork"', '/x', 'team/comp/dev', 'hand_in_receipts', 'created_at', 'updated_at', 'history']) {
    assert.ok(!json.includes(secret), `public receipt leaked ${secret}: ${json}`);
  }
});

test('receipt: the CLI exits 1 without a receipt and 0 with a proving one', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-receipt-'));
  const cli = path.join(REPO, 'scripts', 'verify-promotion-receipt.mjs');
  await fs.writeFile(path.join(dir, 'body.md'), 'a PR with no receipt');
  const none = await sh(dir, 'node', [cli, '--sha', SHA, '--pr-body', path.join(dir, 'body.md')]);
  assert.equal(none.code, 1);
  assert.match(none.out, /receipt FAIL — the pull request body carries no/);
  await fs.writeFile(path.join(dir, 'r.json'), JSON.stringify(good()));
  const ok = await sh(dir, 'node', [cli, '--sha', SHA, '--repo', 'cowork', '--receipt', path.join(dir, 'r.json')]);
  assert.equal(ok.code, 0, ok.out + ok.err);
  assert.match(ok.out, /receipt ok — 20260828T090000Z-promote-comp-ab12 .* proves cowork@/);
  const wrong = await sh(dir, 'node', [cli, '--sha', 'deadbeef', '--receipt', path.join(dir, 'r.json')]);
  assert.equal(wrong.code, 1);
  assert.match(wrong.out, /not deadbeef/);
  await fs.rm(dir, { recursive: true, force: true });
});
