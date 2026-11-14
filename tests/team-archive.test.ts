import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// KAN-500: archiving a Team takes it off every member, through the one detach path.
const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-team-archive-'));
process.env.TMUX = '';
process.env.TMUX_TMPDIR = path.join(box, 'tmux');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(box, 'teams');
process.env.RONIN_WIPEBOARDS_DIR = path.join(box, 'wipeboards');
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.HOME = path.join(box, 'home');
await mkdir(process.env.TMUX_TMPDIR, { recursive: true, mode: 0o700 });

const tmux = await import('../src/tmux.js');
const { createTeamRoster, readTeamRoster } = await import('../src/team-rosters.js');
const { registerTeams } = await import('../src/routes/teams-api.js');

const app = express();
app.use(express.json());
registerTeams(app);
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const idle = { agent: false, argv: ['/bin/sh', '-c', 'while :; do sleep 60; done'] };

test('archiving a Team takes its tag and lead mark off every member, and leaves other Teams', async () => {
  await createTeamRoster('ways', { title: 'Ways' });
  await createTeamRoster('behaviours', { title: 'Behaviours' });
  await tmux.createSession('ways_lead', box, idle);
  await tmux.setTags('ways_lead', ['behaviours', 'ways']);
  await tmux.setLeads('ways_lead', ['behaviours', 'ways']);
  await tmux.createSession('ways_member', box, idle);
  await tmux.setTags('ways_member', ['ways']);

  const response = await fetch(`${base}/api/team-rosters/ways`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: 'archived' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await readTeamRoster('ways'))?.state, 'archived', 'the roster stays, archived');
  assert.deepEqual(await tmux.getTags('ways_lead'), ['behaviours']);
  assert.deepEqual(await tmux.getLeads('ways_lead'), ['behaviours']);
  assert.deepEqual(await tmux.getTags('ways_member'), []);
});

test('PUT /api/team on an archived Team adds nobody to it', async () => {
  await tmux.createSession('late_member', box, idle);
  const response = await fetch(`${base}/api/team`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ways', state: 'archived', session_names: ['late_member'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(((await response.json()) as { added: string[] }).added, []);
  assert.deepEqual(await tmux.getTags('late_member'), []);
});

test.after(async () => {
  server.close();
  for (const name of ['ways_lead', 'ways_member', 'late_member']) await tmux.killSession(name).catch(() => {});
  await rm(box, { recursive: true, force: true });
});
