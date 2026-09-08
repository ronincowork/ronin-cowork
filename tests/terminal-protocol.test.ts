import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import pty from '@lydell/node-pty';
import { closeTestServer, openTestServer } from './helpers/testserver.js';
import {
  DeviceAttributesResponder,
  PRIMARY_DEVICE_ATTRIBUTES,
  SECONDARY_DEVICE_ATTRIBUTES,
} from '../src/terminal-protocol.js';
import { tileInputAction } from '../src/viewer.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('DA responder recognizes split attach queries without changing output', () => {
  const replies: string[] = [];
  const responder = new DeviceAttributesResponder((data) => replies.push(data));
  responder.feed('before\x1b');
  responder.feed('[c between \x1b[>');
  responder.feed('c after');
  assert.deepEqual(replies, [PRIMARY_DEVICE_ATTRIBUTES, SECONDARY_DEVICE_ATTRIBUTES]);
});

test('DA responder ignores near matches and answers each exact attach query only once', () => {
  const replies: string[] = [];
  const responder = new DeviceAttributesResponder((data) => replies.push(data));
  responder.feed('\x1b[>noise-c\x1b[0c\x1b[?c');
  assert.deepEqual(replies, []);
  responder.feed('\x1b[>c\x1b[>c\x1b[c\x1b[c');
  assert.deepEqual(replies, [SECONDARY_DEVICE_ATTRIBUTES, PRIMARY_DEVICE_ATTRIBUTES]);
  responder.feed(`application output ${'\x1b[>c'} ${'\x1b[c'}`);
  assert.deepEqual(replies, [SECONDARY_DEVICE_ATTRIBUTES, PRIMARY_DEVICE_ATTRIBUTES]);
});

test('DA responder disarms at the attach deadline even if only one query arrived', () => {
  let clock = 1_000;
  const replies: string[] = [];
  const responder = new DeviceAttributesResponder((data) => replies.push(data), () => clock, 5_000);
  responder.feed('\x1b[c');
  clock += 5_001;
  responder.feed('\x1b[>c');
  assert.deepEqual(replies, [PRIMARY_DEVICE_ATTRIBUTES]);
});

test('isolated tmux receives DA immediately and cannot type a browser-late DA2 into the pane', { timeout: 12_000 }, async () => {
  const name = `da2_${process.pid}`;
  const server = await openTestServer(name);
  const received = path.join(server.root, 'pane-input');
  let terminal: ReturnType<typeof pty.spawn> | undefined;
  try {
    await server.run('new-session', '-d', '-s', 'target', '--', 'sh', '-c', `stty raw -echo; exec cat > '${received}'`);
    const env = { ...process.env, TERM: 'xterm-256color' };
    delete env.TMUX;
    delete env.TMUX_PANE;
    terminal = pty.spawn(server.tmux, ['attach', '-t', 'target'], { name: 'xterm-256color', cols: 80, rows: 24, env });
    const attachedAt = Date.now();
    let sawDa2!: (elapsed: number) => void;
    const da2Answered = new Promise<number>((resolve) => { sawDa2 = resolve; });
    const responder = new DeviceAttributesResponder((reply) => {
      terminal?.write(reply);
      if (reply === SECONDARY_DEVICE_ATTRIBUTES) sawDa2(Date.now() - attachedAt);
    });
    terminal.onData((data) => responder.feed(data));

    const answerDelay = await Promise.race([da2Answered, wait(2_000).then(() => -1)]);
    assert.ok(answerDelay >= 0 && answerDelay < 2_000, `DA2 was not answered immediately (${answerDelay}ms)`);
    // Cross tmux's five-second terminal-query deadline. With browser-owned DA this is
    // where a throttled reply became pane input; the server has already answered it.
    await wait(5_100);
    terminal.write('X');
    await wait(200);
    assert.equal(await fs.readFile(received, 'utf8'), 'X');
  } finally {
    terminal?.kill();
    await closeTestServer(server);
  }
});

test('isolated tmux exits drag-entered copy mode when Ronin forwards the release', { timeout: 5_000 }, async () => {
  const name = `drag_${process.pid}`;
  const server = await openTestServer(name);
  let terminal: ReturnType<typeof pty.spawn> | undefined;
  try {
    await server.run('new-session', '-d', '-s', 'target', '--', 'cat');
    await server.run('set-option', '-t', 'target', 'mouse', 'on');
    const env = { ...process.env, TERM: 'xterm-256color' };
    delete env.TMUX;
    delete env.TMUX_PANE;
    terminal = pty.spawn(server.tmux, ['attach', '-t', 'target'], { name: 'xterm-256color', cols: 80, rows: 24, env });
    const responder = new DeviceAttributesResponder((reply) => terminal?.write(reply));
    terminal.onData((data) => responder.feed(data));
    await wait(250);

    terminal.write('\x1b[<0;1;1M');
    terminal.write('\x1b[<32;2;1M');
    await wait(150);
    assert.equal(await server.run('display-message', '-p', '-t', 'target', '#{pane_in_mode}'), '1');

    const release = '\x1b[<0;2;1m';
    assert.equal(tileInputAction({ inMode: true, appWantsMouse: false }, release), 'write');
    terminal.write(release);
    await wait(150);
    assert.equal(await server.run('display-message', '-p', '-t', 'target', '#{pane_in_mode}'), '0');
  } finally {
    terminal?.kill();
    await closeTestServer(server);
  }
});
