import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(repo, 'libexec', 'ronin-coexist.sh');

test('units carry provenance and port conflicts stop the restart loop', async () => {
  const ronin = await fs.readFile(path.join(repo, 'deploy', 'ronin.service'), 'utf8');
  const tmux = await fs.readFile(path.join(repo, 'deploy', 'tmux-server.service'), 'utf8');
  assert.match(ronin, /^# X-Ronin-Unit: ronin-cowork\/v1/m);
  assert.match(tmux, /^# X-Ronin-Unit: ronin-cowork\/v1/m);
  assert.match(ronin, /^RestartPreventExitStatus=78$/m);
  assert.doesNotMatch(tmux, /^ExecStartPost=.*exit-empty/m, 'the unit must not mutate an adopted server');
});

test('unit preflight accepts marked and narrow legacy units but refuses a foreign file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-units-'));
  const run = () => exec('bash', ['-c', `. "${helper}"; ronin_preflight_units "$1"`, 'test', root]);
  await run();
  await fs.writeFile(path.join(root, 'ronin.service'), '# X-Ronin-Unit: ronin-cowork/v1\n');
  await fs.writeFile(path.join(root, 'tmux-server.service'), 'RefuseManualStop=yes\nExecStart=/usr/bin/tmux -f /x/tmux-server.conf start-server\n');
  await run();
  await fs.writeFile(path.join(root, 'ronin.service'), '[Service]\nExecStart=/usr/bin/something-else\n');
  await assert.rejects(run(), /not a recognized Ronin unit/);
  await fs.rm(root, { recursive: true, force: true });
});

test('all setup preflight refusals say their reason on fd 3', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-preflight-'));
  const unitDir = path.join(root, 'units'); await fs.mkdir(unitDir);
  await fs.writeFile(path.join(unitDir, 'ronin.service'), '[Service]\nExecStart=/usr/bin/something-else\n');

  const fd3 = async (name: string, body: string, args: string[] = [], env = process.env) => {
    const spoken = path.join(root, `${name}.fd3`);
    await assert.rejects(exec('bash', ['-c', `exec 3>"$1"; . "${helper}"; ronin_say(){ printf '%s\\n' "$*" >&3; }; ${body}`, 'test', spoken, ...args], { env }));
    return fs.readFile(spoken, 'utf8');
  };

  assert.match(await fd3('unit', 'ronin_preflight_units "$2"', [unitDir]), /not a recognized Ronin unit; nothing was overwritten/);

  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  const systemctl = path.join(bin, 'systemctl'); await fs.writeFile(systemctl, '#!/bin/sh\nexit 1\n'); await fs.chmod(systemctl, 0o755);
  const server = net.createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const portRoot = path.join(root, 'port'); await fs.mkdir(portRoot);
  await fs.writeFile(path.join(portRoot, '.env'), `PORT=${address.port}\nBIND=127.0.0.1\n`);
  const portWords = await fd3('port', 'ronin_preflight_port "$2" "$3"', [portRoot, process.execPath], { ...process.env, PATH: `${bin}:${process.env.PATH}` });
  assert.match(portWords, new RegExp(`127\\.0\\.0\\.1:${address.port} is already in use — set PORT or BIND in \\.env`));
  await new Promise<void>((resolve) => server.close(() => resolve()));

  const fake = path.join(root, 'tmux');
  await fs.writeFile(fake, `#!/bin/sh
case "$1" in
  list-sessions) exit 0 ;;
  display-message) case "$*" in *socket_path*) echo /tmp/current.sock;; *version*) echo 3.7c;; *) echo "$TEST_PID";; esac ;;
  show-options) echo on ;;
  -V) echo 'tmux 3.7c' ;;
esac
`);
  await fs.chmod(fake, 0o755);
  const state = path.join(root, 'state'); await fs.mkdir(path.join(state, 'machine'), { recursive: true });
  const leaseWords = await fd3('lease', 'TMUX_BIN="$2"; start=$(ronin_tmux_start_id "$TEST_PID"); printf "v=1\\npid=%s\\nstart=%s\\nsocket=/tmp/other.sock\\nprior=on\\napplied=off\\n" "$TEST_PID" "$start" > "$3/machine/tmux-adoption"; ronin_adopt_tmux "$3"', [fake, state], { ...process.env, TEST_PID: String(process.pid) });
  assert.match(leaseWords, /is still running but is not the server on \/tmp\/current\.sock; leaving both alone/);
  await fs.rm(root, { recursive: true, force: true });
});

