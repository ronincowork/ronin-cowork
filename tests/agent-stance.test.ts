/**
 * WHAT THE TERMINAL READ ASKS THE SCREEN. Status is the newest line of an Agent's output
 * (AGENT_OUTPUT.md); the screen is read by the terminal read alone, for what no log writes:
 * an open question, and for a CLI with no log, whether it is at work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { asksForInput, classifyStatus } from '../src/status.js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activityMoved } from '../src/ws/events.js';
import { ACTIVITY_SUBSCRIPTION } from '../src/tmux-client.js';

test('a question on the screen is told apart from work and from a ready prompt', () => {
  const asking = 'Do you want to proceed?\n❯ 1. Yes\n  2. No';
  const working = '✻ Cerebrating… (12s · esc to interrupt)';
  const ready = '│ > ';
  assert.equal(asksForInput(asking), true);
  assert.equal(asksForInput(working), false);
  assert.equal(asksForInput(ready), false);
  // An idle Claude whose reply ends on a question is not asking: the prompt is empty.
  const idle = '  Which of these do you want, and is anything missing?\n✻ Worked for 22s · done 6:45 AM\n────\n❯\n────\n  ⏵⏵ bypass permissions on';
  assert.equal(asksForInput(idle), false);
  assert.equal(classifyStatus(working), 'thinking');
  assert.equal(classifyStatus(ready), 'ready');
});

test('tmux\'s activity report wakes only the panes whose output moved', () => {
  const last = new Map<string, string>();
  assert.deepEqual(activityMoved('alpha:100,bravo:200,', last), [], 'the first report is a baseline');
  assert.deepEqual(activityMoved('alpha:100,bravo:201,', last), ['bravo']);
  assert.deepEqual(activityMoved('alpha:100,bravo:201,', last), [], 'nothing moved, nothing woken');
});

test('the activity subscription, as real tmux expands it, reads one entry per session', (t) => {
  // An isolated server: its own socket directory, made first (a missing one falls back to the live socket).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-'));
  const tmux = (...args: string[]) => execFileSync('tmux', ['-S', path.join(dir, 's'), ...args], { encoding: 'utf8' });
  t.after(() => { try { tmux('kill-server'); } catch { /* already gone */ } fs.rmSync(dir, { recursive: true, force: true }); });
  tmux('new-session', '-d', '-s', 'alpha'); tmux('new-session', '-d', '-s', 'bravo');
  const value = tmux('display-message', '-p', ACTIVITY_SUBSCRIPTION.replace(/^activity::/, '')).trim();
  const last = new Map<string, string>();
  activityMoved(value, last);
  assert.deepEqual([...last.keys()].sort(), ['alpha', 'bravo'], value);
});
