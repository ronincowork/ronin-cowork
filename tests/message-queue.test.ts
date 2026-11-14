import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

async function target(t: TestContext, name: string): Promise<string> {
  const server = await openTestServer(`mq_${name}`, { onPath: true });
  t.after(() => closeTestServer(server));
  await server.run('new-session', '-d', '-s', name);
  return name;
}

async function queue(t: TestContext, label: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `ronin-message-${label}-`));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  return import(`../src/message-queue.ts?${label}=${Date.now()}`);
}

test('producers enqueue without resolving the target', async (t) => {
  const q = await queue(t, 'enqueue');
  const item = await q.enqueueMessage('whoever_lives_here', 'hello', 'tell', 'sender');
  assert.deepEqual(await q.listQueuedMessages(), [item]);
  assert.deepEqual(Object.keys(item).sort(), ['created_at', 'from', 'id', 'source', 'target', 'text']);
});

test('queue delivery names the recorded actor and channel without changing the stored body', async (t) => {
  const q = await queue(t, 'message_provenance');
  const item = await q.enqueueMessage('target', 'Please review the boundary.', 'tell', 'setup_live_audit');
  assert.equal(q.deliveryText(item), 'From @setup_live_audit [Tell]:\nPlease review the boundary.');
  assert.equal(item.text, 'Please review the boundary.');
  assert.equal(q.deliveryText({ ...item, from: 'Agent' }), 'From an unidentified Agent [Tell]:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'wipeboard_notice', from: '@cleaner' }),
    'From @cleaner [Wipeboard notice]:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'house', from: '@cleaner' }),
    'From @cleaner [House notice]:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'house', from: 'Ronin House' }),
    'From Ronin House [House notice]:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'owner', from: 'Owner' }),
    'From Owner [Ronin Box]:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'typed', from: 'Owner' }), 'Please review the boundary.',
    'what the person typed in the Message box arrives as if typed into the terminal');
  assert.equal(q.deliveryText({ ...item, source: 'jikan', from: 'Cron jobs' }),
    'From Cron jobs [Scheduled job]:\nPlease review the boundary.');
});

test('hosted office: a person\'s letter records them and says who, typed included', async (t) => {
  const q = await queue(t, 'person');
  const bare = { email: 'a@x.com', role: 'owner' };
  const typed = await q.enqueueMessage('target', 'Hello.', 'typed', undefined, bare);
  assert.deepEqual(typed.person, bare);
  assert.equal(typed.from, 'a@x.com, owner');
  assert.equal(q.deliveryText(typed), 'From a@x.com, owner [Message box]:\nHello.', 'email-only, the case today');
  const full = await q.enqueueMessage('target', 'Hello.', 'owner', undefined, { ...bare, name: 'Ann Lee', organization: 'X Ltd' });
  assert.equal(q.deliveryText(full), 'From Ann Lee <a@x.com>, owner, X Ltd [Ronin Box]:\nHello.');
  const stranger = await q.enqueueMessage('target', 'Hello.', 'owner', undefined, { email: 'c@z.com', role: null });
  assert.equal(q.deliveryText(stranger), 'From c@z.com [Ronin Box]:\nHello.', 'no role, no role named');
  const local = await q.enqueueMessage('target', 'Hello.', 'typed', undefined, null);
  assert.equal('person' in local, false);
  assert.equal(q.deliveryText(local), 'Hello.', 'no person: exactly as today');
});

test('the worker shreds a letter whose current target is missing', async (t) => {
  const q = await queue(t, 'missing');
  await q.enqueueMessage('nobody_here', 'hello', 'house');
  await q.processMessageQueue();
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('a draft holds until the deadline, which forces once and shreds failure', async (t) => {
  const q = await queue(t, 'deadline');
  const name = await target(t, 'queue_deadline_target');
  const item = await q.enqueueMessage(name, 'letter', 'tell');
  const calls: string[] = [];
  const delivery = {
    safe: async () => { calls.push('safe'); return { delivered: false, submitted: false, reason: 'draft' }; },
    force: async () => { calls.push('force'); throw new Error('best effort failed'); },
  };
  const born = Date.parse(item.created_at);
  await q.processMessageQueue({ now: born + 60_000, delivery });
  assert.deepEqual(calls, ['safe']);
  assert.equal((await q.listQueuedMessages()).length, 1);
  await q.processMessageQueue({ now: born + q.AUTO_FORCE_AFTER_MS, delivery });
  assert.deepEqual(calls, ['safe', 'safe', 'force']);
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('an open dialog holds a letter past its deadline: its Enter would choose an option (KAN-215)', async (t) => {
  const q = await queue(t, 'dialog');
  const name = await target(t, 'queue_dialog_target');
  const item = await q.enqueueMessage(name, 'handoff notice', 'house');
  const calls: string[] = [];
  let dialog = true;
  const delivery = {
    safe: async () => {
      calls.push('safe');
      return dialog ? { delivered: false, submitted: false, reason: 'dialog is open' } : { delivered: true, submitted: true, reason: 'sent' };
    },
    force: async () => { calls.push('force'); return { delivered: true, submitted: true, reason: 'forced' }; },
  };
  const born = Date.parse(item.created_at);
  await q.processMessageQueue({ now: born + q.AUTO_FORCE_AFTER_MS + 1, delivery });
  assert.deepEqual(calls, ['safe'], 'a trust prompt on screen: nothing is typed, nothing forced');
  assert.equal((await q.listQueuedMessages()).length, 1);
  dialog = false;
  await q.processMessageQueue({ now: born + q.AUTO_FORCE_AFTER_MS + 5_000, delivery });
  assert.deepEqual(calls, ['safe', 'safe'], 'answered, the letter goes the ordinary way');
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('one worker sends oldest first and deletes every attempted letter', async (t) => {
  const q = await queue(t, 'worker');
  const name = await target(t, 'queue_worker_target');
  await q.enqueueMessage(name, 'first', 'owner');
  await q.enqueueMessage(name, 'second', 'wipeboard_notice');
  await q.enqueueMessage(name, 'third', 'tell', 'setup_live_audit');
  const sent: string[] = [];
  await q.processMessageQueue({ delivery: {
    safe: async (_name: string, text: string) => { sent.push(text); return { delivered: true, submitted: true, reason: 'sent' }; },
    force: async () => { throw new Error('not overdue'); },
  } });
  assert.deepEqual(sent, [
    'From Owner [Ronin Box]:\nfirst',
    'From Wipeboard [Wipeboard notice]:\nsecond',
    'From @setup_live_audit [Tell]:\nthird',
  ]);
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('messages queued in the same millisecond keep their enqueue order (a tie on created_at fell back to random file names)', async (t) => {
  const q = await queue(t, 'same_ms');
  for (let round = 0; round < 100; round++) {
    const items = [];
    for (const text of ['first', 'second', 'third']) items.push(await q.enqueueMessage('target', text, 'house'));
    const listed = (await q.listQueuedMessages()).map((item: { text: string }) => item.text);
    assert.deepEqual(listed, ['first', 'second', 'third'], `round ${round}: created_at ${items.map((item) => item.created_at).join(' ')}`);
    await q.dismissMessages(items.map((item) => item.id));
  }
});

test('dismissal removes only exact queued IDs', async (t) => {
  const q = await queue(t, 'dismiss');
  const first = await q.enqueueMessage('target', 'first', 'house');
  const second = await q.enqueueMessage('target', 'second', 'house');
  assert.deepEqual((await q.dismissMessages([first.id, first.id])).dismissed, [first.id]);
  assert.deepEqual((await q.listQueuedMessages()).map((item) => item.id), [second.id]);
});
