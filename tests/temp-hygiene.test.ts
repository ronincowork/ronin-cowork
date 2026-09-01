import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve('.');
const lib = path.join(root, 'libexec/ronin-temp-hygiene.sh');

test('the janitor removes only old, owned Ronin run roots', () => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-janitor-proof-'));
  const old = path.join(box, 'ronin-promotion-oldold');
  const fresh = path.join(box, 'ronin-promotion-fresh1');
  const foreign = path.join(box, 'someone-else-oldold');
  for (const dir of [old, fresh, foreign]) fs.mkdirSync(dir);
  const stale = new Date(Date.now() - 2 * 86400_000);
  fs.utimesSync(old, stale, stale);
  fs.utimesSync(foreign, stale, stale);
  const r = spawnSync('bash', ['-c', `. "$1"; ronin_tmp_janitor`, 'test', lib], {
    env: { ...process.env, TMPDIR: box }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true, 'fresh work may be live');
  assert.equal(fs.existsSync(foreign), true, 'unrelated temp work is never ours');
  fs.rmSync(box, { recursive: true, force: true });
});

test('the preflight refuses low inodes with a teaching message', () => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-headroom-proof-'));
  fs.writeFileSync(path.join(box, 'df'), '#!/bin/sh\nprintf "Filesystem Total Used Available Capacity Mounted on\\n"\nif [ "$1" = "-Pi" ]; then printf "mock 1000000 999999 1 100%% /tmp\\n"; else printf "mock 1000000 1 999999 1%% /tmp\\n"; fi\n', { mode: 0o755 });
  const r = spawnSync('bash', ['-c', `. "$1"; ronin_tmp_preflight`, 'test', lib], {
    env: { ...process.env, PATH: `${box}:${process.env.PATH}`, TMPDIR: '/tmp' }, encoding: 'utf8',
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /REFUSED — temporary storage has too little headroom/);
  assert.match(r.stderr, /stopping before a gate fails halfway/);
  fs.rmSync(box, { recursive: true, force: true });
});

test('ronin-promote removes its owned temp tree when its child fails', () => {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-promote-proof-'));
  const fakeBin = path.join(box, 'bin');
  const seen = path.join(box, 'seen');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, 'npx'), `#!/bin/sh\nprintf '%s' "$TMPDIR" > "${seen}"\ntouch "$TMPDIR/left-by-failed-gate"\nexit 23\n`, { mode: 0o755 });
  const r = spawnSync(path.join(root, 'bin/ronin-promote'), ['sea_settle'], {
    env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, TMPDIR: box }, encoding: 'utf8',
  });
  assert.equal(r.status, 23, r.stderr);
  const owned = fs.readFileSync(seen, 'utf8');
  assert.match(path.basename(owned), /^ronin-promotion-/);
  assert.equal(fs.existsSync(owned), false, 'the EXIT trap removes failure-path work');
  fs.rmSync(box, { recursive: true, force: true });
});
