#!/usr/bin/env node
// The two guards (docs/development/verification.md): every tests/*.test.ts, side by side,
// under private roots. Each file boots its own Ronin on its own tmux server
// (tests/helpers/ronin.ts); nothing here may reach the live server, the live stores or the
// operator socket this shell was told, so all of those are cleared first.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.ts')).map((f) => path.join('tests', f));
// Under /tmp, not the caller's TMPDIR: a Unix socket path is capped at 107 bytes.
const scratch = fs.mkdtempSync('/tmp/ronin-tests-');
const env = { ...process.env, HOME: scratch, TMPDIR: scratch, TMUX_TMPDIR: scratch, RONIN_USER_ROOT: path.join(scratch, 'user'), RONIN_DATA_ROOT: path.join(scratch, 'data') };
for (const key of ['TMUX', 'TMUX_PANE', 'RONIN_SOCKET', 'RONIN_URL', 'RONIN_CLI_TOKEN', 'RONIN_AUTH']) delete env[key];

const livePid = () => process.env.TMUX ? spawnSync('tmux', ['display-message', '-p', '#{pid}'], { encoding: 'utf8' }).stdout.trim() : '';
const before = livePid();
const run = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=2', ...files], { cwd: ROOT, env, stdio: 'inherit' });
fs.rmSync(scratch, { recursive: true, force: true });
if (before && livePid() !== before) {
  console.error(`FAILED — the live tmux server changed (pid ${before}); a test reached it.`);
  process.exit(1);
}
process.exit(run.status ?? 1);
