import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const repo = path.resolve(import.meta.dirname, '..');
const shim = path.join(repo, 'bin', 'shim', 'systemctl');

test('projected and checkout spellings of the systemctl shim resolve to one file and never recurse', async (t) => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-systemctl-shim-'));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const projected = path.join(fixture, 'projected');
  const host = path.join(fixture, 'host');
  await fs.mkdir(projected);
  await fs.mkdir(host);
  await fs.symlink(shim, path.join(projected, 'systemctl'));
  await fs.writeFile(path.join(host, 'systemctl'), '#!/bin/sh\nprintf "real:%s\\n" "$*"\n', { mode: 0o755 });

  const result = await exec(path.join(projected, 'systemctl'), ['--user', 'cat', 'ronin.service'], {
    env: { ...process.env, PATH: `${projected}:${path.dirname(shim)}:${host}:/usr/bin:/bin` },
    timeout: 2_000,
  });
  assert.equal(result.stdout.trim(), 'real:--user cat ronin.service');
});
