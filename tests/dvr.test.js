/**
 * The unlocked input rule — the router every keystroke on the tape surface passes
 * through. Its Enter rule is a measured fix, not a preference: text and its carriage
 * return must leave in ONE send, because a \r on a timer is a message iOS can lose
 * halfway, leaving a dictated line sitting in the pane's box, sent but never entered.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dvrStep } from '../public/js/dvr.js';

test('printable text parks locally and puts nothing on the wire', () => {
  assert.deepEqual(dvrStep('', 'h'), { pending: 'h', send: null });
  assert.deepEqual(dvrStep('hel', 'l'), { pending: 'hell', send: null });
});

test('a paste parks whole, in one step', () => {
  assert.deepEqual(dvrStep('', 'a pasted sentence'), { pending: 'a pasted sentence', send: null });
});

test('Enter sends the parcel with its own \\r glued on, atomically', () => {
  assert.deepEqual(dvrStep('ls -la', '\r'), { pending: '', send: 'ls -la\r' });
  // \n is Enter too — some keyboards and paste paths deliver it that way.
  assert.deepEqual(dvrStep('ls', '\n'), { pending: '', send: 'ls\r' });
});

test('bare Enter with nothing parked is a command key, never a no-op', () => {
  // The recovery path: if a previous send's Enter was swallowed by the TUI's paste
  // handling, the text sits in the pane's own box and THIS keypress submits it.
  assert.deepEqual(dvrStep('', '\r'), { pending: '', send: '\r' });
});

test('backspace eats parked text before it reaches the pane', () => {
  assert.deepEqual(dvrStep('abc', '\x7f'), { pending: 'ab', send: null });
  assert.deepEqual(dvrStep('a', '\b'), { pending: '', send: null });
});

test('backspace with nothing parked is a command key and goes through', () => {
  assert.deepEqual(dvrStep('', '\x7f'), { pending: '', send: '\x7f' });
});

test('control characters and escape sequences go straight through, parked text intact', () => {
  assert.deepEqual(dvrStep('half typed', '\x03'), { pending: 'half typed', send: '\x03' }); // ^C
  assert.deepEqual(dvrStep('x', '\x1b'), { pending: 'x', send: '\x1b' }); // Esc
  assert.deepEqual(dvrStep('x', '\x1b[A'), { pending: 'x', send: '\x1b[A' }); // Up
  assert.deepEqual(dvrStep('x', '\t'), { pending: 'x', send: '\t' }); // Tab
});

test('a whole typed line, keystroke by keystroke, leaves exactly once', () => {
  let pending = '';
  const sent = [];
  for (const ch of ['h', 'i', '\r']) {
    const r = dvrStep(pending, ch);
    pending = r.pending;
    if (r.send !== null) sent.push(r.send);
  }
  assert.deepEqual(sent, ['hi\r']);
  assert.equal(pending, '');
});
