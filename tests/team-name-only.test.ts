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
await fs.mkdir(process.env.RONIN_CONFIG_DIR, { recursive: true });
await fs.writeFile(path.join(process.env.RONIN_CONFIG_DIR, 'machine_settings.json'), JSON.stringify({
  campaigns: {
    home_machine: {
      title: 'Home', state: 'active', created_at: '2026-01-01T00:00:00.000Z',
      config: {
        installations: {},
        defaults: {
          provider: 'openai', model: 'gpt-test', reach: 'execute', recruit: 'nobody', output: ['code'],
          behaviours: ['gbrain', 'mandates'], launch_mode: 'configured',
        },
        cowork_defaults: { project_root: 'ronin_cowork', repos: ['ronin_cowork'], branch: 'dev' },
      },
    },
  },
}));
const { registerTeams } = await import('../src/routes/teams-api.js');
const { registerLaunch } = await import('../src/routes/launch.js');

const app = express();
app.use(express.json());
registerTeams(app);
registerLaunch(app);
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
  assert.equal(body.roster.project_root, 'ronin_cowork');
  assert.deepEqual(body.roster.repos, ['ronin_cowork']);
  assert.equal(body.roster.branch, 'dev');
  assert.deepEqual(body.roster.behaviours, { selected: ['gbrain'], required: [] });
  assert.deepEqual(body.roster.agent_defaults, {
    provider: 'openai', model: 'gpt-test', reach: 'execute', recruit: 'nobody', output: ['code'],
    launch_mode: 'configured',
  });
});

test('PUT /api/team creates with Campaign defaults, then omission on update preserves them', async () => {
  const created = await fetch(`${base}/api/team`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'tool_team', objective: 'first' }),
  });
  assert.equal(created.status, 200);
  const first = await created.json() as { created: boolean; roster: Record<string, any> };
  assert.equal(first.created, true);
  assert.equal(first.roster.project_root, 'ronin_cowork');
  assert.deepEqual(first.roster.repos, ['ronin_cowork']);
  assert.equal(first.roster.branch, 'dev');
  assert.deepEqual(first.roster.behaviours.selected, ['gbrain']);
  assert.equal(first.roster.agent_defaults.model, 'gpt-test');

  const updated = await fetch(`${base}/api/team`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'tool_team', objective: 'second' }),
  });
  assert.equal(updated.status, 200);
  const second = await updated.json() as { created: boolean; roster: Record<string, any> };
  assert.equal(second.created, false);
  assert.equal(second.roster.objective, 'second');
  assert.equal(second.roster.project_root, 'ronin_cowork');
  assert.deepEqual(second.roster.repos, ['ronin_cowork']);
  assert.equal(second.roster.branch, 'dev');
  assert.deepEqual(second.roster.behaviours.selected, ['gbrain']);
  assert.equal(second.roster.agent_defaults.model, 'gpt-test');
});

test('PUT /api/team reapplies Campaign defaults to an existing Team only when explicitly requested', async () => {
  const response = await fetch(`${base}/api/team`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'tool_team', campaign_defaults: true, behaviours: { selected: ['ronin_host'], required: [] } }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { created: boolean; roster: Record<string, any> };
  assert.equal(body.created, false);
  assert.deepEqual(body.roster.behaviours.selected, ['ronin_host'], 'an explicit choice remains final');
  assert.equal(body.roster.agent_defaults.model, 'gpt-test');
});

test('POST /api/team-rosters overlays explicit choices on Campaign defaults', async () => {
  const response = await fetch(`${base}/api/team-rosters`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      name: 'overlaid', behaviours: { selected: ['ronin_host'], required: [] }, agent_defaults: { reach: 'discuss' },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { roster: Record<string, any> };
  assert.deepEqual(body.roster.behaviours.selected, ['ronin_host']);
  assert.equal(body.roster.agent_defaults.reach, 'discuss');
  assert.equal(body.roster.agent_defaults.model, 'gpt-test');
});

test('the seed door tolerates a pre-cut behaviour shape without inventing an elective mandate', async () => {
  const file = path.join(process.env.RONIN_TEAM_ROSTERS_DIR!, 'home_machine', 'installation-cascade.md');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = [
    '# installation-cascade',
    '- **title:** Installation Cascade',
    '- **kind:** coding',
    '- **behaviours:** {"books":[],"required":false}',
    '- **agent_defaults:** {}',
    '',
  ].join('\n');
  await fs.writeFile(file, raw, 'utf8');
  const response = await fetch(`${base}/api/launch-seed?team=installation-cascade`);
  assert.equal(response.status, 200);
  const seed = await response.json() as { seeds: { behaviours: { value: string[] } }; behaviours: Array<{ name: string; scope: string; on: boolean }> };
  assert.deepEqual(seed.seeds.behaviours.value, []);
  const mandates = seed.behaviours.find((row) => row.name === 'mandates');
  assert.equal(mandates?.scope, 'floor');
  assert.equal(mandates?.on, false, 'floor guidance is visible but never added to the elective seed');
  assert.equal(await fs.readFile(file, 'utf8'), raw, 'the seed read performs no migration');
});

test.after(async () => {
  server.close();
  await fs.rm(temp, { recursive: true, force: true });
});