test('adoption leases exit-empty once, ignores $TMUX, and uninstall restores or keeps as the evidence says', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-adopt-'));
  const fake = path.join(root, 'tmux');
  // A fake server: its pid and start identity are this process's own, so the helper's
  // liveness check reads a real /proc entry. A pane's $TMUX must never reach it.
  await fs.writeFile(fake, `#!/bin/sh
[ -z "$TMUX" ] || { echo 'the helper followed $TMUX' >&2; exit 99; }
case "$1" in
  list-sessions) exit 0 ;;
  display-message) case "$*" in *socket_path*) echo /tmp/fake.sock;; *version*) echo 3.2a;; *) echo "$FAKE_PID";; esac ;;
  show-options) cat "$FAKE_VALUE" ;;
  set-option) printf '%s' "$4" > "$FAKE_VALUE"; printf '%s' "$4" >> "$FAKE_WRITES" ;;
  -V) echo 'tmux 3.7c' ;;
esac
`);
  await fs.chmod(fake, 0o755);
  const value = path.join(root, 'value');
  const writes = path.join(root, 'writes');
  const lease = path.join(root, 'machine', 'tmux-adoption');
  await fs.writeFile(value, 'on'); await fs.writeFile(writes, '');
  const env = { ...process.env, TMUX: '/tmp/tmux-0/default,1,0', FAKE_PID: String(process.pid), FAKE_VALUE: value, FAKE_WRITES: writes };
  const adopt = () => exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ronin_adopt_tmux "$2"`, 'test', fake, root], { env });
  const restore = () => exec('bash', ['-c', `. "${helper}"; ronin_restore_tmux "$2" "$1"`, 'test', fake, root], { env });

  const first = await adopt();
  assert.match(first.stdout, /adopted \(pid \d+\)/);
  assert.match(first.stdout, /server is tmux 3\.2a and Ronin's client is tmux 3\.7c/, 'version skew is disclosed');
  assert.match(await fs.readFile(lease, 'utf8'), /^prior=on$/m);
  assert.equal(await fs.readFile(value, 'utf8'), 'off');
  await adopt();
  assert.match(await fs.readFile(lease, 'utf8'), /^prior=on$/m, 'rerun keeps the first prior value');

  // the owner changed it after adoption: uninstall keeps their value and the lease
  await fs.writeFile(value, 'on');
  assert.match((await restore()).stdout, /kept tmux exit-empty=on/);
  assert.equal(await fs.readFile(value, 'utf8'), 'on');
  await fs.access(lease);

  // the adopted server was replaced: uninstall touches nothing and says so
  await fs.writeFile(value, 'off');
  const replaced = { ...env, FAKE_PID: '1' };
  const skipped = await exec('bash', ['-c', `. "${helper}"; ronin_restore_tmux "$2" "$1"`, 'test', fake, root], { env: replaced });
  assert.match(skipped.stdout, /server has changed/);
  assert.equal(await fs.readFile(value, 'utf8'), 'off');

  // ordinary uninstall: restored, lease gone
  assert.match((await restore()).stdout, /restored tmux exit-empty=on/);
  assert.equal(await fs.readFile(value, 'utf8'), 'on');
  await assert.rejects(fs.access(lease));
  await fs.rm(root, { recursive: true, force: true });
});

test('a lease whose server is gone (a reboot) is replaced on rerun, never a reason to refuse setup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-release-'));
  const fake = path.join(root, 'tmux');
  await fs.writeFile(fake, `#!/bin/sh
case "$1" in
  list-sessions) exit 0 ;;
  display-message) case "$*" in *socket_path*) echo /tmp/fake.sock;; *version*) echo 3.6;; *) echo "$FAKE_PID";; esac ;;
  show-options) cat "$FAKE_VALUE" ;;
  set-option) printf '%s' "$4" > "$FAKE_VALUE" ;;
  -V) echo 'tmux 3.6' ;;
