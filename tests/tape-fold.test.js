/**
 * The fold rule — how a tool's output collapses in the tape transcript.
 *
 * The fiddly parts, and why each exists: a stray code fragment stays inline (a fold per
 * fragment is worse noise than the fragment); a blank line inside a block belongs to
 * the fold (or one tool's output shatters into a chain of stubs); and a run that STARTS
 * foldable extends the previous fold, because output settles across several ticks and
 * one tool's result must not become one fold per tick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRecs } from '../public/js/tapefold.js';

const text = (s) => ({ t: 'text', s });

test('plain lines are one text run, newline-terminated', () => {
  const { ops, chars } = groupRecs([['text', 'hello'], ['text', 'world']], false);
  assert.deepEqual(ops, [text('hello\nworld\n')]);
  assert.equal(chars, 12); // 5+1 + 5+1
});

test('a ⎿ result always folds, and its first line is the summary', () => {
  const { ops } = groupRecs([['result', '⎿ ran 3 tests']], false);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].t, 'fold');
  assert.equal(ops[0].label, '⎿ ran 3 tests');
  assert.deepEqual(ops[0].lines, ['⎿ ran 3 tests']);
});

test('one or two stray code lines stay inline — a fold per fragment is worse noise', () => {
  const { ops } = groupRecs([['text', 'prose'], ['code', 'x = 1'], ['text', 'more prose']], false);
  assert.deepEqual(ops, [text('prose\nx = 1\nmore prose\n')]);
});

test('three or more code lines earn a fold, labelled rather than headlined', () => {
  const { ops } = groupRecs([['code', 'a'], ['code', 'b'], ['code', 'c']], false);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].t, 'fold');
  assert.equal(ops[0].label, '⌨ code'); // the gutter junk of line 1 says nothing
  assert.deepEqual(ops[0].lines, ['a', 'b', 'c']);
  assert.equal(ops[0].n, 3);
});

test('blanks inside a block count toward the run and stay in the fold', () => {
  const { ops } = groupRecs([['code', 'a'], ['text', ''], ['code', 'b'], ['code', 'c']], false);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].t, 'fold');
  assert.deepEqual(ops[0].lines, ['a', '', 'b', 'c']);
  assert.equal(ops[0].n, 3, 'a blank does not bump the summary count');
});

test('a non-blank plain line closes the fold; what follows is plain again', () => {
  const { ops, keepFold } = groupRecs(
    [['result', '⎿ done'], ['text', 'after']],
    false,
  );
  assert.equal(ops.length, 2);
  assert.equal(ops[0].t, 'fold');
  assert.deepEqual(ops[1], text('after\n'));
  assert.equal(keepFold, false);
});

test('a run that starts foldable EXTENDS the previous tick, never opens a second fold', () => {
  const { ops } = groupRecs([['result', '⎿ line two']], true);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].t, 'extend', 'one tool settling across ticks is one fold');
  assert.deepEqual(ops[0].lines, ['⎿ line two']);
});

test('a carried fold takes a single code line without the 3-line test', () => {
  // The run rule guards OPENING a fold. An open one takes what settles next.
  const { ops } = groupRecs([['code', 'just one']], true);
  assert.equal(ops[0].t, 'extend');
  assert.deepEqual(ops[0].lines, ['just one']);
});

test('a carried fold absorbs a leading blank rather than shattering', () => {
  const { ops } = groupRecs([['text', '   ']], true);
  assert.equal(ops[0].t, 'extend');
  assert.deepEqual(ops[0].lines, ['']);
});

test('a carried fold is closed by real prose, and the prose stays plain', () => {
  const { ops, keepFold } = groupRecs([['text', 'prose']], true);
  assert.deepEqual(ops, [text('prose\n')]);
  assert.equal(keepFold, false);
});

test('an untouched carried fold survives an empty tick', () => {
  const { ops, keepFold } = groupRecs([], true);
  assert.deepEqual(ops, []);
  assert.equal(keepFold, true, 'nothing happened, so the fold is still open');
});

test('keepFold reports an open fold for the next tick to extend', () => {
  const { keepFold } = groupRecs([['text', 'a'], ['result', '⎿ x']], false);
  assert.equal(keepFold, true);
});

test('text, fold and text keep their order', () => {
  const { ops } = groupRecs(
    [['text', 'before'], ['code', 'a'], ['code', 'b'], ['code', 'c'], ['text', 'after']],
    false,
  );
  assert.deepEqual(ops.map((o) => o.t), ['text', 'fold', 'text']);
  assert.equal(ops[0].s, 'before\n');
  assert.equal(ops[2].s, 'after\n');
});

test('chars counts every record plus its newline, folded or not', () => {
  const { chars } = groupRecs([['text', 'abc'], ['result', '⎿ z']], false);
  assert.equal(chars, 4 + 4);
});
