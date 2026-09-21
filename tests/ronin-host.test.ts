import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const command = path.join(root, 'ronin_bin', 'ronin-host');
const retired = ['tejun-survey', 'tejun-account', 'tejun-secrets', 'tejun-machine-restart'];
const exec = promisify(execFile);

test('ronin-host is the sole public host command and advertises its fixed vocabulary', async () => {
  await access(command);
  const source = await readFile(command, 'utf8');
  for (const subcommand of ['inspect', 'account', 'secrets', 'restart']) {
    assert.match(source, new RegExp(`^  ${subcommand}\\)`, 'm'));
  }
  assert.doesNotMatch(source, /systemctl.*\$|exec .*\$1/, 'dispatch cannot select an arbitrary operation');
  for (const name of retired) {
    await assert.rejects(access(path.join(root, 'ronin_bin', name)), `${name} must not exist, even as an alias`);
  }
});

test('restart uses the installed macOS LaunchAgent and observes its running pid', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ronin-launchd-restart-'));
  try {
    const bin = path.join(dir, 'bin');
    const agents = path.join(dir, 'Library', 'LaunchAgents');
    await mkdir(bin); await mkdir(agents, { recursive: true });
    await writeFile(path.join(agents, 'com.ronin.plist'), '<plist/>');
    await writeFile(path.join(bin, 'uname'), '#!/bin/sh\necho Darwin\n');
    await writeFile(path.join(bin, 'launchctl'), '#!/bin/sh\ncase "$1" in\n  print) case "$2" in */com.ronin) echo "pid = 12345";; *) exit 1;; esac;;\n  kickstart) printf "%s\\n" "$*" >> "$RONIN_TEST_LOG";;\nesac\n');
    await chmod(path.join(bin, 'uname'), 0o755);
    await chmod(path.join(bin, 'launchctl'), 0o755);
    const log = path.join(dir, 'calls');
    const env = { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}`, RONIN_TEST_LOG: log };
    const result = await exec(command, ['restart'], { env });
    assert.match(result.stdout, /OK: com\.ronin is running \(pid 12345\)/);
    assert.equal(await readFile(log, 'utf8'), `kickstart -k gui/${process.getuid?.()}/com.ronin\n`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
