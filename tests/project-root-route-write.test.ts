import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-project-root-route-'));
process.env.BIND = '127.0.0.1';
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.RONIN_CATALOGS_DIR = path.join(box, 'user', 'catalogs');
const { registerCatalogs } = await import('../src/routes/catalogs.js');
const { listProjectRoots } = await import('../src/project-roots.js');

const app = express();
app.use(express.json());
registerCatalogs(app);
const server = createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function repo(name: string) {
  const dir = path.join(box, name);
  await mkdir(dir);
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main']);
  return dir;
}

async function send(route: string, method: string, body: unknown) {
  const response = await fetch(`${base}${route}`, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as { error?: string; repo_profile?: unknown; profile_changed_since_open?: boolean; current_before?: unknown } };
}

test('registers a declared repository without confirmation fields or rewriting RONIN_REPO', async () => {
  const dir = await repo('declared');
  const declaration = '# owner choice\nmode=reviewed\nworking=develop\nstable=main\ndesks=managed\n';
  await writeFile(path.join(dir, 'RONIN_REPO'), declaration);
  const result = await send('/api/project-roots', 'POST', { name: 'declared', dir });
  assert.equal(result.status, 200, result.body.error);
  assert.deepEqual(result.body.repo_profile, { mode: 'reviewed', working: 'develop', stable: 'main', worktrees: 'enabled' });
  assert.equal(await readFile(path.join(dir, 'RONIN_REPO'), 'utf8'), declaration);
});

test('accepts an explicit repository profile without a confirmation flag or before value', async () => {
  const dir = await repo('profiled');
  const created = await send('/api/project-roots', 'POST', {
    name: 'profiled', dir,
    profile: { mode: 'direct', working: '', stable: 'main', worktrees: 'disabled' },
  });
  assert.equal(created.status, 200, created.body.error);
  const changed = await send('/api/project-roots/profiled/repo-profile', 'PUT', {
    profile: { mode: 'reviewed', working: 'develop', stable: 'release', worktrees: 'enabled' },
  });
  assert.equal(changed.status, 200, changed.body.error);
  assert.match(await readFile(path.join(dir, 'RONIN_REPO'), 'utf8'), /^working=develop$/m);
});

test('reports a repository profile changed since the form opened while applying the requested edit', async () => {
  const dir = await repo('changed');
  await writeFile(path.join(dir, 'RONIN_REPO'), 'mode=direct\nstable=main\ndesks=none\n');
  const created = await send('/api/project-roots', 'POST', { name: 'changed', dir });
  assert.equal(created.status, 200, created.body.error);
  const before = { mode: 'direct', working: '', stable: 'main', worktrees: 'disabled' };
  await writeFile(path.join(dir, 'RONIN_REPO'), 'mode=reviewed\nworking=develop\nstable=main\ndesks=managed\n');
  const changed = await send('/api/project-roots/changed/repo-profile', 'PUT', {
    before, profile: { mode: 'direct', working: '', stable: 'release', worktrees: 'disabled' },
  });
  assert.equal(changed.status, 200, changed.body.error);
  assert.equal(changed.body.profile_changed_since_open, true);
  assert.deepEqual(changed.body.current_before, { mode: 'reviewed', working: 'develop', stable: 'main', worktrees: 'enabled' });
  assert.match(await readFile(path.join(dir, 'RONIN_REPO'), 'utf8'), /^stable=release$/m);
});

test('rejects a malformed repository profile before adding a catalog entry', async () => {
  const dir = await repo('invalid');
  const result = await send('/api/project-roots', 'POST', {
    name: 'invalid', dir,
    profile: { mode: 'reviewed', working: 'bad..ref', stable: 'main', worktrees: 'enabled' },
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error ?? '', /working must be a branch name/);
  assert.equal((await listProjectRoots()).some((root) => root.name === 'invalid'), false);
});

test.after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(box, { recursive: true, force: true });
});