esac
`);
  await fs.chmod(fake, 0o755);
  const value = path.join(root, 'value');
  const lease = path.join(root, 'machine', 'tmux-adoption');
  await fs.mkdir(path.dirname(lease), { recursive: true });
  // recorded at adoption: a pid that cannot be alive with that start identity any more
  await fs.writeFile(lease, 'v=1\npid=2147483646\nstart=1\nsocket=/tmp/fake.sock\nprior=on\napplied=off\n');
  await fs.writeFile(value, 'off'); // the new server: Ronin's own unit started it with the conf
  const env = { ...process.env, FAKE_PID: String(process.pid), FAKE_VALUE: value };
  const rerun = await exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ronin_adopt_tmux "$2"`, 'test', fake, root], { env });
  assert.match(rerun.stdout, /no longer exists; recording the current one/);
  const fresh = await fs.readFile(lease, 'utf8');
  assert.match(fresh, new RegExp(`^pid=${process.pid}$`, 'm'));
  assert.match(fresh, /^prior=off$/m, 'the new server is recorded as found, not with the dead one\'s value');
  await fs.rm(root, { recursive: true, force: true });
});

test('setup port preflight rejects an unrelated listener with exit 78', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-port-'));
  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  const systemctl = path.join(bin, 'systemctl'); await fs.writeFile(systemctl, '#!/bin/sh\nexit 1\n'); await fs.chmod(systemctl, 0o755);
  const server = net.createServer(); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  await fs.writeFile(path.join(root, '.env'), `PORT=${address.port}\nBIND=127.0.0.1\n`);
  await assert.rejects(
    exec('bash', ['-c', `. "${helper}"; ronin_preflight_port "$1" "$2"`, 'test', root, process.execPath], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }),
    (error: any) => error?.code === 78 && /already in use/.test(error.stderr),
  );
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(root, { recursive: true, force: true });
});

