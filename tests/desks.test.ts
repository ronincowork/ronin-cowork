/**
 * DESKS — the state and hand-in floor, exercised end to end against real git in a temp
 * directory. No tmux, no socket, no live store: every store is pointed at a temp dir by
 * its canonical override, and the "repositories" are made here. What this proves:
 *
 *   - a desk opens from its team line at once, upstream set, recorded; funnel points and
 *     direct repos are refused by name; a repo with no RONIN_REPO gets no desk;
 *   - hand-in is mechanical admission: the line advances by compare-and-swap only, a
 *     conflict leaves it untouched, nothing-to-hand-in is a refusal with a receipt;
 *   - accepted team state flows down: a clean sibling adopts now, a dirty one is marked
 *     pending with the overlap and its files are not touched;
 *   - close never loses work: unsaved files become a WIP commit, an unintegrated tip is
 *     parked, only an integrated one is deleted; discard is explicit;
 *   - two hand-ins at once serialize and both land; a crashed holder's lock is reclaimed;
 *     a stale expected ref never advances.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.BIND ??= '127.0.0.1';
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-desks-'));
process.env.RONIN_CATALOGS_DIR = path.join(tmp, 'catalogs');
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
process.env.RONIN_WORKTREES_DIR = path.join(tmp, 'worktrees');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(tmp, 'rosters');

const sh = (dir: string, args: string[]) =>
  execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function makeRepo(name: string, roninRepo: string | null): Promise<string> {
  const dir = path.join(tmp, name);
  await fs.mkdir(dir, { recursive: true });
  sh(dir, ['init', '-q', '-b', 'master']);
  sh(dir, ['config', 'user.email', 'test@example.invalid']);
  sh(dir, ['config', 'user.name', 'test']);
  await fs.writeFile(path.join(dir, 'README.md'), `# ${name}\n`);
  if (roninRepo !== null) await fs.writeFile(path.join(dir, 'RONIN_REPO'), roninRepo);
  sh(dir, ['add', '-A']);
  sh(dir, ['commit', '-q', '-m', 'first']);
  sh(dir, ['branch', 'dev']);
  sh(dir, ['checkout', '-q', 'dev']);
  return dir;
}

const cowork = await makeRepo('cowork', 'mode=reviewed\nworking=dev\nstable=master\ndesks=managed\n');
const services = await makeRepo('services', 'mode=reviewed\n');
const koe = await makeRepo('koe', 'mode=direct\nstable=main\n');
const plain = await makeRepo('plain', null);

await fs.mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
await fs.writeFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), [
  '# roots', '',
  '## cowork', `- **dir:** ${cowork}`, '- **remit:** the free build', '',
  '## services', `- **dir:** ${services}`, '- **remit:** the paid layer', '',
  '## koe', `- **dir:** ${koe}`, '- **remit:** direct main', '',
  '## plain', `- **dir:** ${plain}`, '- **remit:** undeclared', '',
].join('\n'));

const { parseArrangement, arrangementOf } = await import('../src/desks/arrangement.js');
const { deriveAssignment, listDesks, readDesk, deskWorktree, candidateWorktree } = await import('../src/desks/registry.js');
const { openDesk, syncDesk, closeDesk, discardDesk, recoverDesk, parkedDesks, resolveAssignmentDesks, DeskRefused } = await import('../src/desks/desk.js');
const { handIn } = await import('../src/desks/hand-in.js');
const statusOf = async (repo: string, branch: string) => {
  const d = (await listDesks({ repo })).find((x) => x.branch === branch);
  if (!d) throw new Error(`no desk ${repo}:${branch}`);
  return d;
};
const { receiptsForLine, receiptsForDesk, acceptedSince } = await import('../src/desks/receipts.js');
const { casRef, revParse } = await import('../src/desks/git.js');
const { lockDir, withLineLock, queueHolder } = await import('../src/desks/queue.js');
const { createTeamRoster } = await import('../src/team-rosters.js');

await createTeamRoster('comp', { team_role: 'development', objective: 'desks', project_root: 'cowork', repos: ['cowork', 'services'], branch: '' });

const commitFile = async (wt: string, file: string, text: string, msg = `edit ${file}`) => {
  await fs.mkdir(path.dirname(path.join(wt, file)), { recursive: true });
  await fs.writeFile(path.join(wt, file), text);
  sh(wt, ['add', '-A']);
  sh(wt, ['commit', '-q', '-m', msg]);
  return sh(wt, ['rev-parse', 'HEAD']);
};

test('arrangement: absent RONIN_REPO is today, reviewed has defaults, bad values are refused by name', async () => {
  const absent = parseArrangement('x', '/x', null);
  assert.equal(absent.source, 'absent');
  assert.equal(absent.desks, 'none');
  const r = parseArrangement('x', '/x', 'mode=reviewed\n');
  assert.deepEqual([r.working, r.stable, r.desks, r.publish], ['dev', 'master', 'managed', ['dev', 'master']]);
  const d = parseArrangement('x', '/x', 'mode=direct\nstable=main\n');
  assert.deepEqual([d.working, d.stable, d.desks, d.publish], ['main', 'main', 'none', ['main']]);
  assert.throws(() => parseArrangement('x', '/x', 'mode=sideways\n'), /mode must be/);
  assert.equal((await arrangementOf('koe')).mode, 'direct');
  assert.equal((await arrangementOf('plain')).source, 'absent');
  await assert.rejects(arrangementOf('nope'), /no project_root named/);
});

test('deriveAssignment: the team roster names the repos; direct and undeclared repos contribute no desk', async () => {
  const a = await deriveAssignment({ session: 'fable', team: 'comp', project_root: 'cowork' });
  assert.equal(a.id, 'fable@comp');
  assert.equal(a.primary, 'cowork');
  assert.deepEqual(a.desks.map((d) => `${d.repo}:${d.branch}→${d.line}`), ['cowork:team/comp/fable→team/comp/dev', 'services:team/comp/fable→team/comp/dev']);
  const solo = await deriveAssignment({ session: 'lone', team: '', project_root: 'cowork' });
  assert.deepEqual(solo.desks.map((d) => `${d.branch}→${d.line}`), ['solo/lone→dev']);
  const none = await deriveAssignment({ session: 'k', team: '', project_root: 'koe' });
  assert.deepEqual(none.desks, []);
  assert.equal(none.primary, '');
  assert.deepEqual((await deriveAssignment({ session: 'p', team: '', project_root: 'plain' })).desks, []);
});

test('openDesk: cut from the team line, mounted, upstream set, recorded; the line itself is created and mounted', async () => {
  const st = await openDesk({ repo: 'cowork', session: 'fable', team: 'comp' });
  assert.equal(st.branch, 'team/comp/fable');
  assert.equal(st.line, 'team/comp/dev');
  assert.equal(st.mounted, true);
  assert.equal(st.worktree, deskWorktree('cowork', 'team/comp/fable'));
  assert.ok(existsSync(path.join(st.worktree, 'README.md')));
  assert.equal(sh(cowork, ['rev-parse', '--abbrev-ref', 'team/comp/fable@{upstream}']), 'team/comp/dev');
  assert.ok(existsSync(path.join(deskWorktree('cowork', 'team/comp/dev'), 'README.md')), 'the line has a mounted worktree');
  assert.equal(st.ahead, 0);
  assert.equal(st.dirty, false);
  const rec = await readDesk('cowork', 'team/comp/fable');
  assert.equal(rec?.session, 'fable');
  assert.equal(rec?.state, 'open');
  // Idempotent.
  const again = await openDesk({ repo: 'cowork', session: 'fable', team: 'comp' });
  assert.equal(again.worktree, st.worktree);
});

test('openDesk refuses: a funnel point by name, a direct repo, an undeclared repo', async () => {
  await assert.rejects(openDesk({ repo: 'cowork', session: 'x', team: 'comp', branch: 'dev' }), /reviewed integration line/);
  await assert.rejects(openDesk({ repo: 'cowork', session: 'x', team: 'comp', branch: 'team/comp/dev' }), /reviewed integration line/);
  await assert.rejects(openDesk({ repo: 'cowork', session: 'x', team: 'comp', branch: 'master' }), /reviewed integration line/);
  await assert.rejects(openDesk({ repo: 'koe', session: 'x', team: '' }), DeskRefused);
  await assert.rejects(openDesk({ repo: 'plain', session: 'x', team: '' }), /no RONIN_REPO/);
});

test('status is derived from git now: a commit makes the desk ahead, a saved file makes it dirty', async () => {
  const wt = deskWorktree('cowork', 'team/comp/fable');
  await commitFile(wt, 'a.txt', 'fable 1\n');
  let st = await statusOf('cowork', 'team/comp/fable');
  assert.equal(st.ahead, 1);
  assert.equal(st.dirty, false);
  await fs.writeFile(path.join(wt, 'scratch.txt'), 'unsaved\n');
  st = await statusOf('cowork', 'team/comp/fable');
  assert.equal(st.dirty, true);
  assert.deepEqual(st.dirty_files, ['scratch.txt']);
  await fs.unlink(path.join(wt, 'scratch.txt'));
});

test('handIn: the line advances by compare-and-swap to the candidate, its worktree fast-forwards, a receipt is appended', async () => {
  const before = sh(cowork, ['rev-parse', 'team/comp/dev']);
  const { receipt, notices } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.equal(receipt.expected_old, before);
  const after = sh(cowork, ['rev-parse', 'team/comp/dev']);
  assert.equal(receipt.line_sha, after);
  assert.notEqual(after, before);
  assert.equal(sh(deskWorktree('cowork', 'team/comp/dev'), ['rev-parse', 'HEAD']), after, 'the mounted line fast-forwarded');
  assert.ok(existsSync(path.join(deskWorktree('cowork', 'team/comp/dev'), 'a.txt')));
  assert.equal(sh(cowork, ['rev-parse', 'dev']), sh(cowork, ['rev-parse', 'master']), 'dev did not move — that is team promotion, not hand-in');
  const st = await statusOf('cowork', 'team/comp/fable');
  assert.equal(st.ahead, 0);
  assert.equal(st.last_hand_in, receipt.id);
  assert.equal(notices.find((n) => n.desk === 'team/comp/fable')?.kind, 'adopted');
  const ledger = await receiptsForLine('cowork', 'team/comp/dev');
  assert.equal(ledger.at(-1)?.id, receipt.id);
  assert.equal((await receiptsForDesk('cowork', 'team/comp/fable')).length, 1);
});

test('handIn with nothing ahead is a refusal with a receipt, and moves nothing', async () => {
  const before = sh(cowork, ['rev-parse', 'team/comp/dev']);
  const { receipt } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'refused');
  assert.match(receipt.reason, /nothing to hand in/);
  assert.equal(sh(cowork, ['rev-parse', 'team/comp/dev']), before);
});

test('downward adoption: a clean sibling takes the line now; a dirty sibling is marked pending with the overlap and is not touched', async () => {
  const clean = await openDesk({ repo: 'cowork', session: 'wispr', team: 'comp' });
  const dirty = await openDesk({ repo: 'cowork', session: 'rireki', team: 'comp' });
  assert.equal(clean.ahead, 0);
  // rireki has an unsaved edit to a.txt — the same file fable is about to change on the line.
  await fs.writeFile(path.join(dirty.worktree, 'a.txt'), 'rireki unsaved\n');
  await fs.writeFile(path.join(dirty.worktree, 'own.txt'), 'rireki own\n');
  await commitFile(deskWorktree('cowork', 'team/comp/fable'), 'a.txt', 'fable 2\n');
  await commitFile(deskWorktree('cowork', 'team/comp/fable'), 'b.txt', 'fable b\n');
  const { receipt, notices } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  const byDesk = Object.fromEntries(notices.map((n) => [n.desk, n]));
  assert.equal(byDesk['team/comp/wispr'].kind, 'adopted');
  assert.equal(byDesk['team/comp/rireki'].kind, 'pending_overlap');
  assert.deepEqual(byDesk['team/comp/rireki'].files, ['a.txt']);
  assert.equal(byDesk['team/comp/rireki'].by, 'fable');
  assert.equal((await statusOf('cowork', 'team/comp/wispr')).behind, 0);
  assert.ok(existsSync(path.join(clean.worktree, 'b.txt')), 'the clean sibling has the new file');
  const rk = await statusOf('cowork', 'team/comp/rireki');
  assert.equal(rk.behind, 2, 'the dirty sibling did not move');
  assert.equal(await fs.readFile(path.join(dirty.worktree, 'a.txt'), 'utf8'), 'rireki unsaved\n', 'its unsaved file is untouched');
  assert.ok(!existsSync(path.join(dirty.worktree, 'b.txt')));
  assert.equal(rk.pending?.line_sha, receipt.line_sha);
  assert.deepEqual(rk.pending?.overlap, ['a.txt']);
  // At its next safe boundary — here, an explicit sync after it commits — it adopts.
  sh(dirty.worktree, ['checkout', '--', 'a.txt']);
  await commitFile(dirty.worktree, 'own.txt', 'rireki own\n');
  const n = await syncDesk('cowork', 'team/comp/rireki');
  assert.equal(n.kind, 'adopted');
  const rk2 = await statusOf('cowork', 'team/comp/rireki');
  assert.equal(rk2.behind, 0);
  assert.equal(rk2.pending, null);
});

test('handIn conflict: contained in the candidate, the line untouched, the desk blocked with the files, a conflict receipt', async () => {
  const wispr = deskWorktree('cowork', 'team/comp/wispr');
  const fable = deskWorktree('cowork', 'team/comp/fable');
  await commitFile(wispr, 'c.txt', 'wispr\n');
  await commitFile(fable, 'c.txt', 'fable\n');
  assert.equal((await handIn('cowork', 'team/comp/wispr')).receipt.result, 'accepted');
  const before = sh(cowork, ['rev-parse', 'team/comp/dev']);
  const { receipt, notices } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'conflict');
  assert.deepEqual(receipt.conflict_files, ['c.txt']);
  assert.equal(receipt.expected_old, before);
  assert.equal(sh(cowork, ['rev-parse', 'team/comp/dev']), before, 'the line did not move');
  assert.deepEqual(notices, []);
  const st = await statusOf('cowork', 'team/comp/fable');
  assert.match(st.blocked, /conflicts with team\/comp\/dev on 1 file/);
  const cand = candidateWorktree('cowork', 'team/comp/dev');
  assert.equal(sh(cand, ['status', '--porcelain']), '', 'the candidate is left clean (merge aborted)');
  // The lead adjudicates: resolve in the desk, hand in again; the block clears.
  await fs.writeFile(path.join(fable, 'c.txt'), 'fable\n');
  try { sh(fable, ['merge', '--no-edit', 'team/comp/dev']); } catch { /* conflict expected */ }
  await fs.writeFile(path.join(fable, 'c.txt'), 'both\n');
  sh(fable, ['add', 'c.txt']);
  sh(fable, ['commit', '-q', '--no-edit', '-m', 'resolve c.txt']);
  const r2 = await handIn('cowork', 'team/comp/fable');
  assert.equal(r2.receipt.result, 'accepted', r2.receipt.reason);
  assert.equal((await statusOf('cowork', 'team/comp/fable')).blocked, '');
  const accepted = await acceptedSince('cowork', 'team/comp/dev', '');
  assert.ok(accepted.length >= 3);
});

