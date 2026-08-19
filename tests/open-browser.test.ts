import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const helper = path.resolve('libexec/ronin-open-browser');

function fixture(osName: 'Linux' | 'Darwin') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-open-browser-'));
  const calls = path.join(dir, 'calls');
  const command = (name: string, body: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  command('uname', `printf '%s\\n' '${osName}'`);
  command('id', `printf '%s\\n' '501'`);
  command('launchctl', 'exit 0');
  command('xdg-open', `printf 'xdg:%s\\n' "$1" >> "${calls}"; exit 0`);
  command('gio', `printf 'gio:%s:%s\\n' "$1" "$2" >> "${calls}"; exit 0`);
  command('open', `printf 'open:%s\\n' "$1" >> "${calls}"; exit 0`);
  return { dir, calls };
}

function run(dir: string, extra: NodeJS.ProcessEnv = {}) {
  execFileSync('bash', [helper, 'http://127.0.0.1:3006'], {
    env: { PATH: `${dir}:/usr/bin:/bin`, ...extra },
  });
}

test('Linux opens on a graphical local session', () => {
  const f = fixture('Linux');
  run(f.dir, { DISPLAY: ':0' });
  assert.equal(fs.readFileSync(f.calls, 'utf8'), 'xdg:http://127.0.0.1:3006\n');
});

test('Linux skips headless and SSH sessions', () => {
  for (const extra of [{}, { DISPLAY: ':0', SSH_CONNECTION: 'client server' }]) {
    const f = fixture('Linux');
    run(f.dir, extra);
    assert.equal(fs.existsSync(f.calls), false);
  }
});

test('macOS opens only with a local GUI session', () => {
  const f = fixture('Darwin');
  run(f.dir);
  assert.equal(fs.readFileSync(f.calls, 'utf8'), 'open:http://127.0.0.1:3006\n');
});
