import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { registerCli } from '../src/routes/cli-api.js';

const pexec = promisify(execFile);
const ROOT = process.cwd();
const TOOLS = ['wipeboard', 'desk', 'promotion', 'jikan', 'bundle', 'recovery', 'auth', 'message'];

test('every CLI is only the shared HTTP client', async () => {
  for (const tool of TOOLS) {
    const source = await readFile(path.join(ROOT, 'src', `${tool}-cli.ts`), 'utf8');
    assert.match(source, /from '\.\/cli-http\.js'/);
    assert.match(source, new RegExp(`runCli\\('${tool}'`));
    assert.doesNotMatch(source, /from '\.\/(wipeboards|desks|promotion|jikan|bundles|passkey|auth|message-queue)\.js'/);
  }
});

test('a CLI sends its arguments and prints the HTTP reply', async () => {
  let received = '';
  const server = createServer((req, res) => {
    req.setEncoding('utf8');
    req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => {
      assert.equal(req.url, '/api/cli/jikan');
      assert.equal(req.headers.authorization, 'Bearer test-token');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ stdout: 'the reply\n', stderr: 'a note\n', exit: 3 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    await assert.rejects(
      pexec(process.execPath, ['--import', 'tsx', 'src/jikan-cli.ts', 'when', 'hourly'], {
        cwd: ROOT,
        env: { ...process.env, RONIN_URL: `http://127.0.0.1:${address.port}`, RONIN_CLI_TOKEN: 'test-token' },
      }),
      (error: unknown) => {
        const e = error as { code: number; stdout: string; stderr: string };
        assert.equal(e.code, 3);
        assert.equal(e.stdout, 'the reply\n');
        assert.equal(e.stderr, 'a note\n');
        return true;
      },
    );
    assert.deepEqual(JSON.parse(received).args, ['when', 'hourly']);
  } finally {
    server.close();
  }
});

/* The socket rows, twins of tests/ronin-url.test.ts: with no override a CLI goes to the
 * operator's socket in the data root, carries no bearer (the file mode was the
 * credential), and refuses with one of two sentences when nothing answers. */
test('with no override a CLI speaks to the operator socket in the data root, with no bearer', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ronin-cli-sock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sock = path.join(dir, 'run', 'ronin.sock');
  await mkdir(path.dirname(sock), { recursive: true });
  let received = '';
  let authorization: string | undefined = 'unset';
  const server = createServer((req, res) => {
    req.setEncoding('utf8');
    req.on('data', (chunk) => { received += chunk; });
    req.on('end', () => {
      authorization = req.headers.authorization;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ stdout: 'over the socket\n', stderr: '', exit: 0 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(sock, resolve));
  t.after(() => server.close());
  const env = { ...process.env, RONIN_DATA_ROOT: dir, RONIN_URL: '', RONIN_CLI_TOKEN: '' };
  delete env.RONIN_SOCKET;
  const r = await pexec(process.execPath, ['--import', 'tsx', 'src/jikan-cli.ts', 'when', 'hourly'], { cwd: ROOT, env });
  assert.equal(r.stdout, 'over the socket\n');
  assert.equal(authorization, undefined);
  assert.deepEqual(JSON.parse(received).args, ['when', 'hourly']);
  // Told at birth: RONIN_SOCKET names the operator that launched the session.
  const born = await pexec(process.execPath, ['--import', 'tsx', 'src/jikan-cli.ts', 'when'], { cwd: ROOT, env: { ...env, RONIN_DATA_ROOT: '/nowhere', RONIN_SOCKET: sock } });
  assert.equal(born.stdout, 'over the socket\n');
});

test('a CLI refuses with "never started" for no socket and "not running" for a dead one', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ronin-cli-sock-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { ...process.env, RONIN_DATA_ROOT: dir, RONIN_URL: '' };
  delete env.RONIN_SOCKET;
  const refusal = async () => {
    try {
      await pexec(process.execPath, ['--import', 'tsx', 'src/jikan-cli.ts', 'when'], { cwd: ROOT, env });
      return { code: 0, stderr: '' };
    } catch (e) {
      const err = e as { code: number; stderr: string };
      return { code: err.code, stderr: err.stderr };
    }
  };
  const absent = await refusal();
  assert.equal(absent.code, 4);
  assert.match(absent.stderr, /REFUSED: no Ronin has started on this box \(no socket at /);
  await mkdir(path.join(dir, 'run'), { recursive: true });
  await writeFile(path.join(dir, 'run', 'ronin.sock'), '');
  const dead = await refusal();
  assert.equal(dead.code, 4);
  assert.match(dead.stderr, /REFUSED: Ronin is not running \(socket at .*nobody listening\)/);
  assert.notEqual(absent.stderr, dead.stderr);
});

test('the promotion socket returns the continuation-owned reply unchanged', async () => {
  const app = express();
  app.use(express.json());
  registerCli(app, {
    execute: async () => ({ stdout: 'restarting — receipt promotion-1\n', stderr: '', exit: 0 }),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cli/promotion`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: ['team'] }),
    });
    const reply = await response.json() as { stdout: string; stderr: string };
    assert.equal(reply.stdout.trim(), 'restarting — receipt promotion-1');
    assert.equal(reply.stderr, '');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
