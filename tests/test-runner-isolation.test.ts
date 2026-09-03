import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const repo = path.resolve(import.meta.dirname, '..');

test('importing the server under the unit runner never publishes operator options', async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-index-isolation-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const log = path.join(fixture, 'tmux.log');
  const tmux = path.join(fixture, 'tmux');
  await fs.writeFile(tmux, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RONIN_TMUX_LOG"\nexit 1\n', { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${fixture}:${process.env.PATH ?? ''}`,
    BIND: '127.0.0.1',
    RONIN_TEST_RUNNER: '1',
    RONIN_TMUX_LOG: log,
    TMUX_TMPDIR: path.join(fixture, 't'),
  };
  delete env.TMUX;
  delete env.TMUX_PANE;

  await exec(process.execPath, ['--import', 'tsx', '--eval', "await import('./src/index.ts')"], { cwd: repo, env });
  const calls = await fs.readFile(log, 'utf8').catch(() => '');
  assert.doesNotMatch(calls, /set-option .*@ronin-(?:url|cli-token)/);
});
