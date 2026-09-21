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

test('Tell delivery names its recorded sender without changing the stored message body', async (t) => {
  const q = await queue(t, 'tell_sender');
  const item = await q.enqueueMessage('target', 'Please review the boundary.', 'tell', 'setup_live_audit');
  assert.equal(q.deliveryText(item), 'Tell from @setup_live_audit:\nPlease review the boundary.');
  assert.equal(item.text, 'Please review the boundary.');
  assert.equal(q.deliveryText({ ...item, from: 'Agent' }), 'Tell from an unidentified Agent:\nPlease review the boundary.');
  assert.equal(q.deliveryText({ ...item, source: 'owner' }), item.text);
});

test('the worker shreds a letter whose current target is missing', async (t) => {
  const q = await queue(t, 'missing');
  await q.enqueueMessage('nobody_here', 'hello', 'house');
  await q.processMessageQueue();
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('a draft is the only hold; the deadline forces once and shreds failure', async (t) => {
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
  assert.deepEqual(calls, ['safe', 'force']);
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
  assert.deepEqual(sent, ['first', 'second', 'Tell from @setup_live_audit:\nthird']);
  assert.deepEqual(await q.listQueuedMessages(), []);
});

test('dismissal removes only exact queued IDs', async (t) => {
  const q = await queue(t, 'dismiss');
  const first = await q.enqueueMessage('target', 'first', 'house');
  const second = await q.enqueueMessage('target', 'second', 'house');
  assert.deepEqual((await q.dismissMessages([first.id, first.id])).dismissed, [first.id]);
  assert.deepEqual((await q.listQueuedMessages()).map((item) => item.id), [second.id]);
});
