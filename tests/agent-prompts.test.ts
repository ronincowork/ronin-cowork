import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStatus } from '../src/status.js';
import { deliverSafe, parsePrompt } from '../src/send.js';

test('Codex trust choice is a dialog, never a ready prompt', () => {
  const screen = 'Do you trust the contents of this directory?\n\n› 1. Yes, continue\n  2. No, quit';
  assert.equal(classifyStatus(screen), 'awaiting-input');
  assert.deepEqual(parsePrompt(screen), { found: true, text: null, menu: true });
});

test('Claude trust prompt has no numbers and is still a dialog, never a draft (KAN-215)', async () => {
  const screen = ' Do you trust the files in this folder?\n\n ❯ No, exit\n   Yes, I trust this folder\n\n Enter to confirm · Esc to cancel\n';
  assert.deepEqual(parsePrompt(screen), { found: true, text: null, menu: true });
  const sent: string[] = [];
  const io = { read: async () => screen, type: async (t: string) => { sent.push(t); }, enter: async () => { sent.push('Enter'); } };
  const result = await deliverSafe('trusting', 'From Ronin House [House notice]:\nKAN-209 handoff', undefined, io);
  assert.equal(result.reason, 'dialog is open', 'the queue holds a dialog past its deadline; a draft it would force');
  assert.deepEqual(sent, [], 'no Enter reaches "No, exit"');
});

test('Codex ready row is recognized and its dim suggestion is not owner text', () => {
  const plain = '› Use /skills to list available skills\n\n  gpt-5.6-sol default · ~/repo';
  const escaped = '\x1b[2m› Use /skills to list available skills\x1b[0m\n\n  gpt-5.6-sol default · ~/repo';
  assert.equal(classifyStatus(plain), 'ready');
  assert.deepEqual(parsePrompt(escaped), { found: true, text: null, menu: false });
});

test('Codex pending text is readable for preflight', () => {
  assert.deepEqual(parsePrompt('› Build the startup brief\n'), {
    found: true,
    text: 'Build the startup brief',
    menu: false,
  });
});

test('Claude prompt remains visible beneath a six-row status footer', () => {
  const screen = [
    'assistant finished',
    '\x1b[39m❯\u00a0\x1b[2mTry another task\x1b[0m',
    '────────────────────────',
    '  ctx 26% · Fable',
    '  auto mode on',
    '  Update installed',
    '  new task? /clear',
    '  /rc',
  ].join('\n');
  assert.deepEqual(parsePrompt(screen), { found: true, text: null, menu: false });
});

test('busy status does not erase a possible draft from preflight', () => {
  const screen = '❯ owner still typing\n\n✻ Cerebrating…';
  assert.equal(classifyStatus(screen), 'thinking');
  assert.deepEqual(parsePrompt(screen), { found: true, text: 'owner still typing', menu: false });
});

/* ---- LAUNCH_READY: the vendor screen table, which now serves the ROSTER alone ----
 * The readiness machinery these rows were first written for is deleted — the CLI is the
 * tile's process and nothing waits to type at it. The rows stay, and matter MORE than
 * before: the person is the one answering a vendor's dialog now, so the roster saying
 * "awaiting-input" is how they know which tile to open.
 */

test("gemini's measured trust dialog is legible on the roster, bullet and all", () => {
  const screen = [
    ' │ Do you trust the files in this folder?                    │',
    ' │ ● 1. Trust folder (some-dir)                              │',
    ' │   2. Trust parent folder (tmp)                            │',
  ].join('\n');
  assert.equal(classifyStatus(screen), 'awaiting-input');
});

test('the composed list answers the roster exactly as the hand-written one did', () => {
  assert.equal(classifyStatus('❯ Try "create a util…"'), 'ready');
  assert.equal(classifyStatus('› Use /skills'), 'ready');
  assert.equal(classifyStatus('│ > type here '), 'ready');
  assert.equal(classifyStatus('glen3@box:~$ '), 'ready');
  assert.equal(classifyStatus('working… (esc to interrupt)'), 'thinking');
  assert.equal(classifyStatus('✻ Cerebrating…'), 'thinking');
  assert.equal(classifyStatus(' ❯ No, exit\n   Yes, I trust this folder\n Enter to confirm · Esc to cancel'), 'awaiting-input');
  assert.equal(classifyStatus('Do you trust the contents of this directory?\n› 1. Yes'), 'awaiting-input');
});
