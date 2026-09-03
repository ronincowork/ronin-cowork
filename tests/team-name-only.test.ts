import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-name-only-team-'));
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_WIPEBOARDS_DIR = path.join(temp, 'wipeboards');
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
const { registerTeams } = await import('../src/routes/teams-api.js');

const app = express();
app.use(express.json());
registerTeams(app);
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

test('POST /api/team-rosters creates a Team from its name alone', async () => {
  const response = await fetch(`${base}/api/team-rosters`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'name_only' }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { roster: Record<string, unknown> };
  assert.equal(body.roster.title, 'Name Only');
  assert.equal(body.roster.kind, 'open');
  assert.equal(body.roster.wipeboard, 'name_only');
});

test.after(async () => {
  server.close();
  await fs.rm(temp, { recursive: true, force: true });
});
