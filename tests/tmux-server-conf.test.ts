import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

/* The start-only file may keep the server alive, but coexistence means it must preserve
 * the owner's key tables. Tile input is suppressed in src/viewer.ts, not by global unbinds.
 * A test server started FROM deploy/tmux-server.conf, under a HOME with no ~/.tmux.conf so
 * the assertions are about our file alone. */

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-conf-home-'));
const server = await openTestServer('server_conf', { conf: path.join(repo, 'deploy', 'tmux-server.conf'), env: { HOME: home } });
const tmux = server.run;
await tmux('new-session', '-d', '-s', 'probe');
after(async () => {
  await closeTestServer(server);
  await fs.rm(home, { recursive: true, force: true });
});

test('the tile\'s own copy-mode commands work on this server and leave every key table byte-identical', async () => {
  const tables = async () => {
    const out: string[] = [];
    for (const table of ['root', 'copy-mode', 'copy-mode-vi']) out.push(await tmux('list-keys', '-T', table));
    return out.join('\n');
  };
  const before = await tables();
  const pane = 'probe:0.0';
  await tmux('copy-mode', '-eH', '-t', pane); // what src/viewer.ts enterCopyMode issues
  assert.equal((await tmux('display-message', '-p', '-t', pane, '#{pane_in_mode}')).trim(), '1');
  await tmux('send-keys', '-t', pane, '-X', '-N', '5', 'scroll-up'); // scrollCopyMode
  await tmux('send-keys', '-t', pane, '-X', 'cancel'); // jumpToBottom
  assert.equal((await tmux('display-message', '-p', '-t', pane, '#{pane_in_mode}')).trim(), '0');
  assert.equal(await tables(), before, 'a table changed: the tile is driving copy mode through bindings');
});

test('the start-only config does not rewrite global key tables', async () => {
  const source = await fs.readFile(path.join(repo, 'deploy', 'tmux-server.conf'), 'utf8');
  assert.doesNotMatch(source, /^(?:bind-key|unbind-key)\b/m);
});

test('the server unit setting the file exists for is still there', async () => {
  assert.equal(await tmux('show-options', '-s', '-v', 'exit-empty'), 'off');
});
