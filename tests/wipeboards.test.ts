/**
 * THE WIPEBOARD AS A TRANSPORT — the contract everything else leans on, as executable
 * assertions, in a temp store with no tmux touched.
 *
 * A wipeboard is not history (owner, 2026-08-23): a post is delivered and then reaped.
 * What that makes load-bearing is not "the file is append-only" any more — it is that a
 * post has an IDENTITY, that a read is per-session and derived from a cursor, and that
 * nothing retires a post except the two reap rules. Those are what this file pins.
 *
 * The membership half (teams, dials, notices actually landing) needs a tmux server and
 * is deliberately NOT tested here: tests never aim at the live server.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wipeboard-test-'));
process.env.RONIN_WIPEBOARDS_DIR = root;
const W = await import('../src/wipeboards.js');

/** Members as the reaper wants them: a name and the durable session key beside it. */
const members = (...names: string[]) => names.map((n) => ({ name: n, key: `${n}-1787240000` }));
const key = (n: string) => `${n}-1787240000`;

test('board names stay boring — same rules as tags, so one cleaner serves both', () => {
  assert.equal(W.isValidBoardName('ronin'), true);
  assert.equal(W.isValidBoardName('a-b_2'), true);
  assert.equal(W.isValidBoardName('Ronin'), false); // addresses people type: lowercase
  assert.equal(W.isValidBoardName(''), false);
  assert.equal(W.isValidBoardName('x'.repeat(33)), false);
});

test('ensureBoard creates once and says so — the created flag is the join-notice moment', async () => {
  assert.equal(await W.boardExists('crew'), false);
  assert.equal(await W.ensureBoard('crew', W.teamStub('crew')), true);
  assert.equal(await W.ensureBoard('crew', W.teamStub('crew')), false); // already there
  const board = await W.readBoard('crew');
  assert.match(board.brief, /crew team's wipeboard/);
  assert.match(board.brief, /membership follows the team/);
});

/* ---------------------------------------------------------------- identity and order */

test('ids are distinct and lexically ordered under concurrent writers', async () => {
  // FOUR HUNDRED, deliberately. Concurrent writers are floored to the same millisecond,
  // so an id differs from its neighbour only by two bytes of randomness — 65536 values.
  // At this width a birthday collision is near-certain, which is what makes this a test
  // of the EEXIST retry rather than a test of luck. At 200 it was a coin toss and the
  // full suite duly failed once under load (2026-08-23) while passing alone five times.
  const N = 400;
  await W.ensureBoard('rush');
  const posts = await Promise.all(
    Array.from({ length: N }, (_, i) => W.appendPost('rush', `@w${i % 8}`, `post ${i}`)),
  );
  const ids = posts.map((p) => p.id);
  assert.equal(new Set(ids).size, N, `${N} writers, ${N} distinct ids`);
  const stored = (await W.readPosts('rush')).map((p) => p.id);
  assert.deepEqual(stored, [...stored].sort(), 'lexical sort is the order on disk');
  assert.equal(stored.length, N, 'nothing was lost and nothing overwrote anything');
  // Every post is intact — a clobbered name would leave a file whose text belongs to
  // the loser, which a count alone would not catch.
  const texts = new Set((await W.readPosts('rush')).map((p) => p.text));
  assert.equal(texts.size, N, 'every distinct post body survived');
});

test('ids stay monotonic within a wipeboard even if the clock moves backwards', async () => {
  await W.ensureBoard('clock');
  const first = await W.appendPost('clock', '@a', 'before');
  const real = Date.now;
  Date.now = () => 1; // the machine's time falls off a cliff
  try {
    const second = await W.appendPost('clock', '@a', 'after');
    assert.ok(second.id > first.id, 'the floor is one past the newest already there');
  } finally {
    Date.now = real;
  }
});

test('the id is the filename, so hand-editing a post cannot move it', async () => {
  await W.ensureBoard('handedit');
  const p = await W.appendPost('handedit', '@a', 'original');
  const file = path.join(root, 'handedit', 'posts', `${p.id}.md`);
  const raw = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, raw.replace('original', 'edited by a human\nwith a second line'));
  const back = (await W.readPosts('handedit')).find((x) => x.id === p.id);
  assert.equal(back?.id, p.id);
  assert.match(back!.text, /edited by a human/);
  assert.match(back!.text, /with a second line/);
});

