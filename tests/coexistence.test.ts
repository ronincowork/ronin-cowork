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

test('runtime names EADDRINUSE and maps it to the non-restarting status', async () => {
  const source = await fs.readFile(path.join(repo, 'src', 'index.ts'), 'utf8');
  assert.match(source, /error\.code === 'EADDRINUSE'/);
  assert.match(source, /process\.exit\(PORT_UNAVAILABLE_EXIT\)/);
  assert.match(source, /PORT_UNAVAILABLE_EXIT = 78/);
});
