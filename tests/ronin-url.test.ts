import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const resolver = path.join(root, 'ronin_bin', 'ronin-url');

/* The shell resolver mirrors the TypeScript one (src/cli-http.ts): RONIN_URL wins, else the
 * operator's socket in the data root, else one of two refusals. Each row here has its twin
 * in tests/cli-http.test.ts so the two readers cannot drift apart. Every data root is a
 * scratch directory; nothing here looks at ~/.ronin. */

function scratch(): { dir: string; env: NodeJS.ProcessEnv; sock: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ronin-url-'));
  const env = { ...process.env, RONIN_DATA_ROOT: dir, RONIN_URL: '' };
  delete env.RONIN_SOCKET;
  return { dir, env, sock: path.join(dir, 'run', 'ronin.sock') };
}

function listen(sock: string): Promise<Server> {
  mkdirSync(path.dirname(sock), { recursive: true });
  const server = createServer((c) => c.end());
  return new Promise((resolve) => server.listen(sock, () => resolve(server)));
}

test('ronin-url prefers the explicit RONIN_URL override', () => {
  const f = scratch();
  try {
    const out = execFileSync(resolver, [], { encoding: 'utf8', env: { ...f.env, RONIN_URL: 'http://explicit.example:8123' } });
    assert.equal(out, 'http://explicit.example:8123\n');
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('ronin-url prints the operator socket in the data root when a Ronin listens there', async () => {
  const f = scratch();
  const server = await listen(f.sock);
  try {
    assert.equal(execFileSync(resolver, [], { encoding: 'utf8', env: f.env }), `${f.sock}\n`);
    // Told at birth: RONIN_SOCKET names the operator that launched this session.
    assert.equal(execFileSync(resolver, [], { encoding: 'utf8', env: { ...f.env, RONIN_DATA_ROOT: '/nowhere', RONIN_SOCKET: f.sock } }), `${f.sock}\n`);
  } finally {
    server.close();
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('ronin-url refuses with "never started" when there is no socket, and teaches the override', () => {
  const f = scratch();
  try {
    const r = spawnSync(resolver, [], { encoding: 'utf8', env: f.env });
    assert.equal(r.status, 4);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /REFUSED: no Ronin has started on this box/);
    assert.match(r.stderr, new RegExp(f.sock.replaceAll('.', '\\.')));
    assert.match(r.stderr, /RONIN_URL/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

// A socket file outlives a crash. Handing a caller that path would turn this tool's honest
// refusal into a connection-refused nobody can explain; the sentence must say "stopped",
// which is a different fact from "never started" and earns its own line.
test('ronin-url refuses with "not running" when the socket file has nobody behind it', () => {
  const f = scratch();
  try {
    mkdirSync(path.dirname(f.sock), { recursive: true });
    writeFileSync(f.sock, '');
    const r = spawnSync(resolver, [], { encoding: 'utf8', env: f.env });
    assert.equal(r.status, 4);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /REFUSED: Ronin is not running \(socket at .*nobody listening\)/);
    assert.match(r.stderr, /journalctl/);
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('every agent-facing API caller connects through the one library and carries no address guess', () => {
  const bin = path.join(root, 'ronin_bin');
  const callers = readdirSync(bin).filter((name) => {
    if (name === 'ronin-url' || name === 'ronin-http.sh') return false;
    const body = readFileSync(path.join(bin, name), 'utf8');
    return /\bcurl\b/.test(body);
  });
  assert.deepEqual(callers.sort(), [
    'mika',
    'tejun-archive',
    'tejun-fork',
    'tejun-harakiri',
    'tejun-rehydrate',
    'tejun-session-set',
    'tejun-team-set',
    'tejun-teampage',
  ]);
  for (const name of callers) {
    const body = readFileSync(path.join(bin, name), 'utf8');
    assert.match(body, /^\. "\$TOOL_DIR\/ronin-http\.sh"\nronin_connect \|\| exit \$\?$/m, name);
    assert.match(body, /"\$\{RONIN_CURL\[@\]\+"\$\{RONIN_CURL\[@\]\}"\}"/, name);
    assert.doesNotMatch(body, /https?:\/\//, name);
    assert.doesNotMatch(body, /ronin-url/, name);
    assert.doesNotMatch(body, /@ronin-(?:operator|url|cli-token)/, name);
  }
  // And the library itself resolves through ronin-url, never on its own.
  const lib = readFileSync(path.join(bin, 'ronin-http.sh'), 'utf8');
  assert.match(lib, /\$\("\$TOOL_DIR\/ronin-url"\)/);
  assert.match(lib, /--unix-socket "\$target"/);
});

test('a shell caller reaches the operator over its socket with no token and no PATH entries', async () => {
  const f = scratch();
  mkdirSync(path.dirname(f.sock), { recursive: true });
  const hits: string[] = [];
  const authorization: Array<string | undefined> = [];
  const server = createHttpServer((req, res) => {
    hits.push(req.url ?? '');
    authorization.push(req.headers.authorization);
    res.setHeader('content-type', 'application/json');
    res.end('[]');
  });
  await new Promise<void>((resolve) => server.listen(f.sock, resolve));
  try {
    // Asynchronous on purpose: the fake operator answers on this event loop.
    const r = await new Promise<{ stdout: string; stderr: string }>((resolve) => {
      execFile(path.join(root, 'ronin_bin', 'tejun-team-set'), ['reach'], {
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', HOME: f.dir, RONIN_DATA_ROOT: f.dir },
      }, (_error, stdout, stderr) => resolve({ stdout, stderr }));
    });
    assert.doesNotMatch(r.stderr, /command not found|No such file/);
    assert.ok(hits.some((h) => h.startsWith('/api/')), `reached the operator over the socket; saw ${JSON.stringify(hits)}: ${r.stdout}${r.stderr}`);
    assert.deepEqual(authorization, hits.map(() => undefined), 'a socket peer carries no bearer and no Basic');
  } finally {
    server.close();
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test('absolute tejun-fork invocation resolves its sibling with no Ronin PATH entries', () => {
  const r = spawnSync(path.join(root, 'ronin_bin', 'tejun-fork'), ['--name', 'path-proof'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', RONIN_URL: 'http://127.0.0.1:9' },
  });
  assert.equal(r.status, 5);
  assert.doesNotMatch(r.stderr, /ronin-url: command not found|ronin-http.sh: No such file/);
  assert.match(r.stderr, /Ronin did not answer/);
});

test('the retired loopback operator URL and the retired tmux option are absent from production code', () => {
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
      // The address rode on a tmux server option until 2026-09-05; nothing may read or
      // write it again, or the five failures behind one sentence come back one at a time.
      if (!file.endsWith('operator-socket.ts')) assert.doesNotMatch(body, /@ronin-operator|@ronin-url|@ronin-cli-token/, path.relative(root, file));
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
