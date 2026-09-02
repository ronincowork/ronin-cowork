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
  assert.equal(item.from, 'Agent');
  assert.equal((await queue.listQueuedMessages()).length, 1);
  const failed = await queue.attemptMessage(item.id, 'safe');
  assert.equal(failed?.state, 'failed');
  assert.equal(failed?.attempts, 0, 'an eligibility failure is not a delivery attempt');
  assert.match(failed?.reason ?? '', /does not exist/);
  assert.equal(await queue.dismissMessage(item.id), true);
  assert.deepEqual(await queue.listQueuedMessages(), []);
  await fs.rm(root, { recursive: true, force: true });
});

test('pending tells expose an existing sender-to-target lane before another is sent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-message-queue-lane-'));
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  const queue = await import(`../src/message-queue.ts?lane=${Date.now()}`);
  const first = await queue.enqueueMessage('worktrees_roots', 'one authoritative instruction', 'tell', 'machine_settings');
  await queue.enqueueMessage('worktrees_matrix', 'a separate lane', 'tell', 'machine_settings');
  await queue.enqueueMessage('worktrees_roots', 'owner notice is not this sender lane', 'owner');
  assert.deepEqual(
    (await queue.pendingTellsFrom('machine_settings', 'worktrees_roots')).map((item) => item.id),
    [first.id],
  );
  assert.deepEqual(await queue.pendingTellsFrom('coordinator', 'worktrees_roots'), []);
  await fs.rm(root, { recursive: true, force: true });
});
