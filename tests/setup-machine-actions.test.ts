import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const helper = new URL('../libexec/ronin-machine-apply', import.meta.url).pathname;

async function command(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  await writeFile(file, `#!/bin/sh\n${body}\n`);
  await chmod(file, 0o755);
}

test('machine setup asks once and crosses sudo exactly once for all actions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-'));
  const tty = path.join(dir, 'tty');
  const trace = path.join(dir, 'sudo.trace');
  const serveTrace = path.join(dir, 'serve.trace');
  await writeFile(tty, 'yes\n');
  await command(dir, 'sudo', `printf '%s\\n' "$*" >> "$RONIN_SUDO_TRACE"; exec "$@"`);
  await command(dir, 'id', 'exit 0');
  await command(dir, 'loginctl', '[ "$1" = show-user ] && echo yes; exit 0');
  await command(dir, 'tailscale', `printf '%s\n' "$*" >> "$RONIN_SERVE_TRACE"; exit 0`);

  const { stdout } = await exec(helper, [
    '--linger', 'owner', '--serve', '100.84.187.69', '4810',
  ], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RONIN_SETUP_TTY: tty, RONIN_SUDO_TRACE: trace, RONIN_SERVE_TRACE: serveTrace } });

  assert.match(stdout, /Continue\? \[y\/N\]/);
  assert.match(stdout, /keep running after owner logs out/);
  assert.match(stdout, /Tailscale HTTPS now serves Ronin/);
  assert.equal((await readFile(trace, 'utf8')).trim(), 'bash -s -- owner 100.84.187.69 4810 0');
  assert.equal((await readFile(serveTrace, 'utf8')).trim(), 'serve --bg --https=4810 http://100.84.187.69:4810');
});

test('declining stops before sudo', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-no-'));
  const tty = path.join(dir, 'tty');
  const marker = path.join(dir, 'sudo-ran');
  await writeFile(tty, 'no\n');
  await command(dir, 'sudo', `touch "$RONIN_SUDO_MARKER"`);

  await assert.rejects(
    exec(helper, ['--linger', 'owner'], {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RONIN_SETUP_TTY: tty, RONIN_SUDO_MARKER: marker },
    }),
    (error: any) => error.code === 2 && /cancelled before Ronin was activated/.test(error.stdout),
  );
  await assert.rejects(readFile(marker));
});

test('Tailscale HTTPS failure leaves local installation available', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-partial-'));
  const tty = path.join(dir, 'tty');
  await writeFile(tty, 'yes\n');
  await command(dir, 'sudo', 'exec "$@"');
  await command(dir, 'id', 'exit 0');
  await command(dir, 'loginctl', '[ "$1" = show-user ] && echo yes; exit 0');
  await command(dir, 'tailscale', 'exit 1');

  const { stdout } = await exec(helper, ['--linger', 'owner', '--serve', '100.84.187.69', '4810'], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RONIN_SETUP_TTY: tty },
  });
  assert.match(stdout, /Tailscale HTTPS was not configured/);
  assert.match(stdout, /still offer local HTTP access/);
});

test('an optional linger failure is retained as a warning without blocking activation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-machine-linger-'));
  const tty = path.join(dir, 'tty');
  const result = path.join(dir, 'machine.result');
  await writeFile(tty, 'yes\n');
  await command(dir, 'sudo', 'exec "$@"');
  await command(dir, 'id', 'exit 1');
  await command(dir, 'loginctl', 'exit 1');

  const { stdout } = await exec(helper, ['--linger', 'owner'], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, RONIN_SETUP_TTY: tty, RONIN_MACHINE_RESULT: result },
  });

  assert.match(stdout, /could not keep Ronin running after logout/);
  assert.match(stdout, /continue using the machine settings that did succeed/);
  assert.equal((await readFile(result, 'utf8')).trim(), 'warning');
});

test('nothing outstanding neither prompts nor invokes sudo', async () => {
  const { stdout } = await exec(helper, []);
  assert.equal(stdout, '');
});
