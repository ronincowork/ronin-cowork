import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openTestServer, closeTestServer } from './helpers/testserver.js';

const updater = fs.readFileSync('bin/ronin-update', 'utf8');
const lifecycle = updater.slice(updater.indexOf('CANDIDATE_PID=""'), updater.indexOf('# Which package this run moves:'));
const gate = updater.slice(updater.indexOf('# --- gate the CANDIDATE'), updater.indexOf('# A public install is one uninterrupted journey.'));

test('the updater scratch root leaves room for its actual macOS candidate tmux socket', () => {
  assert.match(updater, /# --- install ---\n(?:#[^\n]*\n)*WORK="\$\(mktemp -d \/tmp\/ronin\.XXXXXX\)"/);
  assert.match(gate, /RONIN_TESTSERVER_ROOT="\$WORK\/tmux" "\$TARGET\/bin\/ronin-testserver" open "\$CANDIDATE_SERVER"/);
  const longestCandidateSocket = `/tmp/ronin.${'X'.repeat(6)}/tmux/candidate/tmux-${'9'.repeat(20)}/candidate`;
  assert.ok(Buffer.byteLength(longestCandidateSocket) < 104, `${longestCandidateSocket} must fit macOS sockaddr_un.sun_path`);
});

for (const fail of [false, true]) {
  test(`candidate ${fail ? 'failure' : 'success'} closes its server and preserves an existing server`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
    const existing = await openTestServer(`candidate-existing-${fail ? 'fail' : 'pass'}`);
    t.after(async () => { await closeTestServer(existing); fs.rmSync(root, { recursive: true, force: true }); });
    await existing.run('new-session', '-d', '-s', 'keep', 'sleep 60');
    const target = `${root}/release`;
    for (const dir of ['release/bin', 'commands', 'work']) fs.mkdirSync(`${root}/${dir}`, { recursive: true });
    fs.copyFileSync('bin/ronin-testserver', `${target}/bin/ronin-testserver`);
    fs.chmodSync(`${target}/bin/ronin-testserver`, 0o755);
    const command = (name: string, body: string) => fs.writeFileSync(`${root}/commands/${name}`, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    command('npm', `
      set -eu
      [ -z "\${TMUX:-}" ] && [ -z "\${TMUX_PANE:-}" ]
      [[ "$(command -v tmux)" == "$WORK/tmux/candidate/tmux" ]]
      [[ "$HOME" == "$WORK/home" ]]
      [[ "$RONIN_DATA_ROOT" == "$WORK/data" && "$RONIN_USER_ROOT" == "$WORK/user" ]]
      tmux new-session -d -s grid_ctl 'sleep 60'
      tmux display-message -p '#{pid}' > "$PROOF"
      exec sleep 60
    `);
    command('curl', `
      [ -f "$PROOF" ] || exit 1
      case "\${*: -1}" in
        */api/version) printf '%s' '{"release":"${fail ? 'wrong' : 'v9.9.9'}"}' ;;
      esac
    `);
    const script = `${lifecycle}\nsay() { :; }\nfail() { echo "$1" >&2; exit 1; }\nrender_check() { return 2; }\n${gate}`;
    const result = spawnSync('bash', ['-ec', script], {
      env: { ...process.env, PATH: `${root}/commands:${process.env.PATH}`, TARGET: target,
        WORK: `${root}/work`, PROOF: `${root}/proof`, VER: 'v9.9.9',
        TMUX: `${existing.socket},${existing.pid},0`, TMUX_PANE: '%0' },
      encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, fail ? 1 : 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(`${root}/proof`), 'candidate reached private tmux and private stores');
    const pid = Number(fs.readFileSync(`${root}/proof`, 'utf8').trim());
    assert.notEqual(pid, existing.pid);
    // A container's PID 1 may retain an exited daemon as a zombie. It must no
    // longer be running, whether or not its parent has reaped it yet.
    const state = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' });
    assert.ok(state.status !== 0 || state.stdout.trim().startsWith('Z'), `candidate server exited: ${state.stdout}\n${result.stdout}\n${result.stderr}`);
    assert.equal(await existing.run('display-message', '-p', '#{pid}'), String(existing.pid));
    assert.equal(await existing.run('has-session', '-t', '=keep'), '');
    assert.equal(fs.existsSync(`${root}/work`), false, 'cleanup ran on both paths');
  });
}
