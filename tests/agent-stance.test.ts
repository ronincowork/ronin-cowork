/**
 * STANCE — what an Agent is doing, and where each answer comes from.
 *
 * Ronin used to answer this by matching the CLI's spinner glyphs on a capture of the pane,
 * for every session every two seconds. The journal states four of the five outright. The
 * fifth, `asking`, cannot come from a journal in any CLI — a permission prompt is drawn on
 * a screen and writes no line — so it stays a pane read, and it wins, because an Agent
 * stopped at a question is `working` as far as its journal knows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForInput, classifyStatus } from '../src/status.js';

/** The precedence as the roster loop applies it (src/routes/launch.ts). */
const stanceOfRow = (asking: boolean, fromJournal?: string) => (asking ? 'asking' : (fromJournal ?? 'unknown'));

test('a dialog on the pane outranks whatever the journal last saw', () => {
  // The journal cannot know: the last thing it recorded was a tool going out.
  assert.equal(stanceOfRow(true, 'working'), 'asking');
  assert.equal(stanceOfRow(true, 'awaiting_you'), 'asking');
  assert.equal(stanceOfRow(true, undefined), 'asking');
});

test('with no dialog the journal has the answer, and no journal is never a guess', () => {
  assert.equal(stanceOfRow(false, 'working'), 'working');
  assert.equal(stanceOfRow(false, 'replying'), 'replying');
  assert.equal(stanceOfRow(false, 'awaiting_you'), 'awaiting_you');
  // An Agent born before Ronin recorded its conversation contributes nothing, and the row
  // says so rather than borrowing the screen's opinion.
  assert.equal(stanceOfRow(false, undefined), 'unknown');
});

test('the pane is asked one question now, not three', () => {
  const asking = 'Do you want to proceed?\n❯ 1. Yes\n  2. No';
  const working = '✻ Cerebrating… (12s · esc to interrupt)';
  const ready = '│ > ';
  assert.equal(asksForInput(asking), true);
  // These two used to become `thinking` and `ready` on the board. They are the journal's
  // business now, and this function does not answer for them.
  assert.equal(asksForInput(working), false);
  assert.equal(asksForInput(ready), false);
  // The full table stays for Mika's one-shot startup read, which asks something else:
  // is this newly launched CLI up yet.
  assert.equal(classifyStatus(working), 'thinking');
  assert.equal(classifyStatus(ready), 'ready');
});