test('closeDesk: unsaved files become WIP, an unintegrated tip parks (branch kept), an integrated desk is deleted; discard is explicit', async () => {
  const wispr = deskWorktree('cowork', 'team/comp/wispr');
  await syncDesk('cowork', 'team/comp/wispr');
  await fs.writeFile(path.join(wispr, 'draft.txt'), 'half done\n');
  await commitFile(wispr, 'd.txt', 'committed, not handed in\n');
  await fs.writeFile(path.join(wispr, 'draft2.txt'), 'still typing\n');
  const out = await closeDesk('cowork', 'team/comp/wispr', { unmount: true });
  assert.equal(out.action, 'parked');
  assert.ok(out.wip, 'a WIP commit captured the unsaved files');
  assert.equal(out.unmounted, true);
  assert.ok(!existsSync(wispr));
  assert.ok(sh(cowork, ['rev-parse', 'team/comp/wispr']), 'the branch is kept');
  const parked = await parkedDesks({ repo: 'cowork' });
  assert.deepEqual(parked.map((d) => [d.branch, d.session, d.mounted, d.ahead >= 2]), [['team/comp/wispr', 'wispr', false, true]]);
  // Recover: reassign to another session, remounted, WIP and commit intact.
  const back = await recoverDesk('cowork', 'team/comp/wispr', 'wispr2');
  assert.equal(back.mounted, true);
  assert.equal(back.session, 'wispr2');
  assert.equal(back.state, 'open');
  assert.ok(existsSync(path.join(back.worktree, 'draft2.txt')));
  assert.equal((await parkedDesks({ repo: 'cowork' })).length, 0);
  // Hand it in; now close deletes it because the tip is on the line.
  assert.equal((await handIn('cowork', 'team/comp/wispr')).receipt.result, 'accepted');
  const gone = await closeDesk('cowork', 'team/comp/wispr');
  assert.equal(gone.action, 'deleted');
  assert.equal(await readDesk('cowork', 'team/comp/wispr'), null);
  assert.throws(() => sh(cowork, ['rev-parse', '--verify', '-q', 'refs/heads/team/comp/wispr']));
  // Discard: the only path that deletes an unintegrated tip, and the caller asked.
  const doomed = await openDesk({ repo: 'cowork', session: 'doomed', team: 'comp' });
  await commitFile(doomed.worktree, 'never.txt', 'never handed in\n');
  await discardDesk('cowork', 'team/comp/doomed');
  assert.equal(await readDesk('cowork', 'team/comp/doomed'), null);
  assert.throws(() => sh(cowork, ['rev-parse', '--verify', '-q', 'refs/heads/team/comp/doomed']));
});