test('the unit refuses to retry exactly the status the runtime exits with on an unusable address', async () => {
  // The handler itself lives with the port work (src/bind-refusal.ts, tested there); this
  // pins the two halves of one contract to the same number.
  const refusal = await fs.readFile(path.join(repo, 'src', 'bind-refusal.ts'), 'utf8');
  const unit = await fs.readFile(path.join(repo, 'deploy', 'ronin.service'), 'utf8');
  const exit = /EXIT_ADDRESS_UNUSABLE = (\d+)/.exec(refusal)?.[1];
  assert.equal(exit, '78');
  assert.match(unit, new RegExp(`^RestartPreventExitStatus=${exit}$`, 'm'));
  const index = await fs.readFile(path.join(repo, 'src', 'index.ts'), 'utf8');
  assert.equal(index.match(/server\.on\('error'/g)?.length, 1, 'one listener error handler, not two');
});

// ---- issue #74: the fresh box ---------------------------------------------------------
// Every fresh VM has no tmux server, and setup must MEASURE that as "none" — never a
// refusal, never a question to the person (owner, 2026-09-09). tmux has two wordings
// for it, chosen by errno; a fake per wording here, and the real binary below.
const noServer = (text: string) => `#!/bin/sh
[ -z "$TMUX" ] || { echo 'the helper followed $TMUX' >&2; exit 99; }
case "$1" in
  list-sessions) echo '${text}' >&2; exit 1 ;;
  -V) echo 'tmux 3.7c' ;;
  *) echo "unexpected $*" >&2; exit 98 ;;
esac
`;

test('a fresh box — no tmux server — is measured as none: setup continues, leases nothing, and names the socket it looked at', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-fresh-'));
  const wordings = [
    'error connecting to /tmp/tmux-1001/default (No such file or directory)', // no socket file at all
    'no server running on /tmp/tmux-1001/default',                            // a stale socket file
  ];
  for (const [i, text] of wordings.entries()) {
    const fake = path.join(root, `tmux${i}`);
    await fs.writeFile(fake, noServer(text)); await fs.chmod(fake, 0o755);
    const state = path.join(root, `state${i}`);
    const env = { ...process.env, TMUX: '/tmp/tmux-0/default,1,0' };
    const probe = await exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ronin_tmux_probe; echo "rc=$?"; ronin_tmux_probe_socket`, 'test', fake], { env });
    assert.match(probe.stdout, /^rc=1$/m, text);
    assert.match(probe.stdout, /\/tmp\/tmux-1001\/default$/, text);
    // under setup.sh's own `set -e`: a wrong non-zero here is exactly the exit 2 of #74
    const adopt = await exec('bash', ['-c', `set -eu; . "${helper}"; TMUX_BIN="$1"; ronin_adopt_tmux "$2"; echo "adopt=$?"`, 'test', fake, state], { env });
    assert.match(adopt.stdout, /no tmux server on \/tmp\/tmux-1001\/default: tmux-server\.service starts Ronin's own/);
    assert.match(adopt.stdout, /^adopt=0$/m);
    await assert.rejects(fs.access(path.join(state, 'machine', 'tmux-adoption')), 'nothing is leased when there is no server');
    // uninstall on the same box: a stale lease is evidence of nothing, and goes
    await fs.mkdir(path.join(state, 'machine'), { recursive: true });
    await fs.writeFile(path.join(state, 'machine', 'tmux-adoption'), 'v=1\npid=1\nstart=x\nsocket=s\nprior=on\napplied=off\n');
    const restore = await exec('bash', ['-c', `set -eu; . "${helper}"; ronin_restore_tmux "$2" "$1"`, 'test', fake, state], { env });
    assert.match(restore.stdout, /removed the tmux lease: no server on \/tmp\/tmux-1001\/default/);
    await assert.rejects(fs.access(path.join(state, 'machine', 'tmux-adoption')));
  }
  await fs.rm(root, { recursive: true, force: true });
});

test("anything else tmux says stops setup with tmux's own words, never a guess", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-mismatch-'));
  const fake = path.join(root, 'tmux');
  await fs.writeFile(fake, noServer('protocol version mismatch (client 8, server 7)')); await fs.chmod(fake, 0o755);
  await assert.rejects(
    exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ronin_adopt_tmux "$2"`, 'test', fake, path.join(root, 'state')]),
    (error: any) => error?.code === 2 && /could not determine whether tmux is running \(tmux exit 1\): protocol version mismatch/.test(error.stderr),
  );
  await fs.rm(root, { recursive: true, force: true });
});

