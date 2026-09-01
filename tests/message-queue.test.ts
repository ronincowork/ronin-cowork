import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('a missing target is retained as a failed inbound message, then dismisses', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?test=${Date.now()}`);
  const item = await queue.enqueueMessage('definitely_missing_session', 'hello', 'tell');
  assert.equal((await queue.listQueuedMessages()).length, 1);
  const failed = await queue.attemptMessage(item.id, 'safe');
  assert.equal(failed?.state, 'failed');
  assert.match(failed?.reason ?? '', /does not exist/);
  assert.equal(await queue.dismissMessage(item.id), true);
  assert.deepEqual(await queue.listQueuedMessages(), []);
  await fs.rm(root, { recursive: true, force: true });
});