test('resolveAssignmentDesks: the launch seam opens one desk per managed repo and writes the assignment; a rōnin on a direct repo gets nothing', async () => {
  const a = await resolveAssignmentDesks({ session: 'both', team: 'comp', project_root: 'services' });
  assert.equal(a.primary, 'services');
  assert.deepEqual(a.desks.map((d) => `${d.repo}:${d.branch}`).sort(), ['cowork:team/comp/both', 'services:team/comp/both']);
  for (const d of a.desks) assert.ok(existsSync(path.join(d.worktree, 'README.md')), `${d.repo} desk is mounted`);
  assert.ok(existsSync(deskWorktree('services', 'team/comp/dev')), 'the services team line exists and is mounted');
  const all = await listDesks({ session: 'both' });
  assert.equal(all.length, 2);
  const none = await resolveAssignmentDesks({ session: 'k', team: '', project_root: 'koe' });
  assert.deepEqual(none.desks, []);
  assert.equal((await listDesks({ session: 'k' })).length, 0);
  // Two repos hand in independently: each on its own line, dev untouched in both.
  await commitFile(a.desks.find((d) => d.repo === 'services')!.worktree, 's.txt', 'services change\n');
  const r = await handIn('services', 'team/comp/both');
  assert.equal(r.receipt.result, 'accepted', r.receipt.reason);
  assert.equal(sh(services, ['rev-parse', 'dev']), sh(services, ['rev-parse', 'master']));
});

