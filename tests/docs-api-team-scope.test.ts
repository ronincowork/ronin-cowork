/**
 * THE DOCS SHELVES, SCOPED TO A TEAM (KAN-326): /api/docs?team=<name> gives the Team's Workspace's
 * plans and the Workspace Folders that Workspace names (repos and folders), with `scope` saying so;
 * another Workspace's plans and folders are left out. Without a team, every Workspace's.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-docs-scope-'));
process.env.RONIN_DATA_ROOT = path.join(dir, 'data');
process.env.RONIN_USER_ROOT = path.join(dir, 'user');
process.env.RONIN_TEAM_ROSTERS_DIR = path.join(dir, 'team_rosters');
delete process.env.RONIN_SOCKET;
delete process.env.TMUX;

const { saveWorkspace } = await import('../src/workspaces.js');
const { createTeamRoster } = await import('../src/team-rosters.js');
const { upsertProjectRoot } = await import('../src/project-roots.js');
const { plansDir, headerLine } = await import('../src/plans.js');
const { registerDocs } = await import('../src/routes/docs-api.js');

// Three Workspace Folders, each with one doc: shop names alpha (a repo) and beta (a folder); depot names other.
for (const name of ['alpha', 'beta', 'other']) {
  const at = path.join(dir, name);
  await fs.mkdir(path.join(at, 'docs'), { recursive: true });
  await fs.writeFile(path.join(at, 'docs', `${name}.md`), `# ${name}\n`);
  await upsertProjectRoot(name, { dir: at }, { declareArrangement: false });
}
const blank = { title: '', objective: '', instructions: '', launch_mode: 'configured' as const };
await saveWorkspace({ ...blank, name: 'shop', campaign_id: 'camp', repos: [{ name: 'alpha', note: '' }], folders: [{ name: 'beta', note: '' }] });
await saveWorkspace({ ...blank, name: 'depot', campaign_id: 'camp', repos: [{ name: 'other', note: '' }], folders: [] });
await createTeamRoster('crew', { objective: 'build', workspace: 'shop' }, 'camp');
for (const [workspace, plan] of [['shop', 'shop-plan'], ['depot', 'depot-plan']]) {
  const at = await plansDir('camp', workspace);
  await fs.mkdir(at, { recursive: true });
  await fs.writeFile(path.join(at, `${plan}.md`), `# ${plan}\n${headerLine({ status: 'Draft', date: '2026-11-09', by: 't' })}\n`);
}

const app = express();
registerDocs(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
test.after(() => server.close());

type Shelf = { scope: { workspace: string; folders?: string[] } | null; groups: Array<{ root: string; files: string[] }> };
const shelf = async (query: string): Promise<Shelf> => {
  const res = await fetch(`${base}/api/docs?${query}`);
  assert.equal(res.status, 200);
  return res.json() as Promise<Shelf>;
};
const names = (s: Shelf) => s.groups.flatMap((g) => g.files.map((f) => path.basename(f))).sort();

test("a Team's Plans are its Workspace's only, and say so", async () => {
  const s = await shelf('shelf=plans&team=crew');
  assert.deepEqual(s.scope, { workspace: 'shop' });
  assert.deepEqual(s.groups.map((g) => g.root), ['shop']);
  assert.deepEqual(names(s), ['shop-plan.md'], "depot's plan is not crew's");
});

test("a Team's Docs are the folders its Workspace names, repos and folders; another Workspace's are out", async () => {
  const s = await shelf('shelf=docs&team=crew');
  assert.deepEqual(s.scope, { workspace: 'shop', folders: ['alpha', 'beta'] });
  assert.deepEqual(names(s), ['alpha.md', 'beta.md']);
});

test('without a team, or for a Team with no roster, the shelves are every Workspace\'s', async () => {
  for (const query of ['shelf=plans', 'shelf=plans&team=nobody']) {
    const s = await shelf(query);
    assert.equal(s.scope, null);
    assert.deepEqual(names(s), ['depot-plan.md', 'shop-plan.md']);
  }
  const all = await shelf('shelf=docs');
  assert.equal(all.scope, null);
  assert.deepEqual(names(all), ['alpha.md', 'beta.md', 'other.md']);
});
