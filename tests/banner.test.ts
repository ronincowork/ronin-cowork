import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const lib = path.resolve('libexec/ronin-banner.sh');

/**
 * The installer's closing address is the one thing a person keeps, so it is worth a
 * consumer-side test. Found walking a real install, 2026-08-21: a v1.3.2 install printed
 * `https://<box>.ts.net` in the banner and then, in the same breath, told the operator
 * to create a different door — because the banner asked `tailscale serve
 * status` which mapping existed, and the step below it only asked whether tailscale was
 * installed at all.
 *
 * `tailscale serve status` prints a public URL and its target beneath it, so a mapping
 * only belongs to Ronin if the target names Ronin's port.
 */
function box(serveStatus: string, port = '4810') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-banner-'));
  fs.writeFileSync(path.join(dir, 'tailscale'), `#!/bin/sh\ncat <<'EOF'\n${serveStatus}\nEOF\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '.env'), `PORT=${port}\n`);
  fs.writeFileSync(path.join(dir, 'uname'), '#!/bin/sh\necho Darwin\n', { mode: 0o755 });
  return dir;
}

function call(dir: string, fn: string, ...args: string[]) {
  return execFileSync('bash', ['-uc', `. "${lib}"; ${fn} ${args.map((a) => `"${a}"`).join(' ')}`], {
    env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir },
    encoding: 'utf8',
  }).trim();
}

const OURS = ['https://box.tailnet.ts.net:4810/', '|-- proxy http://127.0.0.1:4810'].join('\n');
const FOREIGN = ['https://box.tailnet.ts.net:9000/', '|-- proxy http://100.72.224.3:8080'].join('\n');

test('a serve mapping onto our port is the address to print', () => {
  assert.equal(call(box(OURS), 'ronin_served_url', '4810', '127.0.0.1'), 'https://box.tailnet.ts.net:4810');
});

test('a serve mapping onto someone else\'s port is NOT our door', () => {
  // The regression that matters: `grep https:// | head -1` would hand a stranger
  // whatever else they serve on that tailnet and call it the way in to Ronin.
  assert.equal(call(box(FOREIGN), 'ronin_served_url', '4810', '127.0.0.1'), '');
});

test('ours is found even when another mapping is listed first', () => {
  assert.equal(call(box(`${FOREIGN}\n${OURS}`), 'ronin_served_url', '4810', '127.0.0.1'), 'https://box.tailnet.ts.net:4810');
});

test('no serve mapping at all means no HTTPS claim', () => {
  assert.equal(call(box(''), 'ronin_served_url', '4810', '127.0.0.1'), '');
});

test('a matching port on the wrong backend host is not our door', () => {
  assert.equal(call(box(OURS), 'ronin_served_url', '4810', '100.99.88.77'), '');
});

test('a port prefix is not an exact backend match', () => {
  const prefixed = ['https://box.tailnet.ts.net:4810/', '|-- proxy http://127.0.0.1:48100'].join('\n');
  assert.equal(call(box(prefixed), 'ronin_served_url', '4810', '127.0.0.1'), '');
});

test('public HTTPS stays on 4810 when the loopback backend selected its fallback port', () => {
  const fallback = ['https://box.tailnet.ts.net:4810/', '|-- proxy http://127.0.0.1:3776'].join('\n');
  assert.equal(call(box(fallback, '3776'), 'ronin_served_url', '3776', '127.0.0.1', '4810'), 'https://box.tailnet.ts.net:4810');
});

test('an otherwise matching mapping on legacy public port 8443 is not our door', () => {
  const legacy = ['https://box.tailnet.ts.net:8443/', '|-- proxy http://127.0.0.1:4810'].join('\n');
  assert.equal(call(box(legacy), 'ronin_served_url', '4810', '127.0.0.1'), '');
});

test('the port comes from .env, because .env is where an operator is told to change it', () => {
  const dir = box(OURS, '8080');
  assert.equal(call(dir, 'ronin_port', dir), '8080');
});

