import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const repo = path.resolve(import.meta.dirname, '..');

test('a wipeboard notice uses direct delivery and submits on an isolated Codex-style pane', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-wipeboard-delivery-'));
  const before = { tmux: process.env.TMUX, pane: process.env.TMUX_PANE, tmpdir: process.env.TMUX_TMPDIR, queue: process.env.RONIN_MESSAGE_QUEUE_DIR };
  const env = { ...process.env, TMUX_TMPDIR: root };
  delete env.TMUX;
  delete env.TMUX_PANE;
  const prompt = 'printf "› \\033[2mAsk Codex\\033[0m"; while IFS= read -r line; do printf "\\nSUBMITTED:%s\\n› \\033[2mAsk Codex\\033[0m" "$line"; done';
  await exec('/usr/bin/tmux', ['new-session', '-d', '-s', 'board_notice_target', '/bin/bash', '-c', prompt], { env });
  process.env.TMUX_TMPDIR = root;
  process.env.RONIN_MESSAGE_QUEUE_DIR = path.join(root, 'queue');
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
  t.after(async () => {
    await exec('/usr/bin/tmux', ['kill-session', '-t', '=board_notice_target'], { env }).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(before)) {
      const envKey = key === 'tmux' ? 'TMUX' : key === 'pane' ? 'TMUX_PANE' : key === 'tmpdir' ? 'TMUX_TMPDIR' : 'RONIN_MESSAGE_QUEUE_DIR';
      if (value === undefined) delete process.env[envKey]; else process.env[envKey] = value;
    }
  });

  const queue = await import(`../src/message-queue.ts?board=${Date.now()}`);
  const notice = 'WIPEBOARD team — @sender posted. Run: tejun-wipeboard';
  assert.equal(await queue.deliverMessage('board_notice_target', notice, 'wipeboard_notice'), null);
  const { stdout } = await exec('/usr/bin/tmux', ['capture-pane', '-p', '-t', '=board_notice_target:'], { env });
  assert.match(stdout, new RegExp(`SUBMITTED:${notice}`));

  const direct = await fs.readFile(path.join(repo, 'src/commands/message.ts'), 'utf8');
  const board = await fs.readFile(path.join(repo, 'src/commands/wipeboard.ts'), 'utf8');
  assert.match(direct, /deliverMessage\(target, text, source/);
  assert.match(board, /deliverMessage\(session, message, 'wipeboard_notice'\)/);
  assert.doesNotMatch(board, /message-cli/);
});
