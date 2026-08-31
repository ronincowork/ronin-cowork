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


/* --------------------------------------------------------------------------- reaping */

const HOUR = 60 * 60 * 1000;

/**
 * ONE RULE: the TTL (owner, 2026-08-25). Read-reaping was dropped — a board everyone
 * else had read looked empty to the one person who had not, and scroll-back died with
 * it. Every post now lives its 48 hours whoever read it; cursors serve delivery only.
 */
test('a post outlives being read by everyone — only the TTL retires it', async () => {
  await W.ensureBoard('reap1');
  const p = await W.appendPost('reap1', '@a', 'read by all, still on the board');
  const crew = members('a', 'b', 'c');
  await W.writeCursor('reap1', key('b'), p.id);
  await W.writeCursor('reap1', key('c'), p.id);
  assert.deepEqual(await W.reapPosts('reap1', { members: crew, now: Date.now() + 47 * HOUR }), [],
    'fully read and hours old — kept, so latecomers can scroll back');
  assert.deepEqual(await W.reapPosts('reap1', { members: crew, now: Date.now() + 49 * HOUR }), [p.id],
    'the TTL, and nothing else, retires it');
});

test('addressed and silent posts ride the same single clock', async () => {
  await W.ensureBoard('reap2');
  const aimed = await W.appendPost('reap2', '@a', 'for b', { to: ['@b'] });
  const parked = await W.appendPost('reap2', '@a', 'parked', { silent: true });
  const crew = members('a', 'b');
  await W.writeCursor('reap2', key('b'), parked.id); // b has read everything
  assert.deepEqual(await W.reapPosts('reap2', { members: crew, now: Date.now() + 2 * HOUR }), []);
  const gone = await W.reapPosts('reap2', { members: crew, now: Date.now() + 49 * HOUR });
  assert.deepEqual(gone.sort(), [aimed.id, parked.id].sort());
});

test('a dead session holds nothing and its cursor is swept', async () => {
  await W.ensureBoard('reap3');
  const p = await W.appendPost('reap3', '@a', 'one');
  await W.writeCursor('reap3', key('ghost'), p.id);
  await W.writeCursor('reap3', key('b'), p.id);
  await W.reapPosts('reap3', { members: members('a', 'b'), now: Date.now() });
  assert.deepEqual(Object.keys(await W.allCursors('reap3')), [key('b')], 'the ghost was swept');
});

test('ttl 0 means never reap on age — the owner\'s off switch', async () => {
  await W.ensureBoard('reap4');
  await W.appendPost('reap4', '@a', 'kept forever by the override');
  assert.deepEqual(await W.reapPosts('reap4', { members: members('a'), ttlMs: 0, now: Date.now() + 500 * HOUR }), []);
});

test('the Brief is never reaped', async () => {
  await W.ensureBoard('reap5');
  await W.setBrief('reap5', 'what this is for');
  await W.appendPost('reap5', '@a', 'x');
  await W.reapPosts('reap5', { members: members('a'), now: Date.now() + 49 * HOUR });
  assert.equal((await W.readBoard('reap5')).brief, 'what this is for');
  assert.equal((await W.readPosts('reap5')).length, 0, 'the post aged out, the Brief stayed');
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
  // Only the team notices remain — custom enrolment is cut (owner, 2026-08-24).
  const all = [
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

/* --------------------------------------------- the roster's wipeboard id is the identity */

/**
 * "Every team roster should have a whiteboard ID, and that whiteboard ID should match
 * with a single whiteboard. I don't care what the names are." (owner, 2026-08-23)
 *
 * These need a team_rosters store, so they set one up beside the wipeboards store.
 */
const rosterStore = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-rosters-test-'));
process.env.RONIN_TEAM_ROSTERS_DIR = rosterStore;

const writeRoster = (team: string, wipeboard: string) =>
  fs.writeFile(
    path.join(rosterStore, `${team}.md`),
    `# ${team}\n\n- **objective:** x\n- **wipeboard:** ${wipeboard}\n- **state:** active\n`,
  );

test('a roster names its wipeboard by id, and the id need not be the team name', async () => {
  await writeRoster('alpha', 'shared-notes');
  assert.equal(await W.boardOfTeam('alpha'), 'shared-notes');
  assert.equal(await W.teamOfBoard('shared-notes'), 'alpha');
});

test('a team with no roster still talks on a wipeboard of its own name', async () => {
  assert.equal(await W.boardOfTeam('tagonly'), 'tagonly', 'no roster, no id — its own name');
  assert.equal(await W.teamOfBoard('tagonly'), null, 'and nothing claims it');
});

test('a roster implies its wipeboard — it is made if it does not exist, and opens empty', async () => {
  await writeRoster('beta', 'beta-talk');
  assert.equal(await W.boardExists('beta-talk'), false);
  const id = await W.ensureRosterBoard('beta');
  assert.equal(id, 'beta-talk');
  assert.equal(await W.boardExists('beta-talk'), true, 'a new team gets one spawned to match');
  const board = await W.readBoard('beta-talk');
  assert.equal(board.posts.length, 0, 'empty is a normal state, not a missing one');
  assert.match(board.brief, /beta team's wipeboard/, 'and it says whose it is');
});

test('ensureRosterBoard is idempotent and never replaces what is there', async () => {
  await writeRoster('gamma', 'gamma-talk');
  await W.ensureRosterBoard('gamma');
  await W.appendPost('gamma-talk', '@a', 'said something');
  await W.setBrief('gamma-talk', 'the owner wrote this');
  await W.ensureRosterBoard('gamma');
  const board = await W.readBoard('gamma-talk');
  assert.equal(board.posts.length, 1, 'the thread survived');
  assert.equal(board.brief, 'the owner wrote this', 'and so did the Brief');
});

test("a roster's wipeboard is never removed, however quiet the team goes", async () => {
  await writeRoster('delta', 'delta-talk');
  await W.ensureRosterBoard('delta');
  // No members, no posts, stub Brief — every other condition for removal holds.
  assert.equal(
    await W.reapBoard('delta-talk', { teamMembers: [], enrolled: [], rosterPointsAtIt: true }),
    false,
  );
  assert.equal(await W.boardExists('delta-talk'), true);
});
