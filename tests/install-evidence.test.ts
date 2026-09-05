import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('doctor follows the release-layout .env symlink when checking its mode', async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-doctor-release-'));
  const home = path.join(fixture, 'home');
  const release = path.join(home, 'releases', 'x');
  await fs.mkdir(path.join(release, 'bin'), { recursive: true });
  await fs.cp(new URL('../bin/ronin-doctor', import.meta.url), path.join(release, 'bin', 'ronin-doctor'));
  await fs.cp(new URL('../libexec', import.meta.url), path.join(release, 'libexec'), { recursive: true });
  await fs.writeFile(path.join(home, '.env'), 'BIND=127.0.0.1\n', { mode: 0o600 });
  await fs.symlink('../../.env', path.join(release, '.env'));

  let stdout = '';
  try {
    ({ stdout } = await exec('bash', [path.join(release, 'bin', 'ronin-doctor')], {
      env: { ...process.env, HOME: path.join(fixture, 'user-home') },
      timeout: 20_000,
    }));
  } catch (error: any) {
    stdout = error.stdout ?? '';
  }
  assert.match(stdout, /ok\s+— \.env is owner-only \(mode 600\)/);
});
