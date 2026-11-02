import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request, type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { filesArgs, filesProxy, findPython } from '../src/files.js';

// Files runs only where python3 is on PATH, and says nothing where it is not.
test('python3 is found on PATH, or not at all', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-py-'));
  assert.equal(findPython(dir), null);
  fs.writeFileSync(path.join(dir, 'python3'), '', { mode: 0o755 });
  assert.equal(findPython(`/nowhere${path.delimiter}${dir}`), path.join(dir, 'python3'));
  fs.rmSync(dir, { recursive: true });
});

// The contract with the Workspace page: /files/<path> is $HOME/<path>, read and write, on the socket only.
test('copyparty is rooted at home, served under /files, its chrome hidden', () => {
  const args = filesArgs('/opt/ronin', '/home/u', '/home/u/.ronin');
  assert.equal(args[0], '/opt/ronin/libexec/copyparty/copyparty-sfx.py');
  const after = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(after('-i'), 'unix:700:/home/u/.ronin/files.sock');
  assert.equal(after('--rp-loc'), '/files');
  assert.equal(after('--hist'), '/home/u/.ronin/copyparty');
  assert.equal(after('-v'), '/home/u::rwmd.,*');
  for (const flag of ['--no-thumb', '--no-readme', '--no-logues', '--no-script', '--no-mime', '--ui-nombar', '--ui-noacci', '--ui-nosrvi', '--ui-nocpla', '--ui-norepl']) assert.ok(args.includes(flag), flag);
  assert.ok(!args.some((a) => a.startsWith('-e2')), 'no index of the home folder');
  assert.equal(after('--js-browser'), '/files.js', 'Explorer follows Ronin\'s light and dark');
});

const listen = (server: Server, at: string | number) => new Promise<void>((done) => server.listen(at, done));

test('the proxy streams the body untouched to the socket and keeps Ronin credentials', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-'));
  const socket = path.join(dir, 's');
  const seen: { url?: string; method?: string; auth?: string; body?: Buffer } = {};
  const copyparty = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      Object.assign(seen, { url: req.url, method: req.method, auth: req.headers.authorization, body: Buffer.concat(chunks) });
      res.writeHead(201, { 'x-from': 'copyparty' }).end('ok');
    });
  });
  await listen(copyparty, socket);
  const app = express();
  app.use('/files', filesProxy(socket));
  app.use(express.json());
  const ronin = createServer(app);
  await listen(ronin, 0);
  const port = (ronin.address() as { port: number }).port;
  const body = Buffer.from(JSON.stringify({ name: 'up2k handshake', hash: [1, 2, 3] }));
  const answer = await new Promise<{ status?: number; from?: string | string[] }>((done) => {
    const req = request({ port, path: '/files/docs/a%20b/?j', method: 'POST', headers: { authorization: 'Basic eDp5', 'content-type': 'application/json' } },
      (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode, from: res.headers['x-from'] })); });
    req.end(body);
  });
  assert.deepEqual(answer, { status: 201, from: 'copyparty' });
  assert.equal(seen.url, '/files/docs/a%20b/?j');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.auth, undefined);
  assert.deepEqual(seen.body, body);
  await new Promise((done) => ronin.close(done));
  await new Promise((done) => copyparty.close(done));
  fs.rmSync(dir, { recursive: true });
});