test("a server Ronin's own unit started is known by its cgroup and never adopted; one inside the operator is adopted and named", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-owner-'));
  const fake = path.join(root, 'tmux');
  await fs.writeFile(fake, `#!/bin/sh
case "$1" in
  list-sessions) exit 0 ;;
  display-message) case "$*" in *socket_path*) echo /tmp/fake.sock;; *version*) echo 3.7c;; *) echo "$FAKE_PID";; esac ;;
  show-options) echo off ;;
  set-option) echo "set-option $*" >> "$FAKE_WRITES" ;;
  -V) echo 'tmux 3.7c' ;;
esac
`);
  await fs.chmod(fake, 0o755);
  const writes = path.join(root, 'writes'); await fs.writeFile(writes, '');
  const proc = path.join(root, 'proc', String(process.pid)); await fs.mkdir(proc, { recursive: true });
  const env = { ...process.env, FAKE_PID: String(process.pid), FAKE_WRITES: writes, RONIN_PROC: path.join(root, 'proc') };
  const run = (state: string) => exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ronin_adopt_tmux "$2"`, 'test', fake, state], { env });

  await fs.writeFile(path.join(proc, 'cgroup'), '0::/user.slice/user-1000.slice/user@1000.service/app.slice/tmux-server.service\n');
  const ours = await run(path.join(root, 'ours'));
  assert.match(ours.stdout, /Ronin's own tmux server is running \(pid \d+, started by tmux-server\.service\): nothing to adopt, nothing leased/);
  await assert.rejects(fs.access(path.join(root, 'ours', 'machine', 'tmux-adoption')));
  assert.equal(await fs.readFile(writes, 'utf8'), '', 'no option is written to a server the conf already configured');

  await fs.writeFile(path.join(proc, 'cgroup'), '0::/user.slice/user-1000.slice/user@1000.service/app.slice/ronin.service\n');
  const inside = await run(path.join(root, 'inside'));
  assert.match(inside.stdout, /adopted \(pid \d+\)/);
  assert.match(inside.stdout, /runs inside the operator's own cgroup, so restarting Ronin would end every session in it/);
  await fs.access(path.join(root, 'inside', 'machine', 'tmux-adoption'));

  await fs.writeFile(path.join(proc, 'cgroup'), '0::/user.slice/user-1000.slice/session-3.scope\n');
  const theirs = await run(path.join(root, 'theirs'));
  assert.match(theirs.stdout, /adopted \(pid \d+\)/);
  assert.doesNotMatch(theirs.stdout, /operator's own cgroup/);
  await fs.rm(root, { recursive: true, force: true });
});

test('the real tmux answers the probe exactly as the fakes say: no socket, live server, adopted and restored, stale socket', async (t) => {
  const tmux = await exec('sh', ['-c', 'command -v tmux']).then((r) => r.stdout.trim()).catch(() => '');
  if (!tmux) { t.skip('no tmux on this box'); return; }
  // Isolated by TMUX_TMPDIR, and the directory is CREATED FIRST: tmux falls back to the
  // live default socket, silently, when the directory it is given does not exist. Every
  // step below asserts the socket is under this root before anything touches a server.
  const root = await fs.mkdtemp('/tmp/ronin-probe-');
  const env: NodeJS.ProcessEnv = { ...process.env, TMUX_TMPDIR: root, RONIN_PROC: path.join(root, 'no-proc') };
  delete env.TMUX; delete env.TMUX_PANE;
  const sh = (body: string) => exec('bash', ['-c', `. "${helper}"; TMUX_BIN="$1"; ${body}`, 'test', tmux], { env });
  const probe = async () => (await sh('ronin_tmux_probe; echo "rc=$?"; ronin_tmux_probe_socket')).stdout;
  const option = async () => (await exec(tmux, ['show-options', '-s', '-v', 'exit-empty'], { env })).stdout.trim();
  try {
    let out = await probe();
    assert.match(out, /^rc=1$/m, `no socket file: ${out}`);
    assert.ok(out.includes(root), `the probe looked under ${root}: ${out}`);

    await exec(tmux, ['-f', '/dev/null', 'new-session', '-d', '-s', 'probe'], { env });
    const socket = (await exec(tmux, ['display-message', '-p', '#{socket_path}'], { env })).stdout.trim();
    assert.ok(socket.startsWith(root), `an isolated server, never the owner's: ${socket}`);
    out = await probe();
    assert.match(out, /^rc=0$/m, `live server: ${out}`);

    // adopted (its cgroup is unreadable through RONIN_PROC, so it counts as someone else's),
    // leased, restored — and the session is still there: nothing here ever stops a server
    const state = path.join(root, 'state');
    assert.match((await sh(`ronin_adopt_tmux "${state}"`)).stdout, /adopted \(pid \d+\)/);
    assert.equal(await option(), 'off');
    assert.match((await sh(`ronin_restore_tmux "${state}" "$1"`)).stdout, /restored tmux exit-empty=on/);
    assert.equal(await option(), 'on');
    assert.match((await exec(tmux, ['list-sessions', '-F', '#S'], { env })).stdout, /^probe$/m);

    // the session ends by its own hand and, with exit-empty on, the server goes with it
    await exec(tmux, ['kill-session', '-t', 'probe'], { env });
    for (let i = 0; i < 50 && !/^rc=1$/m.test(out = await probe()); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /^rc=1$/m, `server gone: ${out}`);

    // a stale socket file — a server that died without cleaning up — is the other wording
    await exec(process.execPath, ['-e', "require('net').createServer().listen(process.argv[1], () => process.kill(process.pid, 'SIGKILL'))", socket]).catch(() => {});
    out = await probe();
    assert.match(out, /^rc=1$/m, `stale socket: ${out}`);
    assert.ok(out.includes(socket), `named the stale socket: ${out}`);
  } finally {
    await exec(tmux, ['kill-session', '-t', 'probe'], { env }).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  }
});
