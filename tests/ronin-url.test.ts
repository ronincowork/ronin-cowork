import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const resolver = path.join(root, 'ronin_bin', 'ronin-url');

function fakeTmux(value: string): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ronin-url-'));
  const tmux = path.join(dir, 'tmux');
  writeFileSync(tmux, `#!/usr/bin/env bash\nprintf '%s\\n' ${JSON.stringify(value)}\n`);
  chmodSync(tmux, 0o755);
  return { dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}` } };
}

test('ronin-url prefers the explicit RONIN_URL override', () => {
  const f = fakeTmux('http://tmux.invalid');
  try {
    const out = execFileSync(resolver, [], {
      encoding: 'utf8',
      env: { ...f.env, RONIN_URL: 'http://explicit.example:8123' },
    });
    assert.equal(out, 'http://explicit.example:8123\n');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('ronin-url reads the operator address from the tmux server', () => {
  const f = fakeTmux('http://100.101.235.17:3006');
  try {
    const out = execFileSync(resolver, [], {
      encoding: 'utf8',
      env: { ...f.env, RONIN_URL: '' },
    });
    assert.equal(out, 'http://100.101.235.17:3006\n');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('ronin-url refuses and teaches when no address can be resolved', () => {
  const f = fakeTmux('');
  try {
    const r = spawnSync(resolver, [], {
      encoding: 'utf8',
      env: { ...f.env, RONIN_URL: '' },
    });
    assert.equal(r.status, 4);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /REFUSED: Ronin's address could not be resolved/);
    assert.match(r.stderr, /Ronin may not be running/);
    assert.match(r.stderr, /RONIN_URL/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('all agent-facing URL callers use the one resolver and carry no port guess', () => {
  const callers = [
    'mika',
    'tejun-team-set',
    'tejun-teampage',
    'tejun-harakiri',
    'tejun-session-set',
    'tejun-fork',
  ];
  for (const name of callers) {
    const body = readFileSync(path.join(root, 'ronin_bin', name), 'utf8');
    assert.match(body, /\burl=\$\(ronin-url\)|\bURL=\$\(ronin-url\)/, name);
    assert.doesNotMatch(body, /3006/, name);
    assert.doesNotMatch(body, /@ronin-url/, name);
  }
});
