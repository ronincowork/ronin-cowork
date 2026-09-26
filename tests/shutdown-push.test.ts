import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { WebSocket } from 'ws';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-shutdown-push-'));
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
process.env.RONIN_CATALOGS_DIR = path.join(tmp, 'catalogs');

test('a shutdown pushes each phase and its end to /events, and the POST answers the started state', async (t) => {
  const server = await openTestServer('shutdown_push', { onPath: true });
  t.after(async () => { await closeTestServer(server); await fs.rm(tmp, { recursive: true, force: true }); });
  await server.run('new-session', '-d', '-s', 'leaving');

  const { handleEvents } = await import('../src/ws/events.js');
  const sent: Array<Record<string, unknown>> = [];
  const handlers = new Map<string, () => void>();
  const ws = { OPEN: 1, readyState: 1, send: (text: string) => sent.push(JSON.parse(text)), on: (e: string, fn: () => void) => handlers.set(e, fn) };
  handleEvents(ws as unknown as WebSocket);
  t.after(() => handlers.get('close')?.());

  const { registerSessions } = await import('../src/routes/sessions-api.js');
  const app = express();
  app.use(express.json());
  registerSessions(app);
  const http = app.listen(0, '127.0.0.1');
  t.after(() => http.close());
  await new Promise((resolve) => http.once('listening', resolve));
  const r = await fetch(`http://127.0.0.1:${(http.address() as AddressInfo).port}/api/sessions/leaving/shutdown`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(r.status, 202);
  const started = await r.json() as { id: string; state: string };
  assert.equal(started.state, 'running');

  const pushes = () => sent.filter((m) => m.t === 'shutdown' && m.id === started.id);
  for (let i = 0; i < 200 && !pushes().some((m) => m.state !== 'running'); i++) await new Promise((res) => setTimeout(res, 25));
  const phases = pushes().map((m) => m.phase);
  assert.ok(phases.includes('checking_desks'), `phases pushed: ${phases.join(', ')}`);
  assert.equal(pushes().at(-1)?.state, 'complete', 'the end is pushed last');
  assert.equal(pushes().filter((m) => m.state !== 'running').length, 1, 'once');
});
