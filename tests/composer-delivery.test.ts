import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { openTestServer, closeTestServer } from './helpers/testserver.js';

test('one Ronin box request submits even if copy mode reopens after the paste', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-composer-delivery-'));
  const server = await openTestServer('composer_delivery', { onPath: true });
  const previous = process.env.RONIN_MESSAGE_QUEUE_DIR;
  process.env.RONIN_MESSAGE_QUEUE_DIR = root;
  t.after(async () => {
    await closeTestServer(server);
    await fs.rm(root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.RONIN_MESSAGE_QUEUE_DIR;
    else process.env.RONIN_MESSAGE_QUEUE_DIR = previous;
  });
  const prompt = 'printf "› \\033[2mAsk\\033[0m"; while IFS= read -r line; do printf "\\nSUBMITTED:%s\\n› \\033[2mAsk\\033[0m" "$line"; done';
  await server.run('new-session', '-d', '-s', 'composer_target', '/bin/bash', '-c', prompt);
  await server.run('copy-mode', '-t', '=composer_target:');
  const { tmux } = await import('../src/tmux-client.js');
  await tmux.connect();
  const run = tmux.run;
  t.after(() => { tmux.run = run; });
  // Another browser can scroll the shared pane during the paste-to-Enter pause.
  tmux.run = async (args, options) => {
    const result = await run.call(tmux, args, options);
    if (args[0] === 'paste-buffer' && args.includes('-p')) await server.run('copy-mode', '-t', '=composer_target:');
    return result;
  };
  const app = express();
  app.use(express.json());
  const { registerMessages } = await import('../src/routes/messages-api.js');
  registerMessages(app);
  const listener = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve) => listener.once('listening', resolve));
  const address = listener.address() as { port: number };
  const reply = await fetch(`http://127.0.0.1:${address.port}/api/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'composer_target', text: 'one press' }),
  });
  assert.equal(reply.status, 200);
  assert.equal((await reply.json()).queued, true);
  // The route accepts one durable request; the one queue worker owns delivery.
  const { processMessageQueue } = await import('../src/message-queue.js');
  await processMessageQueue();
  // The app may paint just after send-keys completes. This is test observation, not
  // production delivery logic: production always ends after the separate Enter.
  let screen = '';
  for (let i = 0; i < 20; i++) {
    screen = await server.run('capture-pane', '-p', '-t', '=composer_target:');
    if (screen.includes('SUBMITTED:one press')) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(screen.match(/SUBMITTED:one press/g)?.length, 1, screen);
  assert.equal(screen.match(/SUBMITTED:From Owner \[Ronin Box\]:/g)?.length, 1, screen);
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/messages`).then((r) => r.json())).messages.length, 0);
  assert.equal(tmux.state(), 'up');
  assert.equal(await server.run('display-message', '-p', '-t', '=composer_target:', '#{pane_in_mode}'), '0',
    'delivery leaves copy mode so the real Enter reaches the application');
});

test('complete messages preserve paste boundaries and one final Enter even when the reader is delayed', async (t) => {
  const server = await openTestServer('composer_paste_boundary', { onPath: true });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-paste-boundary-'));
  t.after(async () => { await closeTestServer(server); await fs.rm(root, { recursive: true, force: true }); });
  const output = path.join(root, 'input');
  const reader = `
    const fs = require('node:fs');
    process.stdin.setRawMode(true);
    process.stdout.write('\x1b[?2004hREADY');
    process.stdin.on('data', data => fs.appendFileSync(${JSON.stringify(output)}, data));
  `;
  await server.run('new-session', '-d', '-s', 'paste_target', process.execPath, '-e', reader);
  for (let i = 0; i < 50; i++) {
    if ((await server.run('capture-pane', '-p', '-t', '=paste_target:')).includes('READY')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(await server.run('capture-pane', '-p', '-t', '=paste_target:'), /READY/);
  const pid = Number(await server.run('display-message', '-p', '-t', '=paste_target:', '#{pane_pid}'));
  // Both writes can be waiting in the PTY when an Agent resumes processing input.
  process.kill(pid, 'SIGSTOP');
  const { deliverForce } = await import('../src/send.js');
  const text = "first line\nsecond line — 日本語 'quoted'";
  try { assert.equal((await deliverForce('paste_target', text)).delivered, true); }
  finally { process.kill(pid, 'SIGCONT'); }
  let received = '';
  for (let i = 0; i < 50; i++) {
    received = await fs.readFile(output, 'utf8').catch(() => '');
    if (received.endsWith('\r')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(received, `\x1b[200~${text}\x1b[201~\r`);
  assert.equal(await server.run('list-buffers', '-F', '#{buffer_name}'), '');
});
