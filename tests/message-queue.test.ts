import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

/** A test-owned tmux server gives queue tests a real recipient and birth key. The product
 *  reaches it because the helper puts the server's `tmux` wrapper first on PATH. */
async function liveTarget(t: TestContext, name: string): Promise<string> {
  const server = await openTestServer(`mq_${name}`, { onPath: true });
  t.after(() => closeTestServer(server));
  await server.run('new-session', '-d', '-s', name);
  return name;
}

test('a send to a missing target is refused with roster and wipeboard teaching', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  await assert.rejects(
    queue.enqueueMessage('definitely_missing_session', 'hello', 'tell'),
    (error: Error) => error.name === 'MessageRefused' && /roster/.test(error.message) && /wipeboard/.test(error.message),
  );
  assert.deepEqual(await queue.listQueuedMessages(), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('pending tells expose an existing sender-to-target lane before another is sent', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-lane-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?lane=${Date.now()}`);
  const target = await liveTarget(t, 'queue_lane_target');
  const first = await queue.enqueueMessage(target, 'one authoritative instruction', 'tell', 'machine_settings');
  await queue.enqueueMessage(target, 'another sender is a separate lane', 'tell', 'coordinator');
  await queue.enqueueMessage(target, 'owner notice is not this sender lane', 'owner');
  assert.deepEqual(
    (await queue.pendingTellsFrom('machine_settings', target)).map((item) => item.id),
    [first.id],
  );
  assert.equal((await queue.pendingTellsFrom('coordinator', target)).length, 1);
  await fs.rm(root, { recursive: true, force: true });
});

test('accepted mail binds to the target instance and a reused name cannot receive it', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  const ownName = await liveTarget(t, 'queue_instance_target');
  const item = await queue.enqueueMessage(ownName, 'do not deliver this test message', 'house');
  assert.ok(item.target_key && item.target_key !== ownName, 'the live session birth key is stored');
  item.target_key = `${item.target_key}-dead-predecessor`;
  await fs.writeFile(path.join(root, `${item.id}.json`), JSON.stringify(item));
  const missing = await queue.attemptMessage(item.id, 'safe');
  assert.equal(missing?.state, 'target_missing');
  assert.equal(missing?.attempts, 0);
  assert.match(missing?.reason ?? '', /different session/);
  assert.equal(await queue.dismissMessage(item.id), true);
  await fs.rm(root, { recursive: true, force: true });
});

test('expired and pre-instance retained mail is reaped because the queue is transport', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  const base = {
    id: '00000000-0000-0000-0000-000000000001', from: 'Agent', target: 'old', text: 'old',
    source: 'tell', state: 'stuck', reason: 'busy', attempts: 0,
    created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
  };
  await fs.writeFile(path.join(root, `${base.id}.json`), JSON.stringify({ ...base, target_key: 'old-1', expires_at: '2020-01-03T00:00:00.000Z' }));
  const legacyId = '00000000-0000-0000-0000-000000000002';
  await fs.writeFile(path.join(root, `${legacyId}.json`), JSON.stringify({ ...base, id: legacyId }));
  assert.deepEqual(await queue.listQueuedMessages(), []);
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.endsWith('.json')), []);
  await fs.rm(root, { recursive: true, force: true });
});
