import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bindOperatorSocket, boundOperatorSocket, isOperatorPeer, operatorSocketPath, probeOperatorSocket, SiblingAlive, socketRefusal } from '../src/operator-socket.js';

/* The operator's door is a Unix socket in the data root (wip/buildouts/RONIN_ADDRESS.md).
 * These pin the facts a later edit would silently undo: the kernel refuses a second
 * Ronin, a stale file is replaced, a clean close removes only its own socket, and the
 * two refusals a reader gives are two different sentences. Every path here is under a
 * scratch directory; nothing reaches ~/.ronin or the live operator. */

const answer = (req: http.IncomingMessage, res: http.ServerResponse) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ commit: 'test0000', startedAt: '2026-09-05T00:00:00Z', peer: isOperatorPeer(req) }));
};

async function get(socketPath: string, route: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path: route }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the socket path follows the data root, and RONIN_SOCKET (told at birth) wins', () => {
  assert.equal(operatorSocketPath({ RONIN_DATA_ROOT: '/scratch/data' }), '/scratch/data/run/ronin.sock');
  assert.equal(operatorSocketPath({ RONIN_DATA_ROOT: '/scratch/data', RONIN_SOCKET: '/born/with/this.sock' }), '/born/with/this.sock');
  assert.equal(operatorSocketPath({}), path.join(os.homedir(), '.ronin', 'run', 'ronin.sock'));
});

test('a second Ronin on a live socket is refused and the live socket survives; a peer needs no bearer', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-sock-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const socketPath = path.join(dir, 'run', 'ronin.sock');
  const first = await bindOperatorSocket(answer, socketPath);
  t.after(() => first.close());
  assert.equal(boundOperatorSocket(), socketPath);
  assert.equal((await fs.stat(socketPath)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(socketPath))).mode & 0o777, 0o700);

  await assert.rejects(bindOperatorSocket(answer, socketPath), (e: unknown) => {
    assert.ok(e instanceof SiblingAlive);
    assert.match(e.message, /already answering/);
    assert.match(e.identity, /commit test0000/);
    return true;
  });
  // The kernel's word: the sibling's refusal did not touch the door it was refused at.
  assert.equal(await probeOperatorSocket(socketPath), 'live');
  const reply = await get(socketPath, '/api/version');
  assert.equal(reply.status, 200);
  assert.equal(JSON.parse(reply.body).peer, true);
});

test('a stale socket file is replaced at start, and a clean close removes only its own', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-sock-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const socketPath = path.join(dir, 'run', 'ronin.sock');
  await fs.mkdir(path.dirname(socketPath), { recursive: true });
  await fs.writeFile(socketPath, ''); // a crash leaves the file; nobody listens
  assert.equal(await probeOperatorSocket(socketPath), 'stale');

  const server = await bindOperatorSocket(answer, socketPath);
  assert.equal(await probeOperatorSocket(socketPath), 'live');
  await server.close();
  assert.equal(await probeOperatorSocket(socketPath), 'absent');
  assert.equal(boundOperatorSocket(), undefined);
  await server.close(); // idempotent: a second close never reaches for a path it no longer owns
});

test('the two refusals are two sentences', () => {
  assert.match(socketRefusal('ENOENT', '/x/ronin.sock'), /no Ronin has started on this box \(no socket at \/x\/ronin.sock\)/);
  assert.match(socketRefusal('ECONNREFUSED', '/x/ronin.sock'), /Ronin is not running \(socket at \/x\/ronin.sock, nobody listening\)/);
  assert.notEqual(socketRefusal('ENOENT', '/x/ronin.sock'), socketRefusal('ECONNREFUSED', '/x/ronin.sock'));
});