test('race: two hand-ins at once serialize on the line and both land; the ledger has both accepted, in order', async () => {
  const p = await openDesk({ repo: 'cowork', session: 'p', team: 'comp' });
  const q = await openDesk({ repo: 'cowork', session: 'q', team: 'comp' });
  await commitFile(p.worktree, 'p.txt', 'p\n');
  await commitFile(q.worktree, 'q.txt', 'q\n');
  const before = sh(cowork, ['rev-parse', 'team/comp/dev']);
  const [rp, rq] = await Promise.all([handIn('cowork', 'team/comp/p'), handIn('cowork', 'team/comp/q')]);
  assert.equal(rp.receipt.result, 'accepted', rp.receipt.reason);
  assert.equal(rq.receipt.result, 'accepted', rq.receipt.reason);
  const after = sh(cowork, ['rev-parse', 'team/comp/dev']);
  assert.notEqual(after, before);
  const lineWt = deskWorktree('cowork', 'team/comp/dev');
  assert.ok(existsSync(path.join(lineWt, 'p.txt')) && existsSync(path.join(lineWt, 'q.txt')), 'both changes are on the line');
  const second = [rp.receipt, rq.receipt].sort((x, y) => x.at.localeCompare(y.at))[1];
  assert.equal(second.expected_old, [rp.receipt, rq.receipt].find((r) => r !== second)!.line_sha, 'the second was built on the first’s result');
  assert.equal(await queueHolder('cowork', 'team/comp/dev'), null, 'the queue is released');
});

