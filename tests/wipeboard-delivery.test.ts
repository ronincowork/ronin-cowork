import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const repo = path.resolve(import.meta.dirname, '..');

test('a wipeboard notice uses direct delivery and submits on an isolated Codex-style pane', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wipeboard-delivery-'));
  const server = await openTestServer('wipeboard_delivery', { onPath: true });
  const queueDirBefore = process.env.RONIN_MESSAGE_QUEUE_DIR;
  process.env.RONIN_MESSAGE_QUEUE_DIR = path.join(root, 'queue');
  const prompt = 'printf "› \\033[2mAsk Codex\\033[0m"; while IFS= read -r line; do printf "\\nSUBMITTED:%s\\n› \\033[2mAsk Codex\\033[0m" "$line"; done';
  await server.run('new-session', '-d', '-s', 'board_notice_target', '/bin/bash', '-c', prompt);
  t.after(async () => {
    await closeTestServer(server); // the server, not only the session: no leftover to reap
    await fs.rm(root, { recursive: true, force: true });
    if (queueDirBefore === undefined) delete process.env.RONIN_MESSAGE_QUEUE_DIR; else process.env.RONIN_MESSAGE_QUEUE_DIR = queueDirBefore;
  });

  const queue = await import(`../src/message-queue.ts?board=${Date.now()}`);
  const notice = 'WIPEBOARD team — @sender posted. Run: tejun-wipeboard';
  assert.equal(await queue.deliverMessage('board_notice_target', notice, 'wipeboard_notice'), null);
  const stdout = await server.run('capture-pane', '-p', '-t', '=board_notice_target:');
  assert.match(stdout, new RegExp(`SUBMITTED:${notice}`));

  const direct = await fs.readFile(path.join(repo, 'src/commands/message.ts'), 'utf8');
  const board = await fs.readFile(path.join(repo, 'src/commands/wipeboard.ts'), 'utf8');
  assert.match(direct, /deliverMessage\(target, text, source/);
  assert.match(board, /deliverMessage\(session, message, 'wipeboard_notice'\)/);
  assert.doesNotMatch(board, /message-cli/);
});
