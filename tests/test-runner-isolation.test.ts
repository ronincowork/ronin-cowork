import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
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

test('a scratch entry point inherited from a tmux pane never publishes its address', async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-index-scratch-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const log = path.join(fixture, 'tmux.log');
  const tmux = path.join(fixture, 'tmux');
  await fs.writeFile(tmux, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RONIN_TMUX_LOG"\nexit 1\n', { mode: 0o755 });
  const env = {
    ...process.env,
    PATH: `${fixture}:${process.env.PATH ?? ''}`,
    BIND: '127.0.0.1',
    PORT: '0',
    NODE_ENV: 'development',
    RONIN_TMUX_LOG: log,
    TMUX: '/tmp/tmux-live/default,1,0',
    TMUX_PANE: '%1',
  };
  delete env.RONIN_TEST_RUNNER;

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: repo,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('scratch server did not start')), 5_000);
    const inspect = (chunk: Buffer) => {
      if (!chunk.toString().includes('[tmux-ronin] listening on')) return;
      clearTimeout(timer);
      resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`scratch server exited before listening (${code})`));
    });
  });
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  const calls = await fs.readFile(log, 'utf8').catch(() => '');
  assert.doesNotMatch(calls, /set-option .*@ronin-(?:url|cli-token)/);
});
