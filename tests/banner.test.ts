import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const lib = path.resolve('libexec/ronin-banner.sh');

/**
 * The installer's closing address is the one thing a person keeps, so it is worth a
 * consumer-side test. Found on the dogfood walk, 2026-08-21: a v1.3.2 install printed
 * `https://<box>.ts.net` in the banner and then, in the same breath, told the operator
 * to create a DIFFERENT door on :8443 — because the banner asked `tailscale serve
 * status` which mapping existed, and the step below it only asked whether tailscale was
 * installed at all.
 *
 * `tailscale serve status` prints a public URL and its target beneath it, so a mapping
 * only belongs to Ronin if the target names Ronin's port.
 */
function box(serveStatus: string, port = '3006') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-banner-'));
  fs.writeFileSync(path.join(dir, 'tailscale'), `#!/bin/sh\ncat <<'EOF'\n${serveStatus}\nEOF\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, '.env'), `PORT=${port}\n`);
  return dir;
}

function call(dir: string, fn: string, ...args: string[]) {
  return execFileSync('bash', ['-c', `. "${lib}"; ${fn} ${args.map((a) => `"${a}"`).join(' ')}`], {
    env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir },
    encoding: 'utf8',
  }).trim();
}

const OURS = ['https://box.tailnet.ts.net:8443/', '|-- proxy http://100.72.224.3:3006'].join('\n');
const FOREIGN = ['https://box.tailnet.ts.net:9000/', '|-- proxy http://100.72.224.3:8080'].join('\n');

test('a serve mapping onto our port is the address to print', () => {
  assert.equal(call(box(OURS), 'ronin_served_url', '3006'), 'https://box.tailnet.ts.net:8443');
});

test('a serve mapping onto someone else\'s port is NOT our door', () => {
  // The regression that matters: `grep https:// | head -1` would hand a stranger
  // whatever else they serve on that tailnet and call it the way in to Ronin.
  assert.equal(call(box(FOREIGN), 'ronin_served_url', '3006'), '');
});

test('ours is found even when another mapping is listed first', () => {
  assert.equal(call(box(`${FOREIGN}\n${OURS}`), 'ronin_served_url', '3006'), 'https://box.tailnet.ts.net:8443');
});

test('no serve mapping at all means no HTTPS claim', () => {
  assert.equal(call(box(''), 'ronin_served_url', '3006'), '');
});

test('the port comes from .env, because .env is where an operator is told to change it', () => {
  const dir = box(OURS, '8080');
  assert.equal(call(dir, 'ronin_port', dir), '8080');
});

test('a root with no .env still answers with the documented default', () => {
  assert.equal(call(box(''), 'ronin_port', fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-bare-'))), '3006');
});

test('without a served mapping the address falls back to one that answers now', () => {
  const dir = box('', '8080');
  const url = execFileSync(
    'bash',
    ['-c', `. "${lib}"; ronin_open_url "${dir}" "$(ronin_port "${dir}")"`],
    { env: { PATH: `${dir}:/usr/bin:/bin`, RONIN_FQDN: 'box.tailnet.ts.net', RONIN_IP: '' }, encoding: 'utf8' },
  ).trim();
  // HTTP, and carrying the operator's port rather than a constant.
  assert.equal(url, 'http://box.tailnet.ts.net:8080');
});

test('the banner draws the url it is given, inside a frame that closes', () => {
  const dir = box('');
  const out = execFileSync('bash', ['-c', `. "${lib}"; ronin_banner "${dir}" "http://box:3006"`], {
    env: { PATH: `${dir}:/usr/bin:/bin` },
    encoding: 'utf8',
  });
  assert.match(out, /http:\/\/box:3006/);
  const [top, bottom] = [out.split('\n').find((l) => l.includes('╭'))!, out.split('\n').find((l) => l.includes('╰'))!];
  // 人 is double-width; a frame that does not measure it is a frame with a ragged edge.
  assert.equal([...top].length, [...bottom].length);
});
