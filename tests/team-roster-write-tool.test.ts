// KAN-469: the `team roster write` tool sends only keys PUT /api/team reads — --workspace
// sets the Team's Workspace by handle.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-roster-write-tool-'));
process.env.RONIN_DATA_ROOT = temp;
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(temp, 'team_rosters');
process.env.RONIN_WIPEBOARDS_DIR = path.join(temp, 'wipeboards');
process.env.RONIN_CONFIG_DIR = path.join(temp, 'config');
await fs.mkdir(process.env.RONIN_CONFIG_DIR, { recursive: true });
await fs.writeFile(path.join(process.env.RONIN_CONFIG_DIR, 'machine_settings.json'), JSON.stringify({
  campaigns: { home_machine: { title: 'Home', state: 'active', created_at: '2026-01-01T00:00:00.000Z',
    config: { installations: {}, defaults: { provider: 'openai', model: 'gpt-test', reach: 'execute', recruit: 'nobody',
      output: ['code'], behaviours: [], launch_mode: 'configured' }, cowork_defaults: {} } } },
}));
const { saveWorkspace, normalizeWorkspace } = await import('../src/workspaces.js');
const { registerTeams } = await import('../src/routes/teams-api.js');
await saveWorkspace(normalizeWorkspace('home_machine', 'shop_ws', { title: 'Shop' }));

const app = express();
app.use(express.json());
registerTeams(app);
const server: Server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());

const env = { ...process.env, RONIN_URL: base, TMUX_PANE: '', RONIN_SESSION: '' };
const tool = (...args: string[]) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    // async spawn: the in-process server must keep answering while the tool runs
    const child = spawn('bash', ['libexec/team-roster-write', ...args], { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
const roster = async (name: string) => (await (await fetch(`${base}/api/team-rosters/${name}`)).json()) as Record<string, unknown>;

test('--workspace creates a Team on that Workspace, and updates it', async () => {
  const created = await tool('shop', '--workspace', 'shop_ws', '--objective', 'sell', '--branch', 'dev');
  assert.equal(created.status, 0, created.stderr);
  assert.match(created.stdout, /^CREATED shop/);
  const first = await roster('shop');
  assert.equal(first.workspace, 'shop_ws');
  assert.equal(first.objective, 'sell');
  assert.equal(first.branch, 'dev');

  await saveWorkspace(normalizeWorkspace('home_machine', 'till_ws', { title: 'Till' }));
  const updated = await tool('shop', '--workspace', 'till_ws');
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal((await roster('shop')).workspace, 'till_ws');
  assert.equal((await roster('shop')).objective, 'sell');
});

test('the retired --root, --role and --repos are refused, not silently dropped', async () => {
  for (const flag of ['--root', '--project_root', '--role', '--team_role', '--repos']) {
    const r = await tool('shop', flag, 'x');
    assert.equal(r.status, 2, flag);
    assert.match(r.stderr, new RegExp(`BAD-ARG: ${flag}`));
  }
});

test('help teaches --workspace and not --root', () => {
  const help = spawnSync('bash', ['libexec/team-roster-write', '--help'], { encoding: 'utf8' }).stdout;
  assert.match(help, /--workspace <handle>/);
  assert.doesNotMatch(help, /--root|--repos|--role/);
});
