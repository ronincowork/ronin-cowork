import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import path from 'node:path';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');

test('named lifecycle tools reuse the live archive and rehydrate routes', async (t) => {
  const seen: Array<{ method?: string; url?: string }> = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/sessions/scribe/archive') {
      res.end(JSON.stringify({ ok: true, archived: { id: 'scribe-key', name: 'scribe' } }));
      return;
    }
    if (req.url === '/api/archived-sessions/scribe-key/rehydrate') {
      res.end(JSON.stringify({ ok: true, name: 'scribe' }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'No such lifecycle route.' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address() as AddressInfo;
  const env = { ...process.env, RONIN_URL: `http://127.0.0.1:${address.port}`, RONIN_CLI_TOKEN: 'test-token' };

  const archived = await exec(path.join(root, 'ronin_bin', 'tejun-archive'), ['scribe'], { env });
  assert.equal(archived.stdout, 'ARCHIVED scribe as scribe-key — resumable\n');
  const restored = await exec(path.join(root, 'ronin_bin', 'tejun-rehydrate'), ['scribe-key'], { env });
  assert.equal(restored.stdout, 'REHYDRATED scribe\n');
  assert.deepEqual(seen, [
    { method: 'POST', url: '/api/sessions/scribe/archive' },
    { method: 'POST', url: '/api/archived-sessions/scribe-key/rehydrate' },
  ]);
});

test('lifecycle tools preserve route refusals and reject extra arguments', async (t) => {
  const server = createServer((_req, res) => {
    res.statusCode = 409;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'conversation cannot be resumed' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address() as AddressInfo;
  const env = { ...process.env, RONIN_URL: `http://127.0.0.1:${address.port}` };

  await assert.rejects(
    exec(path.join(root, 'ronin_bin', 'tejun-archive'), ['scribe'], { env }),
    (error: { code?: number; stderr?: string }) => error.code === 4 && /REFUSED: conversation cannot be resumed/.test(error.stderr ?? ''),
  );
  await assert.rejects(
    exec(path.join(root, 'ronin_bin', 'tejun-rehydrate'), ['one', 'two'], { env }),
    (error: { code?: number; stderr?: string }) => error.code === 2 && /usage: tejun-rehydrate/.test(error.stderr ?? ''),
  );
  await assert.rejects(
    exec(path.join(root, 'ronin_bin', 'tejun-harakiri'), [], { env: { ...env, TMUX_PANE: '%7' } }),
    (error: { code?: number; stdout?: string; stderr?: string }) => error.code === 4
      && /conversation cannot be resumed/.test((error.stdout ?? '') + (error.stderr ?? '')),
  );
});