test('crash: a lock left by a dead process is reclaimed; a live holder is waited for', async () => {
  const dir = lockDir('cowork', 'team/comp/dev');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'owner'), '999999999\n2026-01-01T00:00:00Z\n');
  const ran = await withLineLock('cowork', 'team/comp/dev', async () => 'ran');
  assert.equal(ran, 'ran');
  assert.ok(!existsSync(dir));
  // A live holder (us) — a second taker waits and does not run until we let go. The
  // order is forced by explicit signals, never by the clock: a sleep-based version of
  // this failed under a loaded suite (2026-08-28) and blocked a promotion.
  let order: string[] = [];
  let acquired!: () => void;
  const held = new Promise<void>((r) => { acquired = r; });
  let release!: () => void;
  const released = new Promise<void>((r) => { release = r; });
  const holder = withLineLock('cowork', 'team/comp/dev', async () => { acquired(); await released; order.push('first'); });
  await held;
  const waiter = withLineLock('cowork', 'team/comp/dev', async () => { order.push('second'); });
  release();
  await Promise.all([holder, waiter]);
  assert.deepEqual(order, ['first', 'second']);
  await assert.rejects(
    withLineLock('cowork', 'team/comp/dev', async () => withLineLock('cowork', 'team/comp/dev', async () => 'never', 150)),
    /did not clear/,
  );
});

