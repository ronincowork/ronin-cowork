import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* A SERVER STARTED FROM deploy/tmux-server.conf — the file the tmux-server unit uses on
 * every install — scrolls a tile through copy-mode with the indicator hidden and has no
 * jump / search / goto / repeat key inside copy-mode (owner, 2026-09-02: "it's like the
 * scroll mode wants to jump to different sections"). Isolated server, short socket root. */

const exec = promisify(execFile);
const TMUX = '/usr/bin/tmux';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await fs.mkdtemp('/tmp/rc-');
const env = { ...process.env, TMUX_TMPDIR: root } as Record<string, string>;
delete env.TMUX; delete env.TMUX_PANE; delete env.HOME_TMUX_CONF;
const tmux = (...args: string[]) => exec(TMUX, args, { env }).then((r) => r.stdout.trim());
// A HOME with no ~/.tmux.conf, so the assertions are about our file alone.
env.HOME = root;
await exec(TMUX, ['-f', path.join(repo, 'deploy', 'tmux-server.conf'), 'start-server'], { env });
await tmux('new-session', '-d', '-s', 'probe');

test('the wheel enters copy-mode with the indicator hidden and exit-at-bottom kept', async () => {
  const wheel = await tmux('list-keys', '-T', 'root').then((s) => s.split('\n').find((l) => /WheelUpPane/.test(l)) ?? '');
  assert.match(wheel, /copy-mode -eH/, wheel);
});

test('no jump, search, goto or repeat key remains in either copy-mode table', async () => {
  for (const table of ['copy-mode', 'copy-mode-vi']) {
    const keys = await tmux('list-keys', '-T', table);
    assert.doesNotMatch(keys, /jump|search|goto-line|\(repeat\)/, `${table} still binds a prompt`);
  }
});

test('the keys that scroll are untouched', async () => {
  const keys = await tmux('list-keys', '-T', 'copy-mode');
  for (const cmd of ['scroll-up', 'scroll-down', 'page-up', 'page-down', 'cursor-up', 'cursor-down', 'cancel']) {
    assert.match(keys, new RegExp(`-X ${cmd}\\b`), `copy-mode lost ${cmd}`);
  }
  assert.match(keys, /WheelUpPane/, 'wheel scrolls inside copy-mode');
  assert.match(keys, /WheelDownPane/, 'wheel scrolls inside copy-mode');
});

test('the server unit setting the file exists for is still there', async () => {
  assert.equal(await tmux('show-options', '-s', '-v', 'exit-empty'), 'off');
});

test.after(async () => {
  await tmux('kill-server').catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
});
