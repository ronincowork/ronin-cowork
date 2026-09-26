import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { closeTestServer, openTestServer } from './helpers/testserver.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-desks-session-'));
process.env.RONIN_DESKS_DIR = path.join(tmp, 'desks');
process.env.RONIN_CATALOGS_DIR = path.join(tmp, 'catalogs');

test('GET /api/desks?session= answers one session\'s desks, keyed by its name', async (t) => {
  const server = await openTestServer('desks_session', { onPath: true });
  t.after(async () => { await closeTestServer(server); await fs.rm(tmp, { recursive: true, force: true }); });
  await server.run('new-session', '-d', '-s', 'alpha');
  await server.run('new-session', '-d', '-s', 'beta');
  const { writeDesk } = await import('../src/desks/registry.js');
  type Rec = Parameters<typeof writeDesk>[0];
  for (const session of ['alpha', 'beta']) {
    await writeDesk({ repo: 'elsewhere', branch: `team/t/${session}`, session, state: 'open' } as unknown as Rec);
  }
  const { registerDesks } = await import('../src/routes/desks-api.js');
  const app = express();
  registerDesks(app);
  const http = app.listen(0, '127.0.0.1');
  t.after(() => http.close());
  await new Promise((resolve) => http.once('listening', resolve));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/desks`;
  const get = async (query: string) => { const r = await fetch(base + query); return { status: r.status, body: await r.json() as Record<string, { desks: Array<{ branch: string }> }> }; };

  const one = await get('?session=alpha');
  assert.deepEqual(Object.keys(one.body), ['alpha']);
  assert.deepEqual(one.body.alpha!.desks.map((d) => d.branch), ['team/t/alpha']);
  assert.deepEqual((await get('?session=ghost')).body, {}, 'a session that is not live answers nothing');
  assert.equal((await get('?session=no%20spaces')).status, 400);
  assert.equal((await get('')).status, 400, 'there is no every-desk form: name one session');
});