test('compare-and-swap: a stale expected ref never advances the line', async () => {
  const cur = await revParse(cowork, 'refs/heads/team/comp/dev');
  const older = sh(cowork, ['rev-parse', 'team/comp/dev~1']);
  assert.equal(await casRef(cowork, 'team/comp/dev', older, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), false);
  assert.equal(await revParse(cowork, 'refs/heads/team/comp/dev'), cur, 'unchanged');
  assert.equal(await casRef(cowork, 'team/comp/dev', older, cur), true);
  assert.equal(await revParse(cowork, 'refs/heads/team/comp/dev'), older);
  assert.equal(await casRef(cowork, 'team/comp/dev', cur, older), true, 'and back');
});

test('crash mid-hand-in: a candidate left behind by a crashed run is rebuilt, not reused', async () => {
  const cand = candidateWorktree('cowork', 'team/comp/dev');
  await fs.writeFile(path.join(cand, 'leftover.txt'), 'from a crashed run\n');
  const r = await openDesk({ repo: 'cowork', session: 'after', team: 'comp' });
  await commitFile(r.worktree, 'after.txt', 'after the crash\n');
  const { receipt } = await handIn('cowork', 'team/comp/after');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.ok(!existsSync(path.join(cand, 'leftover.txt')), 'the candidate was rebuilt fresh');
  assert.ok(!existsSync(path.join(deskWorktree('cowork', 'team/comp/dev'), 'leftover.txt')), 'and nothing of it reached the line');
});
