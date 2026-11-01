/**
 * WHAT THE TERMINAL READ ASKS THE SCREEN. Status is the newest line of an Agent's output
 * (AGENT_OUTPUT.md); the screen is read by the terminal read alone, for what no log writes:
 * an open question, and for a CLI with no log, whether it is at work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForInput, classifyStatus } from '../src/status.js';
import { activityMoved } from '../src/ws/events.js';

test('a question on the screen is told apart from work and from a ready prompt', () => {
  const asking = 'Do you want to proceed?\n❯ 1. Yes\n  2. No';
  const working = '✻ Cerebrating… (12s · esc to interrupt)';
  const ready = '│ > ';
  assert.equal(asksForInput(asking), true);
  assert.equal(asksForInput(working), false);
  assert.equal(asksForInput(ready), false);
  assert.equal(classifyStatus(working), 'thinking');
  assert.equal(classifyStatus(ready), 'ready');
});

test('tmux\'s activity report wakes only the panes whose output moved', () => {
  const last = new Map<string, string>();
  assert.deepEqual(activityMoved('alpha:100,bravo:200,', last), [], 'the first report is a baseline');
  assert.deepEqual(activityMoved('alpha:100,bravo:201,', last), ['bravo']);
  assert.deepEqual(activityMoved('alpha:100,bravo:201,', last), [], 'nothing moved, nothing woken');
});
