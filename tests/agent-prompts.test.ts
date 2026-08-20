import test from 'node:test';
import assert from 'node:assert/strict';
import { agentPresence, classifyStatus } from '../src/status.js';
import { parsePrompt } from '../src/send.js';

test('Codex trust choice is a dialog, never a ready prompt', () => {
  const screen = 'Do you trust the contents of this directory?\n\n› 1. Yes, continue\n  2. No, quit';
  assert.equal(classifyStatus(screen), 'awaiting-input');
  assert.deepEqual(parsePrompt(screen), { found: true, text: null, menu: true });
});

test('Codex ready row is recognized and its dim suggestion is not owner text', () => {
  const plain = '› Use /skills to list available skills\n\n  gpt-5.6-sol default · ~/repo';
  const escaped = '\x1b[2m› Use /skills to list available skills\x1b[0m\n\n  gpt-5.6-sol default · ~/repo';
  assert.equal(classifyStatus(plain), 'ready');
  assert.deepEqual(parsePrompt(escaped), { found: true, text: null, menu: false });
});

test('Codex pending text is readable for submit verification', () => {
  assert.deepEqual(parsePrompt('› Build the startup brief\n'), {
    found: true,
    text: 'Build the startup brief',
    menu: false,
  });
});

/* ------------------------------------------------------------------ LAUNCH_READY
 * The two questions, held apart. `classifyStatus` answers "what is this pane doing?"
 * for the roster and for Koshi; `agentPresence` answers "is THE AGENT listening?" for
 * the one caller about to type at it. Every case below asserts BOTH, because the bug
 * was one question standing in for the other and the fix is worthless if it quietly
 * changes the roster's answer.
 */

/** Verbatim tail of the pane, from the guarded end-to-end walk on 2026-08-20. */
const DIED_BACK_TO_BASH = [
  '› 1. Yes, continue',
  '  2. No, quit',
  '  Press enter to continueError: timed out discarding buffered terminal input',
  'glen3@dohyo-unified:/tmp/scratch$ ',
].join('\n');

test('a shell prompt left behind by a dead agent is not readiness', () => {
  const shell = 'glen3@dohyo-unified:~/code$ ';
  // The roster's answer does not change: for a terminal session this IS ready.
  assert.equal(classifyStatus(shell), 'ready');
  // The brief gate's answer is the opposite, and that is the whole point.
  assert.equal(agentPresence(shell), 'gone');
});

test('the measured failure: codex dies on its trust dialog and bash comes back', () => {
  // This exact screen used to classify as ready, and the brief was typed into bash.
  assert.equal(agentPresence(DIED_BACK_TO_BASH), 'gone');
});

test('a trust dialog is the agent asking, not the agent gone', () => {
  const screen = 'Do you trust the contents of this directory?\n\n› 1. Yes, continue\n  2. No, quit';
  assert.equal(classifyStatus(screen), 'awaiting-input');
  // `asking` holds the gate open on its long window — a person is being waited for.
  assert.equal(agentPresence(screen), 'asking');
});

test('an agent prompt is readiness for both questions', () => {
  assert.equal(agentPresence('› Use /skills to list available skills'), 'ready');
  assert.equal(agentPresence('❯ Try "create a util that…"'), 'ready');
  assert.equal(classifyStatus('❯ Try "create a util that…"'), 'ready');
});

test('a working agent is busy, not gone, even with no prompt row on screen', () => {
  const screen = '✻ Cerebrating… (12s · esc to interrupt)';
  assert.equal(agentPresence(screen), 'busy');
  assert.equal(classifyStatus(screen), 'thinking');
});

test('nothing recognizable is null, not a guess, for both questions', () => {
  assert.equal(agentPresence('installing dependencies'), null);
  assert.equal(classifyStatus('installing dependencies'), null);
});

test('the moment after the command is typed is not "gone"', () => {
  // runCommand echoes the command onto the prompt line and presses Enter; the CLI has not
  // painted yet. The last line ends in the command, not in `$`, so the gate keeps waiting.
  // A false `gone` here would abort EVERY launch before the agent had a chance to come up.
  const starting = 'glen3@dohyo-unified:~/code$ claude --model opus';
  assert.notEqual(agentPresence(starting), 'gone');
  assert.equal(agentPresence(starting), null); // nothing recognizable yet — keep waiting
});

test('a stale shell prompt above a live agent does not outrank it', () => {
  // The shell prompt the CLI was launched from stays in the scrollback forever. Only the
  // LAST line speaks, so an agent that has since painted its prompt reads as ready.
  const screen = ['glen3@dohyo-unified:~/code$ codex', '', '› Use /skills to list available skills'].join('\n');
  assert.equal(agentPresence(screen), 'ready');
});
