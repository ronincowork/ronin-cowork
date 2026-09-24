import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { mountAssets, noCacheClient, publicFingerprint } from '../src/assets.js';

const tree = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-assets-'));
  fs.mkdirSync(path.join(root, 'js'));
  fs.writeFileSync(path.join(root, 'js', 'main.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(root, 'js', 'other.js'), 'export const b = 2;\n');
  fs.writeFileSync(path.join(root, 'style.css'), ':root{}\n');
  return root;
};

const serve = async (root: string, version: string) => {
  const app = express();
  mountAssets(app, root, version);
  app.use(express.static(root, { setHeaders: noCacheClient }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const get = (p: string) => new Promise<{ status: number; cache: string }>((resolve) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, cache: String(res.headers['cache-control'] ?? '') });
    });
  });
  return { get, close: () => new Promise<void>((r) => { server.close(() => r()); }) };
};

test('the client is versioned by its own content, not by the repository commit', () => {
  const root = tree();
  const first = publicFingerprint(root);
  assert.match(first, /^[0-9a-f]{8}$/);
  assert.equal(publicFingerprint(root), first, 'the same bytes give the same version');

  // The defect this replaces: a commit that touches nothing the browser loads still moved
  // the version, so every refresh after a restart re-fetched the whole module graph.
  fs.utimesSync(path.join(root, 'js', 'main.js'), new Date(0), new Date(0));
  assert.equal(publicFingerprint(root), first, 'a timestamp is not a change');

  fs.writeFileSync(path.join(root, 'js', 'main.js'), 'export const a = 2;\n');
  const changed = publicFingerprint(root);
  assert.notEqual(changed, first, 'changing a served file must move the version');

  fs.writeFileSync(path.join(root, 'js', 'main.js'), 'export const a = 1;\n');
  assert.equal(publicFingerprint(root), first, 'reverting returns to the old version, not a third one');

  // Content addressing must cover the path too, or moving a file would go unnoticed.
  fs.renameSync(path.join(root, 'js', 'other.js'), path.join(root, 'js', 'renamed.js'));
  assert.notEqual(publicFingerprint(root), first, 'a rename is a change');
  fs.rmSync(root, { recursive: true, force: true });
});

test('the current version is immutable and a stale one is served rather than refused', async () => {
  const root = tree();
  const version = publicFingerprint(root);
  const { get, close } = await serve(root, version);

  const current = await get(`/${version}/js/main.js`);
  assert.equal(current.status, 200);
  assert.match(current.cache, /immutable/, 'the current version is worth caching for a year');

  // A tab that loaded before a restart still asks for the previous version. Refusing those
  // is 145 404s and a module graph that dies part-way through boot.
  const stale = await get('/deadbeef/js/main.js');
  assert.equal(stale.status, 200, 'a stale version still serves the file');
  assert.equal(stale.cache, 'no-cache', 'and is revalidated rather than cached under the wrong version');

  const staleCss = await get('/deadbeef/style.css');
  assert.equal(staleCss.status, 200, 'the stylesheet too, not only the module graph');

  assert.equal((await get(`/${version}/js/missing.js`)).status, 404, 'a file that does not exist is still absent');
  await close();
  fs.rmSync(root, { recursive: true, force: true });
});

test('two different trees cannot share a version: the digest is length-framed', () => {
  // The defect: feeding path then content straight into the digest makes the stream
  // ambiguous. File `a` holding `bc` and file `ab` holding `c` are the same bytes end to
  // end, so two genuinely different trees would share a version and one would be served
  // out of the other's cache.
  const one = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-collide-a-'));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-collide-b-'));
  fs.writeFileSync(path.join(one, 'a'), 'bc');
  fs.writeFileSync(path.join(two, 'ab'), 'c');
  assert.notEqual(publicFingerprint(one), publicFingerprint(two), 'path and content must not run together');

  // The same ambiguity one level down, where the separator is part of the path.
  const three = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-collide-c-'));
  const four = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-collide-d-'));
  fs.mkdirSync(path.join(three, 'js'));
  fs.writeFileSync(path.join(three, 'js', 'a.js'), 'x');
  fs.writeFileSync(path.join(four, 'js_a.js'), 'x');
  assert.notEqual(publicFingerprint(three), publicFingerprint(four), 'a directory boundary is part of the identity');

  // Ordering must not read the host's locale, or "same bytes, same version across
  // machines" is false. Code-unit order puts 'Z' (0x5A) before 'a' (0x61); several
  // locales collate them the other way.
  const five = fs.mkdtempSync(path.join(os.tmpdir(), 'ronin-order-'));
  fs.writeFileSync(path.join(five, 'Z'), '1');
  fs.writeFileSync(path.join(five, 'a'), '2');
  const framed = (rel: string, body: string) => {
    const r = Buffer.from(rel, 'utf8');
    const b = Buffer.from(body, 'utf8');
    const f = Buffer.alloc(8);
    f.writeUInt32BE(r.length, 0);
    f.writeUInt32BE(b.length, 4);
    return Buffer.concat([f, r, b]);
  };
  const expected = createHash('sha256')
    .update(Buffer.concat([framed('Z', '1'), framed('a', '2')]))
    .digest('hex').slice(0, 8);
  assert.equal(publicFingerprint(five), expected, 'code-unit order and the documented framing');

  for (const dir of [one, two, three, four, five]) fs.rmSync(dir, { recursive: true, force: true });
});

test('the stale-version fallback reaches assets and nothing else', async () => {
  const root = tree();
  const version = publicFingerprint(root);
  const app = express();
  let apiCalls = 0;
  mountAssets(app, root, version);
  app.use(express.static(root, { setHeaders: noCacheClient }));
  // Mounted AFTER the fallback, exactly as the real server does.
  app.get('/api/health', (_req, res) => { apiCalls += 1; res.json({ ok: true }); });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const get = (p: string) => new Promise<{ status: number; cache: string }>((resolve) => {
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, cache: String(res.headers['cache-control'] ?? '') });
    });
  });

  // A stale ASSET still arrives — that is the whole point of the fallback.
  assert.equal((await get('/deadbeef/js/main.js')).status, 200);
  assert.equal((await get('/deadbeef/style.css')).status, 200);
  assert.equal((await get('/deadbeef/js/main.js')).cache, 'no-cache');

  // A made-up version in front of the API is not an alias for the API.
  assert.equal((await get('/deadbeef/api/health')).status, 404, '/deadbeef/api/health must not resolve');
  assert.equal(apiCalls, 0, 'and must never reach the route behind it');
  assert.equal((await get('/api/health')).status, 200, 'the real route is untouched');
  assert.equal(apiCalls, 1);

  // The prefix is not a way out of the served tree either.
  assert.equal((await get('/deadbeef/../../etc/passwd')).status, 404);

  await new Promise<void>((r) => { server.close(() => r()); });
  fs.rmSync(root, { recursive: true, force: true });
});
