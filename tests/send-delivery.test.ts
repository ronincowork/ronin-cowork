import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverSafe, deliverForce, parsePrompt, submitCommand, type PaneIO } from '../src/send.js';

function pane(screen: string) {
  const calls: string[] = [];
  const io: PaneIO = {
    read: async () => { calls.push('read'); return screen; },
    type: async (text) => { calls.push(`type:${text}`); },
    enter: async () => { calls.push('Enter'); },
  };
  return { io, calls };
}

test('safe delivery checks once, then types and sends one separate Enter', async () => {
  const { io, calls } = pane('❯');
  let attempts = 0;
  assert.equal((await deliverSafe('agent', 'hello', () => attempts++, io)).delivered, true);
  assert.deepEqual(calls, ['read', 'type:hello', 'Enter']);
  assert.equal(attempts, 1);
});

test('a draft or menu holds before typing, including while the Agent is thinking', async () => {
  for (const screen of ['❯ unfinished', '❯ unfinished\n✻ Cerebrating… (12s)', '❯ 1. Confirm', '❯ 1. Confirm\n✻ Cerebrating… (12s)']) {
    const { io, calls } = pane(screen);
    const result = await deliverSafe('agent', 'hello', () => assert.fail('not attempted'), io);
    assert.equal(result.delivered, false);
    assert.deepEqual(calls, ['read']);
  }
});

test('a tall foreign draft is found above the former fifteen-row limit', () => {
  assert.equal(parsePrompt('❯ unfinished\n' + '  continuation\n'.repeat(20)).text, 'unfinished');
});

test('matching text is still a draft, never permission to submit somebody else’s input', async () => {
  const { io, calls } = pane('❯ hello');
  assert.equal((await deliverSafe('agent', 'hello', undefined, io)).delivered, false);
  assert.deepEqual(calls, ['read']);
});

test('once text is inserted, a changed screen cannot abandon Enter', async () => {
  const { io, calls } = pane('❯');
  io.type = async () => {
    calls.push('type');
    io.read = async () => { throw new Error('must not inspect a dialog after typing'); };
  };
  assert.equal((await deliverSafe('agent', 'hello', undefined, io)).delivered, true);
  assert.deepEqual(calls, ['read', 'type', 'Enter']);
});

test('force and composer delivery never read the screen; multiline text stays one write', async () => {
  const { io, calls } = pane('❯ someone is typing');
  io.read = async () => { throw new Error('no preflight'); };
  assert.equal((await deliverForce('agent', 'one\ntwo', io)).delivered, true);
  assert.deepEqual(calls, ['type:one\ntwo', 'Enter']);
});

test('submission cancels copy mode and sends a real Enter in one tmux command queue', () => {
  assert.deepEqual(submitCommand('agent'), [
    'send-keys', '-t', '=agent:', '-X', 'cancel',
    ';',
    'send-keys', '-t', '=agent:', 'Enter',
  ]);
  assert.equal(submitCommand('agent').includes('\r'), false, 'submission is never pasted carriage-return data');
});

test('unknown and busy empty screens do not prevent delivery', async () => {
  for (const screen of ['unknown', '❯\n✻ Cerebrating… (12s)']) {
    const { io, calls } = pane(screen);
    assert.equal((await deliverSafe('agent', 'hello', undefined, io)).delivered, true);
    assert.equal(calls.at(-1), 'Enter');
  }
});

test('a transport error remains an error, not a claim of delivery', async () => {
  const { io } = pane('❯');
  io.enter = async () => { throw new Error('tmux disconnected'); };
  await assert.rejects(deliverForce('agent', 'hello', io), /tmux disconnected/);
});
