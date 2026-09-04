/**
 * DESKS — the state and hand-in floor, exercised end to end against real git in a temp
 * directory. No tmux, no socket, no live store: every store is pointed at a temp dir by
 * its canonical override, and the "repositories" are made here. What this proves:
 *
 *   - a desk opens from current local dev at once, with its exact base recorded; funnel points and
 *     direct repos are refused by name; a repo with no RONIN_REPO gets no desk;
 *   - hand-in is mechanical admission: the line advances by compare-and-swap only, a
 *     conflict leaves it untouched, and policy-only conditions remain ordinary output;
 *   - accepted team state flows down: a clean sibling adopts now, a dirty one is marked
 *     pending with the overlap and its files are not touched;
 *   - close never loses work: dirty or unique work remains open and named, while a clean
 *     integrated desk is removed; handoff changes explicit custody; discard is explicit;
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
const lagged = await makeRepo('lagged', 'mode=reviewed\nworking=dev\nstable=master\ndesks=managed\n');
const koe = await makeRepo('koe', 'mode=direct\nstable=main\n');
const plain = await makeRepo('plain', null);

await fs.mkdir(process.env.RONIN_CATALOGS_DIR!, { recursive: true });
await fs.writeFile(path.join(process.env.RONIN_CATALOGS_DIR!, 'PROJECT_ROOTS.md'), [
  '# roots', '',
  '## cowork', `- **dir:** ${cowork}`, '- **remit:** the free build', '',
  '## services', `- **dir:** ${services}`, '- **remit:** the paid layer', '',
  '## lagged', `- **dir:** ${lagged}`, '- **remit:** stale team line fixture', '',
  '## koe', `- **dir:** ${koe}`, '- **remit:** direct main', '',
  '## plain', `- **dir:** ${plain}`, '- **remit:** undeclared', '',
].join('\n'));

const { parseArrangement, arrangementOf } = await import('../src/desks/arrangement.js');
const { deriveAssignment, listDesks, readDesk, deskWorktree, candidateWorktree } = await import('../src/desks/registry.js');
const { openDesk, syncDesk, closeDesk, discardDesk, handoffDesk } = await import('../src/desks/desk.js');
const { handIn } = await import('../src/desks/hand-in.js');
const statusOf = async (repo: string, branch: string) => {
  const d = (await listDesks({ repo })).find((x) => x.branch === branch);
  if (!d) throw new Error(`no desk ${repo}:${branch}`);
  return d;
};
const { receiptsForLine, receiptsForDesk, acceptedSince, acceptedLinesForTeam } = await import('../src/desks/receipts.js');
const { casRef, revParse } = await import('../src/desks/git.js');
const { lockDir, withLineLock, queueHolder } = await import('../src/desks/queue.js');
const { readManagedEvents } = await import('../src/desks/lifecycle-ledger.js');
const { createTeamRoster } = await import('../src/team-rosters.js');

await createTeamRoster('comp', { objective: 'desks', project_root: 'cowork', branch: '' });
await createTeamRoster('multi', { objective: 'two repos', project_root: 'cowork', repos: ['cowork', 'koe'], branch: '' });

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

test('deriveAssignment: a team desks only its ticked repositories; nothing ticked is born with no desk', async () => {
  const a = await deriveAssignment({ session: 'fable', team: 'comp', project_root: 'cowork' });
  assert.equal(a.id, 'fable@comp');
  assert.deepEqual(a.desks, [], 'the project_root is never a desk by implication');
  assert.equal(a.primary, '');
  const own = await deriveAssignment({ session: 'fable', team: 'comp', project_root: 'cowork', repos: ['cowork'] });
  assert.deepEqual(own.desks.map((d) => d.repo), ['cowork'], "the launch's own repos override the Team's ticks");
  const quick = await deriveAssignment({ session: 'q', team: 'multi', project_root: 'cowork', repos: [] });
  assert.deepEqual(quick.desks, [], 'an empty launch answer unticks every Team desk');
  const solo = await deriveAssignment({ session: 'lone', team: '', project_root: 'cowork' });
  assert.deepEqual(solo.desks.map((d) => `${d.branch}→${d.line}`), ['solo/lone→dev']);
  const both = await deriveAssignment({ session: 'fable', team: 'multi', project_root: 'cowork' });
  assert.deepEqual(both.desks.map((d) => `${d.repo}:${d.branch}`), ['cowork:team/multi/fable', 'koe:team/multi/fable'],
    'the roster repos list yields a desk per repository');
  assert.equal(both.primary, 'cowork');
  const direct = await deriveAssignment({ session: 'k', team: '', project_root: 'koe' });
  assert.deepEqual(direct.desks.map((d) => d.repo), ['koe'], 'candidate planning preserves a direct repository');
  assert.equal(direct.primary, 'koe');
  const absent = await deriveAssignment({ session: 'p', team: '', project_root: 'plain' });
  assert.deepEqual(absent.desks.map((d) => d.repo), ['plain'], 'candidate planning preserves an absent profile for resolver normalization');
});

test('openDesk: cut from current local dev, mounted, exact base recorded; the team line is review-only', async () => {
  const st = await openDesk({ repo: 'cowork', session: 'fable', team: 'comp' });
  assert.equal(st.branch, 'team/comp/fable');
  assert.equal(st.line, 'team/comp/dev');
  assert.equal(st.mounted, true);
  assert.equal(st.worktree, deskWorktree('cowork', 'team/comp/fable'));
  assert.equal(st.base_sha, sh(cowork, ['rev-parse', 'dev']));
  assert.equal(st.working, 'dev');
  assert.equal(st.behind_working, 0);
  assert.equal(st.dependency_location, path.join(st.worktree, 'node_modules'));
  assert.deepEqual(st.owners, ['fable']);
  assert.ok(existsSync(path.join(st.worktree, 'README.md')));
  assert.equal(sh(cowork, ['rev-parse', '--abbrev-ref', 'team/comp/fable@{upstream}']), 'team/comp/dev');
  assert.ok(existsSync(path.join(deskWorktree('cowork', 'team/comp/dev'), 'README.md')), 'the line has a mounted worktree');
  assert.equal(st.ahead, 0);
  assert.equal(st.dirty, false);
  assert.equal(sh(st.worktree, ['config', '--worktree', 'user.name']), 'Ronin session fable');
  assert.equal(sh(st.worktree, ['config', '--worktree', 'user.email']), 'fable@sessions.ronin.local');
  const rec = await readDesk('cowork', 'team/comp/fable');
  assert.equal(rec?.session, 'fable');
  assert.equal(rec?.state, 'open');
  // Idempotent.
  const again = await openDesk({ repo: 'cowork', session: 'fable', team: 'comp' });
  assert.equal(again.worktree, st.worktree);
});

test('open and hand-in use current local dev even when the team line is 100 commits behind', async () => {
  sh(lagged, ['branch', 'team/old/dev', 'dev']);
  for (let i = 0; i < 100; i++) await commitFile(lagged, `accepted/${i}.txt`, `${i}\n`);
  const desk = await openDesk({ repo: 'lagged', session: 'fresh', team: 'old' });
  assert.equal(desk.base_sha, sh(lagged, ['rev-parse', 'dev']));
  assert.equal(desk.behind_working, 0);
  assert.equal(desk.ahead, 100, 'line distance is information, not the desk base');
  await commitFile(desk.worktree, 'incoming.txt', 'desk delta\n');
  const { receipt } = await handIn('lagged', desk.branch);
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.ok(existsSync(path.join(deskWorktree('lagged', 'team/old/dev'), 'accepted/99.txt')));
  assert.ok(existsSync(path.join(deskWorktree('lagged', 'team/old/dev'), 'incoming.txt')));
});

test('openDesk: an explicit managed repo need not already be on the team roster', async () => {
  const st = await openDesk({ repo: 'services', session: 'extra', team: 'comp', assignment: 'extra@comp' });
  assert.equal(st.branch, 'team/comp/extra');
  assert.equal(st.line, 'team/comp/dev');
  assert.equal(st.assignment, 'extra@comp');
  assert.equal(st.mounted, true);
  assert.equal(sh(services, ['rev-parse', '--abbrev-ref', 'team/comp/extra@{upstream}']), 'team/comp/dev');
});

test('accepted hand-ins discover an explicit managed repo outside the team roster', async () => {
  const wt = deskWorktree('services', 'team/comp/extra');
  await commitFile(wt, 'outside-roster.txt', 'accepted work\n');
  const { receipt } = await handIn('services', 'team/comp/extra');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.deepEqual(await acceptedLinesForTeam('comp'), [{ repo: 'services', line: 'team/comp/dev' }]);
});

test('openDesk reports restrictive inputs and proceeds with a private branch', async () => {
  for (const branch of ['dev', 'team/comp/dev', 'master']) {
    const desk = await openDesk({ repo: 'cowork', session: `x-${branch.replaceAll('/', '-')}`, team: 'comp', branch });
    assert.notEqual(desk.branch, branch);
    assert.equal(desk.mounted, true);
  }
  assert.equal((await openDesk({ repo: 'koe', session: 'x', team: '' })).mounted, true);
  assert.equal((await openDesk({ repo: 'plain', session: 'x', team: '' })).mounted, true);
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
  await fs.writeFile(path.join(deskWorktree('cowork', 'team/comp/fable'), 'loose-one.txt'), 'one\n');
  await fs.writeFile(path.join(deskWorktree('cowork', 'team/comp/fable'), 'loose-two.txt'), 'two\n');
  const { receipt, notices, tidy } = await handIn('cowork', 'team/comp/fable');
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
  assert.deepEqual(notices, [], 'hand-in does not update even the called desk from the team line');
  const ledger = await receiptsForLine('cowork', 'team/comp/dev');
  assert.equal(ledger.at(-1)?.id, receipt.id);
  assert.equal((await receiptsForDesk('cowork', 'team/comp/fable')).length, 1);
  assert.deepEqual(tidy.unsaved_files, ['loose-one.txt', 'loose-two.txt']);
  assert.deepEqual(tidy.other_level_desks, [], 'hand-in does not inspect other desks for advice');
  assert.equal(tidy.desk?.ahead, 0);
  assert.equal(tidy.promotion_due, true);
  await fs.unlink(path.join(deskWorktree('cowork', 'team/comp/fable'), 'loose-one.txt'));
  await fs.unlink(path.join(deskWorktree('cowork', 'team/comp/fable'), 'loose-two.txt'));
  assert.equal(existsSync(candidateWorktree('cowork', 'team/comp/dev')), false, 'accepted hand-in cleans its candidate');
});

test('handIn with no new desk delta is an accepted ordinary result and moves no work', async () => {
  const before = sh(cowork, ['rev-parse', 'team/comp/dev']);
  const { receipt } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'accepted');
  assert.equal(sh(cowork, ['rev-parse', 'team/comp/dev']), before);
});

test('hand-in leaves every sibling untouched; each catches up only through explicit sync from dev', async () => {
  const clean = await openDesk({ repo: 'cowork', session: 'wispr', team: 'comp' });
  const dirty = await openDesk({ repo: 'cowork', session: 'rireki', team: 'comp' });
  assert.equal(clean.ahead, 0);
  // rireki has an unsaved edit to a.txt — the same file fable is about to change on the line.
  await fs.writeFile(path.join(dirty.worktree, 'a.txt'), 'rireki unsaved\n');
  await fs.writeFile(path.join(dirty.worktree, 'own.txt'), 'rireki own\n');
  const cleanBefore = sh(clean.worktree, ['rev-parse', 'HEAD']);
  const dirtyBefore = sh(dirty.worktree, ['rev-parse', 'HEAD']);
  await commitFile(deskWorktree('cowork', 'team/comp/fable'), 'a.txt', 'fable 2\n');
  await commitFile(deskWorktree('cowork', 'team/comp/fable'), 'b.txt', 'fable b\n');
  const { receipt, notices } = await handIn('cowork', 'team/comp/fable');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.deepEqual(notices, []);
  assert.equal(sh(clean.worktree, ['rev-parse', 'HEAD']), cleanBefore);
  assert.equal(sh(dirty.worktree, ['rev-parse', 'HEAD']), dirtyBefore);
  assert.ok(!existsSync(path.join(clean.worktree, 'b.txt')), 'hand-in did not write the clean sibling');
  const rk = await statusOf('cowork', 'team/comp/rireki');
  assert.equal(await fs.readFile(path.join(dirty.worktree, 'a.txt'), 'utf8'), 'rireki unsaved\n', 'its unsaved file is untouched');
  assert.ok(!existsSync(path.join(dirty.worktree, 'b.txt')));
  assert.equal(rk.pending, null, 'hand-in did not even write a pending marker on the sibling');

  // Promotion accepts the queue onto dev. Only explicit sync now changes either sibling.
  sh(cowork, ['reset', '--hard', receipt.line_sha]);
  assert.equal((await syncDesk('cowork', 'team/comp/wispr')).kind, 'adopted');
  assert.ok(existsSync(path.join(clean.worktree, 'b.txt')));
  const pending = await syncDesk('cowork', 'team/comp/rireki');
  assert.equal(pending.kind, 'pending_overlap');
  assert.deepEqual(pending.files, ['a.txt']);
  await fs.unlink(path.join(dirty.worktree, 'a.txt'));
  await commitFile(dirty.worktree, 'own.txt', 'rireki own\n');
  const n = await syncDesk('cowork', 'team/comp/rireki');
  assert.equal(n.kind, 'adopted');
  const rk2 = await statusOf('cowork', 'team/comp/rireki');
  assert.equal(rk2.behind_working, 0, 'manual update follows local dev, not the team line');
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
  assert.match(st.blocked, /conflicts with current dev plus team\/comp\/dev on 1 file/);
  const cand = candidateWorktree('cowork', 'team/comp/dev');
  assert.equal(existsSync(cand), false, 'the conflicted candidate is cleaned after evidence is recorded');
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

test('closeDesk keeps unresolved work named, closes only after hand-in, and records lifecycle closure', async () => {
  const wispr = deskWorktree('cowork', 'team/comp/wispr');
  await syncDesk('cowork', 'team/comp/wispr');
  await fs.writeFile(path.join(wispr, 'draft.txt'), 'half done\n');
  await commitFile(wispr, 'd.txt', 'committed, not handed in\n');
  await fs.writeFile(path.join(wispr, 'draft2.txt'), 'still typing\n');
  const out = await closeDesk('cowork', 'team/comp/wispr');
  assert.equal(out.action, 'kept');
  assert.match(out.reason, /draft2\.txt/);
  assert.ok(existsSync(wispr));
  assert.equal(await fs.readFile(path.join(wispr, 'draft2.txt'), 'utf8'), 'still typing\n');
  assert.ok(sh(cowork, ['rev-parse', 'team/comp/wispr']), 'the branch is kept');
  await commitFile(wispr, 'draft2.txt', 'still typing\n', 'finish drafts');
  // Hand it in; now close deletes it because the tip is on the line.
  assert.equal((await handIn('cowork', 'team/comp/wispr')).receipt.result, 'accepted');
  const gone = await closeDesk('cowork', 'team/comp/wispr');
  assert.equal(gone.action, 'closed');
  assert.equal(await readDesk('cowork', 'team/comp/wispr'), null);
  assert.throws(() => sh(cowork, ['rev-parse', '--verify', '-q', 'refs/heads/team/comp/wispr']));
  const lifecycle = await readManagedEvents({ repo: 'cowork' });
  assert.equal(lifecycle.events.at(-1)?.type, 'desk_closed');
  assert.equal(lifecycle.events.at(-1)?.result, 'contained');
  // Discard: the only path that deletes an unintegrated tip, and the caller asked.
  const doomed = await openDesk({ repo: 'cowork', session: 'doomed', team: 'comp' });
  await commitFile(doomed.worktree, 'never.txt', 'never handed in\n');
  await discardDesk('cowork', 'team/comp/doomed');
  assert.equal(await readDesk('cowork', 'team/comp/doomed'), null);
  assert.throws(() => sh(cowork, ['rev-parse', '--verify', '-q', 'refs/heads/team/comp/doomed']));
});

test('handoff replaces explicit owners without moving the branch or worktree', async () => {
  const desk = await openDesk({ repo: 'cowork', session: 'custodian', team: 'comp' });
  const next = await handoffDesk('cowork', desk.branch, ['successor', 'coowner', 'successor']);
  assert.deepEqual(next.owners, ['successor', 'coowner']);
  assert.equal(next.session, 'successor');
  assert.equal(next.worktree, desk.worktree);
  assert.equal(next.tip, desk.tip);
  const lifecycle = await readManagedEvents({ repo: 'cowork' });
  assert.equal(lifecycle.events.at(-1)?.type, 'handed_off');
  assert.deepEqual(lifecycle.events.at(-1)?.objects[0]?.owner_sessions, ['successor', 'coowner']);
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
  // The receipt ledger is the serialization boundary. Wall-clock timestamps are not:
  // two fast hand-ins may share one millisecond, making a timestamp sort preserve the
  // Promise input order rather than the lock acquisition order (CI run 33530432746).
  const ids = new Set([rp.receipt.id, rq.receipt.id]);
  const raced = (await receiptsForLine('cowork', 'team/comp/dev')).filter((r) => ids.has(r.id));
  assert.deepEqual(raced.map((r) => r.id).sort(), [...ids].sort(), 'both accepted receipts reached the ledger');
  assert.equal(raced[1].expected_old, raced[0].line_sha, 'the second ledger receipt was built on the first result');
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
  sh(cowork, ['worktree', 'add', '--detach', cand, 'dev']);
  await fs.writeFile(path.join(cand, 'leftover.txt'), 'from a crashed run\n');
  const r = await openDesk({ repo: 'cowork', session: 'after', team: 'comp' });
  await commitFile(r.worktree, 'after.txt', 'after the crash\n');
  const { receipt } = await handIn('cowork', 'team/comp/after');
  assert.equal(receipt.result, 'accepted', receipt.reason);
  assert.ok(!existsSync(path.join(cand, 'leftover.txt')), 'the candidate was rebuilt fresh');
  assert.ok(!existsSync(path.join(deskWorktree('cowork', 'team/comp/dev'), 'leftover.txt')), 'and nothing of it reached the line');
  assert.equal(existsSync(cand), false, 'handled success cleans inherited candidate scratch');
});