test('posts read back whole, in order, with their author and stamp', async () => {
  await W.ensureBoard('thread');
  await W.appendPost('thread', '@alpha', 'first');
  await W.appendPost('thread', 'user: glen', 'second\nwith a second line');
  const board = await W.readBoard('thread');
  assert.equal(board.posts.length, 2);
  assert.deepEqual(board.posts.map((p) => p.author), ['@alpha', 'user: glen']);
  assert.equal(board.posts[1].text, 'second\nwith a second line');
  assert.match(board.posts[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.match(board.posts[0].time, /^\d{2}:\d{2}$/);
});

/* ------------------------------------------------------------------ reads and cursors */

test('no cursor means has-read-nothing — a value, not a gap', async () => {
  await W.ensureBoard('fresh');
  await W.appendPost('fresh', '@a', 'one');
  await W.appendPost('fresh', '@a', 'two');
  assert.equal(await W.readCursor('fresh', key('newcomer')), null);
  const unread = await W.unreadFor('fresh', key('newcomer'), '@newcomer');
  assert.equal(unread.length, 2, 'a joining session is handed what is on the wipeboard');
});

test('checking twice: the second time there is nothing unread', async () => {
  await W.ensureBoard('twice');
  await W.appendPost('twice', '@a', 'one');
  const hw = await W.highWater('twice', key('b'));
  assert.ok(hw);
  await W.writeCursor('twice', key('b'), hw!);
  assert.equal((await W.unreadFor('twice', key('b'), '@b')).length, 0);
});

test('your own posts are never delivered back to you, and still do not stick the cursor', async () => {
  await W.ensureBoard('mine');
  await W.appendPost('mine', '@a', 'theirs');
  const own = await W.appendPost('mine', '@me', 'mine, and last');
  assert.deepEqual((await W.unreadFor('mine', key('me'), '@me')).map((p) => p.text), ['theirs']);
  // The high-water mark is everything EXAMINED. Advancing only to the last PRINTED post
  // would leave your own post ahead of the cursor and re-examine it forever.
  assert.equal(await W.highWater('mine', key('me')), own.id);
});

test('a corrupt cursor reads as nothing-read, never as all-read', async () => {
  await W.ensureBoard('corrupt');
  await W.appendPost('corrupt', '@a', 'one');
  await fs.mkdir(path.join(root, 'corrupt', 'read'), { recursive: true });
  await fs.writeFile(path.join(root, 'corrupt', 'read', key('b')), 'garbage not an id\n');
  assert.equal(await W.readCursor('corrupt', key('b')), null);
  assert.equal((await W.unreadFor('corrupt', key('b'), '@b')).length, 1);
});

test('one session\'s cursor is its own — five members, five reads, derived', async () => {
  await W.ensureBoard('five');
  const p = await W.appendPost('five', 'user: glen', 'the owner\'s line');
  const names = ['a', 'b', 'c', 'd', 'e'];
  const readCount = async () => {
    const cursors = await W.allCursors('five');
    return names.filter((n) => (cursors[key(n)] ?? '') >= p.id).length;
  };
  assert.equal(await readCount(), 0);
  for (const [i, n] of names.entries()) {
    await W.writeCursor('five', key(n), p.id);
    assert.equal(await readCount(), i + 1, `${i + 1} sessions have read it`);
    // and nobody else's cursor moved
    const cursors = await W.allCursors('five');
    assert.equal(Object.keys(cursors).length, i + 1);
  }
});

/* -------------------------------------------------------------------- addressed posts */

test('an addressed post names its audience in the header, and reads back', async () => {
  await W.ensureBoard('aimed');
  const p = await W.appendPost('aimed', '@a', 'for you two', { to: ['@b', 'c'] });
  const raw = await fs.readFile(path.join(root, 'aimed', 'posts', `${p.id}.md`), 'utf8');
  assert.match(raw, /^### @a → @b, @c · /, 'a human reading the thread sees who it was for');
  const back = (await W.readPosts('aimed'))[0];
  assert.deepEqual(back.to, ['@b', '@c']);
  assert.equal(back.author, '@a');
  assert.equal(back.silent, false);
  assert.equal(back.text, 'for you two');
});

test('--to none is recorded as (no notice) and reads back silent', async () => {
  await W.ensureBoard('quiet');
  const p = await W.appendPost('quiet', '@a', 'parked for whoever picks this up', { silent: true });
  const raw = await fs.readFile(path.join(root, 'quiet', 'posts', `${p.id}.md`), 'utf8');
  assert.match(raw, /^### @a → \(no notice\) · /);
  const back = (await W.readPosts('quiet'))[0];
  assert.equal(back.silent, true);
  assert.deepEqual(back.to, []);
});

test('an unparseable audience means EVERYONE, never nobody', async () => {
  await W.ensureBoard('mangled');
  const p = await W.appendPost('mangled', '@a', 'text');
  const file = path.join(root, 'mangled', 'posts', `${p.id}.md`);
  await fs.writeFile(file, '### something a human typed by hand\ntext\n');
  const back = (await W.readPosts('mangled'))[0];
  assert.equal(back.silent, false, 'a post that loses its audience must not go silent');
  assert.deepEqual(back.to, []);
  assert.equal(back.author, 'unknown', 'we do not know who wrote it, and we do not guess');
  // NOTHING IS DROPPED. A header we cannot parse stays in the text, where a human can
  // see exactly what they typed — losing the line is the failure the forgiving rule
  // exists to prevent, and it is worse than an ugly post.
  assert.match(back.text, /something a human typed by hand/);
  assert.match(back.text, /text/);
  assert.equal(back.id, p.id, 'and it keeps its identity and its place in the order');
});

test('required readers: addressees if named, everyone otherwise, nobody when silent', () => {
  const live = ['a', 'b', 'c'];
  const post = (over: Partial<import('../src/wipeboards.js').Post>) =>
    ({ id: '0', author: '@a', time: '', at: '', to: [], silent: false, text: '', ...over }) as import('../src/wipeboards.js').Post;
  assert.deepEqual(W.requiredReaders(post({}), live), ['b', 'c'], 'open: everyone but the author');
  assert.deepEqual(W.requiredReaders(post({ to: ['@b'] }), live), ['b'], 'addressed: just them');
  assert.equal(W.requiredReaders(post({ silent: true }), live), null, 'silent: nothing can retire it by reading');
  assert.deepEqual(W.requiredReaders(post({ to: ['@gone'] }), live), [], 'addressees that left');
});

/* --------------------------------------------------------------------------- reaping */

const HOUR = 60 * 60 * 1000;

test('read-reap: every required reader past it, and the grace elapsed', async () => {
  await W.ensureBoard('reap1');
  const p = await W.appendPost('reap1', '@a', 'delivered');
  const crew = members('a', 'b', 'c');
  await W.writeCursor('reap1', key('b'), p.id);
  await W.writeCursor('reap1', key('c'), p.id);
  // inside the grace: kept, so a member mid-turn still finds it
  assert.deepEqual(await W.reapPosts('reap1', { members: crew, now: Date.now() + 5 * 60_000 }), []);
  // past the grace: gone
  assert.deepEqual(await W.reapPosts('reap1', { members: crew, now: Date.now() + 2 * HOUR }), [p.id]);
  assert.equal((await W.readPosts('reap1')).length, 0);
});

test('one required reader behind holds it — until the TTL, which is the backstop', async () => {
  await W.ensureBoard('reap2');
  const p = await W.appendPost('reap2', '@a', 'unread by c');
  const crew = members('a', 'b', 'c');
  await W.writeCursor('reap2', key('b'), p.id);
  assert.deepEqual(await W.reapPosts('reap2', { members: crew, now: Date.now() + 2 * HOUR }), []);
  assert.deepEqual(await W.reapPosts('reap2', { members: crew, now: Date.now() + 49 * HOUR }), [p.id]);
});

test('a live member that never checks holds a post only until the TTL', async () => {
  await W.ensureBoard('reap3');
  const p = await W.appendPost('reap3', '@a', 'nobody checked');
  const crew = members('a', 'idle');
  assert.deepEqual(await W.reapPosts('reap3', { members: crew, now: Date.now() + 10 * HOUR }), []);
  assert.deepEqual(await W.reapPosts('reap3', { members: crew, now: Date.now() + 49 * HOUR }), [p.id]);
});

test('an addressed post reaps on its addressees, with a non-addressee still behind it', async () => {
  await W.ensureBoard('reap4');
  const p = await W.appendPost('reap4', '@a', 'for b only', { to: ['@b'] });
  const crew = members('a', 'b', 'c'); // c never reads it, and must not hold it
  await W.writeCursor('reap4', key('b'), p.id);
  assert.deepEqual(await W.reapPosts('reap4', { members: crew, now: Date.now() + 2 * HOUR }), [p.id]);
});

test('a silent post is held by the TTL alone — no read can retire it', async () => {
  await W.ensureBoard('reap5');
  const p = await W.appendPost('reap5', '@a', 'parked', { silent: true });
  const crew = members('a', 'b');
  await W.writeCursor('reap5', key('b'), p.id);
  assert.deepEqual(await W.reapPosts('reap5', { members: crew, now: Date.now() + 5 * HOUR }), []);
  assert.deepEqual(await W.reapPosts('reap5', { members: crew, now: Date.now() + 49 * HOUR }), [p.id]);
});

test('a dead session holds nothing back, and its cursor is swept', async () => {
  await W.ensureBoard('reap6');
  const p = await W.appendPost('reap6', '@a', 'one');
  await W.writeCursor('reap6', key('ghost'), '0000000000000-0000'); // behind the post
  await W.writeCursor('reap6', key('b'), p.id);
  const reaped = await W.reapPosts('reap6', { members: members('a', 'b'), now: Date.now() + 2 * HOUR });
  assert.deepEqual(reaped, [p.id], 'the ghost did not hold it');
  assert.deepEqual(Object.keys(await W.allCursors('reap6')), [key('b')], 'and was swept');
});

test('ttl 0 means never reap on age, while read-reap still runs', async () => {
  await W.ensureBoard('reap7');
  const p = await W.appendPost('reap7', '@a', 'kept by the override');
  const crew = members('a', 'b');
  assert.deepEqual(await W.reapPosts('reap7', { members: crew, ttlMs: 0, now: Date.now() + 500 * HOUR }), []);
  await W.writeCursor('reap7', key('b'), p.id);
  assert.deepEqual(await W.reapPosts('reap7', { members: crew, ttlMs: 0, now: Date.now() + 2 * HOUR }), [p.id]);
});

test('the Brief is never reaped by the post rule', async () => {
  await W.ensureBoard('reap8');
  await W.setBrief('reap8', 'what this is for');
  const p = await W.appendPost('reap8', '@a', 'x');
  await W.writeCursor('reap8', key('b'), p.id);
  await W.reapPosts('reap8', { members: members('a', 'b'), now: Date.now() + 2 * HOUR });
  assert.equal((await W.readBoard('reap8')).brief, 'what this is for');
});

/* ------------------------------------------------------------------------- lifecycle */

const dead = { teamMembers: [], enrolled: [], rosterPointsAtIt: false };

test('a wipeboard nothing points at is removed whole', async () => {
  await W.ensureBoard('goneteam', W.teamStub('goneteam'));
  assert.equal(await W.reapBoard('goneteam', dead), true);
  assert.equal(await W.boardExists('goneteam'), false);
});

test('a Brief the owner wrote keeps the wipeboard, permanently', async () => {
  await W.ensureBoard('authored', W.teamStub('authored'));
  await W.setBrief('authored', 'the owner cared enough to write this');
  assert.equal(await W.reapBoard('authored', dead), false);
  assert.equal(await W.boardExists('authored'), true);
});

test('a roster still pointing at it keeps it — archived teams are a normal state', async () => {
  await W.ensureBoard('archived', W.teamStub('archived'));
  assert.equal(await W.reapBoard('archived', { ...dead, rosterPointsAtIt: true }), false);
  assert.equal(await W.boardExists('archived'), true);
});

test('live members keep it, whether by team or by enrolment', async () => {
  await W.ensureBoard('busy', W.teamStub('busy'));
  assert.equal(await W.reapBoard('busy', { ...dead, teamMembers: ['a'] }), false);
  assert.equal(await W.reapBoard('busy', { ...dead, enrolled: ['a'] }), false);
  assert.equal(await W.boardExists('busy'), true);
});

test('posts still on it keep it — it is emptied before it is removed', async () => {
  await W.ensureBoard('talking', W.teamStub('talking'));
  await W.appendPost('talking', '@a', 'still here');
  assert.equal(await W.reapBoard('talking', dead), false);
});

test('the house wipeboard is never removed', async () => {
  await W.seedHouseBoard();
  assert.equal(await W.reapBoard('house', dead), false);
  assert.equal(await W.boardExists('house'), true);
});

/* -------------------------------------------------------------------- writes are safe */

test('writing the Brief cannot lose a post — the Brief is not in the thread any more', async () => {
  await W.ensureBoard('race');
  const briefs = ['rewritten under a hundred concurrent posts', 'and again'];
  await Promise.all([
    ...Array.from({ length: 100 }, (_, i) => W.appendPost('race', '@a', `post ${i}`)),
    ...briefs.map((b) => W.setBrief('race', b)),
  ]);
  const board = await W.readBoard('race');
  // THE CONTRACT: rewriting the Brief cannot cost a post. It used to be able to — the
  // Brief lived in the same file as the thread and was written whole.
  assert.equal(board.posts.length, 100, 'every post survived the Brief rewrites');
  // And the contract stops there. Two Brief writes racing have NO ordering between them,
  // so which one wins is not a promise this module makes; what IS promised is that the
  // winner is whole. Asserting a winner asserted an ordering concurrency never offered,
  // and duly failed about one run in eight.
  assert.ok(briefs.includes(board.brief), `the Brief is one whole value, not a torn mix: ${board.brief}`);
});

test('no partial post is ever observable — temp files are never listed as posts', async () => {
  await W.ensureBoard('atomic');
  await fs.writeFile(path.join(root, 'atomic', 'posts', '.tmp-halfwritten'), '### @a · x');
  await W.appendPost('atomic', '@a', 'real');
  const posts = await W.readPosts('atomic');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, 'real');
});

/* ----------------------------------------------------------------------- the notices */

test('every notice points at the one action and names no path to carry', () => {
  const all = [
    W.joinNotice('crew', 'ignored', ['@a']),
    W.leaveNotice('crew', 'ignored'),
    W.teamJoinNotice('crew', 'ignored', ['@a']),
    W.teamLeaveNotice('crew', 'ignored'),
    W.postNotice('crew', '@a'),
  ];
  for (const n of all) {
    assert.ok(!n.includes('/'), `a notice carries no path: ${n}`);
    assert.ok(!/\breply\b|acknowledg/i.test(n), `a notice never asks for a reply: ${n}`);
  }
  for (const n of all.filter((x) => !/removed|left/.test(x))) {
    assert.match(n, /Run: tejun-wipeboard/, 'the one action, bare');
  }
  assert.match(W.postNotice('crew', '@a'), /not the owner/, 'the watermark stays');
});

test('legacy single-file wipeboards are ignored, never read, never listed', async () => {
  await fs.writeFile(path.join(root, 'legacy.md'), '# wipeboard: legacy\n\n### @a · 09:00\nold\n');
  const listed = await W.listBoardFiles();
  assert.ok(!listed.includes('legacy'), 'a fresh start does not resurrect the old format');
  assert.equal(await W.boardExists('legacy'), false);
  // and the owner's file is still on disk — removing it is their own rm
  assert.ok((await fs.stat(path.join(root, 'legacy.md'))).isFile());
});