test('a root with no .env still answers with the documented default', () => {
  assert.equal(call(box(''), 'ronin_port', fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-bare-'))), '4810');
});

test('without a served mapping there is no public address to print', () => {
  const dir = box('', '8080');
  const url = execFileSync(
    'bash',
    ['-uc', `. "${lib}"; ronin_open_url "${dir}" "$(ronin_port "${dir}")"`],
    { env: { PATH: `${dir}:/usr/bin:/bin`, RONIN_FQDN: 'box.tailnet.ts.net', RONIN_IP: '' }, encoding: 'utf8' },
  ).trim();
  assert.equal(url, '');
});

test('the banner keeps identity framed and the URL whole on its own copyable line', () => {
  const dir = box('');
  const url = 'https://a-very-long-machine-name-that-must-never-wrap.tailnet.ts.net:4810';
  const out = execFileSync('bash', ['-uc', `. "${lib}"; ronin_banner "${dir}" "${url}" "/tmp/report.log"`], {
    env: { PATH: `${dir}:/usr/bin:/bin` },
    encoding: 'utf8',
  });
  assert.ok(out.split('\n').includes(`  ${url}`));
  assert.ok(out.split('\n').includes('  http://127.0.0.1:4810'));
  assert.match(out, /another device connected to your Tailscale network/);
  assert.match(out, /On this computer only/);
  assert.doesNotMatch(out, /WHAT CHANGED OUTSIDE/);
  assert.match(out, /Next: open Machine Settings/);
  assert.match(out, /Install details: \/tmp\/report\.log/);
  const [top, bottom] = [out.split('\n').find((l) => l.includes('╭'))!, out.split('\n').find((l) => l.includes('╰'))!];
  // 人 is double-width; a frame that does not measure it is a frame with a ragged edge.
  assert.equal([...top].length, [...bottom].length);
  fs.writeFileSync(path.join(dir, 'uname'), '#!/bin/sh\necho Linux\n', { mode: 0o755 });
  const linux = call(dir, 'ronin_banner', dir, url);
  assert.ok(linux.split('\n').includes(`  ${url}`));
  assert.doesNotMatch(linux, /http:\/\/|On this computer only/);
});

// BIND_DETERMINISM: the address Ronin binds is a recorded fact, not a value re-derived
// from a subprocess on every boot. The next three tests pin the two halves of that ruling
// that a refactor would most quietly undo — the order of resolution, and whose word in
// .env is final.
function tailnetBox(ip: string, env: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-bind-'));
  // `tailscale ip -4` answers with the tailnet address; anything else is silent.
  fs.writeFileSync(path.join(dir, 'tailscale'), `#!/bin/sh\n[ "$1" = ip ] && printf '%s\\n' '${ip}'\nexit 0\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '.env'), env);
  return dir;
}

test('ronin_bind prefers the address recorded in .env over the tailscale probe', () => {
  const probe = tailnetBox('100.72.224.3', 'PORT=4810\n');
  assert.equal(call(probe, 'ronin_bind_full', probe), '127.0.0.1 loopback');
  const recorded = tailnetBox('100.72.224.3', 'PORT=4810\nBIND=10.9.8.7\n');
  assert.equal(call(recorded, 'ronin_bind_full', recorded), '10.9.8.7 env');
  const bare = tailnetBox('', 'PORT=4810\n');
  assert.equal(call(bare, 'ronin_bind_full', bare), '127.0.0.1 loopback');
});

test('a hand-set BIND is left byte-identical by setup, however often it reruns', () => {
  const env = '# mine\nPORT=4810\nBIND=0.0.0.0   # behind my proxy\nGRID_USER=me\n';
  const dir = tailnetBox('100.72.224.3', env);
  const out = call(dir, 'ronin_record_bind', dir);
  assert.match(out, /BIND: 0\.0\.0\.0 .*left as it is/);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), env);
});

test('a setup-recorded tailnet bind migrates to the loopback Serve backend', () => {
  const env = '# The address Ronin binds. Recorded by setup.sh on 2026-09-01\nBIND=100.72.224.3\nPORT=4810\n';
  const dir = tailnetBox('100.72.224.3', env);
  assert.equal(call(dir, 'ronin_bind_full', dir), '127.0.0.1 migration');
  assert.match(call(dir, 'ronin_record_bind', dir), /migrated .* to loopback/);
  assert.match(fs.readFileSync(path.join(dir, '.env'), 'utf8'), /^BIND=127\.0\.0\.1$/m);
});

test('an unrecorded .env gets the resolved address once; a rerun does not add a second', () => {
  const env = 'PORT=4810\n#BIND=100.x.y.z\n';
  const dir = tailnetBox('100.72.224.3', env);
  assert.match(call(dir, 'ronin_record_bind', dir), /recorded 127\.0\.0\.1 in \.env/);
  const once = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  assert.ok(once.startsWith(env), 'the owner\'s lines are untouched');
  assert.equal(once.match(/^BIND=/gm)?.length, 1);
  assert.equal(call(dir, 'ronin_bind', dir), '127.0.0.1');
  call(dir, 'ronin_record_bind', dir);
  assert.equal(fs.readFileSync(path.join(dir, '.env'), 'utf8'), once);
});


test('local-only arrival names the actual backend port without an HTTPS address', () => {
  const dir = box('', '3776');
  const out = call(dir, 'ronin_banner', dir, '');
  assert.match(out, /http:\/\/127\.0\.0\.1:3776/);
  assert.match(out, /On this computer only/);
  assert.doesNotMatch(out, /https:\/\//);
});

test('a custom non-loopback bind is printed honestly instead of promising localhost', () => {
  const dir = box('');
  fs.appendFileSync(path.join(dir, '.env'), 'BIND=10.0.0.2\n');
  const out = call(dir, 'ronin_banner', dir, '');
  assert.match(out, /HTTP address \(your custom BIND setting\)/);
  assert.match(out, /http:\/\/10\.0\.0\.2:4810/);
  assert.doesNotMatch(out, /On this computer only/);
});
