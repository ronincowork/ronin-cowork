import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
