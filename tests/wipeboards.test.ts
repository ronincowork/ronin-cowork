/**
 * The wipeboard FILE half, as executable assertions — in a temp store, no tmux touched.
 *
 * The membership half (teams, dials, notices actually landing) needs a tmux server and
 * is deliberately NOT tested here: tests never aim at the live server, and a throwaway
 * one belongs to the smoke layer. What this file pins is the contract everything else
 * leans on: a team wipeboard materializes exactly once and says whose it is, posts
 * append without ever rewriting, and the Brief replace never touches the thread.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wipeboard-test-'));
process.env.RONIN_WIPEBOARDS_DIR = root;
const {
  appendPost, boardExists, boardPath, ensureBoard, isValidBoardName,
  readBoard, setBrief, teamJoinNotice, teamLeaveNotice, teamStub,
} = await import('../src/wipeboards.js');

test('board names stay boring — same rules as tags, so one cleaner serves both', () => {
  assert.equal(isValidBoardName('ronin'), true);
  assert.equal(isValidBoardName('a-b_2'), true);
  assert.equal(isValidBoardName('Ronin'), false); // addresses people type: lowercase
  assert.equal(isValidBoardName(''), false);
  assert.equal(isValidBoardName('x'.repeat(33)), false);
});

test('ensureBoard creates once and says so — the created flag is the join-notice moment', async () => {
  assert.equal(await boardExists('crew'), false);
  assert.equal(await ensureBoard('crew', teamStub('crew')), true);
  assert.equal(await ensureBoard('crew', teamStub('crew')), false); // second call: already there
  const board = await readBoard('crew');
  // The team stub says whose it is and how membership works — the first reader
  // arrives with no enrolment step behind them.
  assert.match(board.brief, /crew team's wipeboard/);
  assert.match(board.brief, /membership follows the team/);
});

test('posts append as whole entries and read back in order', async () => {
  await ensureBoard('thread');
  await appendPost('thread', '@alpha', 'first');
  await appendPost('thread', 'user: glen', 'second\nwith a second line');
  const board = await readBoard('thread');
  assert.equal(board.posts.length, 2);
  assert.deepEqual(board.posts.map((p) => p.author), ['@alpha', 'user: glen']);
  assert.equal(board.posts[1].text, 'second\nwith a second line');
});

test('setBrief replaces the Brief and never touches the thread below it', async () => {
  await ensureBoard('careful');
  await appendPost('careful', '@beta', 'do not lose me');
  await setBrief('careful', 'what this is for');
  const board = await readBoard('careful');
  assert.equal(board.brief, 'what this is for');
  assert.equal(board.posts.length, 1);
  assert.equal(board.posts[0].text, 'do not lose me');
});

test('the team notices name the team, the file, and the follow-the-team rule', () => {
  const join = teamJoinNotice('crew', boardPath('crew'), ['a', 'b']);
  assert.match(join, /"crew" team/);
  assert.match(join, /Membership follows the team/);
  assert.match(join, /never edit the Brief/);
  assert.ok(join.includes(boardPath('crew')));
  const leave = teamLeaveNotice('crew', boardPath('crew'));
  assert.match(leave, /left the "crew" team/);
  assert.ok(leave.includes(boardPath('crew')));
});
