import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* The start-only file may keep the server alive, but coexistence means it must preserve
 * the owner's key tables. Tile input is suppressed in src/viewer.ts, not by global unbinds. */

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

test('the start-only config does not rewrite global key tables', async () => {
  const source = await fs.readFile(path.join(repo, 'deploy', 'tmux-server.conf'), 'utf8');
  assert.doesNotMatch(source, /^(?:bind-key|unbind-key)\b/m);
});

test('the server unit setting the file exists for is still there', async () => {
  assert.equal(await tmux('show-options', '-s', '-v', 'exit-empty'), 'off');
});

test.after(async () => {
  await tmux('kill-server').catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
});
