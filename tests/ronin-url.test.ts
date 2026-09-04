import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const resolver = path.join(root, 'ronin_bin', 'ronin-url');

function fakeTmux(value: string, instance = 'test'): { dir: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ronin-url-'));
  const tmux = path.join(dir, 'tmux');
  const descriptor = value ? JSON.stringify({ version: 1, url: value, token: 'test-token', instance }) : '';
  writeFileSync(tmux, `#!/usr/bin/env bash\nprintf '%s\\n' ${JSON.stringify(descriptor)}\n`);
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

// The option lives on the tmux server, which outlives the operator by design. Once a
// collision exits 78 and the unit stays down, the last good address would sit on the bus
// forever, and this tool's honest refusal would become a connection-refused nobody can
// explain. The instance names the pid that published it; a dead pid is the refusal.
test('ronin-url refuses when the published instance names a dead operator', () => {
  const dead = spawnSync('true').pid!; // exited and reaped: nothing wears this pid now
  const f = fakeTmux('http://100.101.235.17:3006', `${dead}:1756990000000`);
  try {
    const r = spawnSync(resolver, [], { encoding: 'utf8', env: { ...f.env, RONIN_URL: '' } });
    assert.equal(r.status, 4);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Ronin may not be running/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
  // And a live pid is not refused — the check must tell the two apart, not refuse both.
  const live = fakeTmux('http://100.101.235.17:3006', `${process.pid}:1756990000000`);
  try {
    assert.equal(execFileSync(resolver, [], { encoding: 'utf8', env: { ...live.env, RONIN_URL: '' } }), 'http://100.101.235.17:3006\n');
  } finally {
    rmSync(live.dir, { recursive: true, force: true });
  }
});

test('every agent-facing API caller uses the one resolver and carries no address guess', () => {
  const bin = path.join(root, 'ronin_bin');
  const callers = readdirSync(bin).filter((name) => {
    if (name === 'ronin-url') return false;
    const body = readFileSync(path.join(bin, name), 'utf8');
    return /\bcurl\b/.test(body);
  });
  assert.deepEqual(callers.sort(), [
    'mika',
    'tejun-fork',
    'tejun-harakiri',
    'tejun-session-set',
    'tejun-team-set',
    'tejun-teampage',
  ]);
  for (const name of callers) {
    const body = readFileSync(path.join(bin, name), 'utf8');
    assert.match(body, /\burl=\$\("\$TOOL_DIR\/ronin-url"\)|\bURL=\$\("\$TOOL_DIR\/ronin-url"\)/, name);
    assert.doesNotMatch(body, /https?:\/\//, name);
    assert.doesNotMatch(body, /@ronin-url/, name);
  }
});

test('absolute tejun-fork invocation resolves its sibling with no Ronin PATH entries', () => {
  const r = spawnSync(path.join(root, 'ronin_bin', 'tejun-fork'), ['--name', 'path-proof'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', RONIN_URL: 'http://127.0.0.1:9' },
  });
  assert.equal(r.status, 5);
  assert.doesNotMatch(r.stderr, /ronin-url: command not found/);
  assert.match(r.stderr, /Ronin did not answer/);
});

test('the retired loopback operator URL is absent from production code', () => {
  for (const dir of ['ronin_bin', 'bin', 'libexec', 'src']) {
    const files: string[] = [];
    const visit = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const target = path.join(at, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (entry.isFile()) files.push(target);
      }
    };
    visit(path.join(root, dir));
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      assert.doesNotMatch(body, /http:\/\/(?:127\.0\.0\.1|localhost):3006\b/, path.relative(root, file));
    }
  }
});

// The box-side end of an SSH forward is resolved ON THE BOX, where config.bind defaults
// to the tailnet IP (src/machine-settings.ts), not loopback. A document that hardcodes
// 127.0.0.1 there sends the reader to an address nothing listens on. The laptop-side end
// of the same forward IS 127.0.0.1 — which is why this matches the forward shape and not
// the bare URL, and why the production-code test above cannot simply widen to the docs.
test('no document forwards an SSH tunnel to loopback on the box', () => {
  const files = [path.join(root, 'README.md')];
  const visit = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const target = path.join(at, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
    }
  };
  visit(path.join(root, 'docs'));
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /-L\s*\d+:(?:127\.0\.0\.1|localhost):\d+/,
      path.relative(root, file),
    );
  }
});
