import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';

const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-root-profile-create-'));
const catalogs = path.join(box, 'catalogs');
await mkdir(catalogs, { recursive: true });
process.env.RONIN_CATALOGS_DIR = catalogs;

const { listProjectRoots, upsertProjectRoot } = await import('../src/project-roots.js');
const { arrangementProfile, setArrangementProfile } = await import('../src/desks/arrangement.js');

test('new root creation can defer declaration and write the owner-proposed profile', async () => {
  const repo = path.join(box, 'repo'); await mkdir(repo);
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'trunk']);
  await upsertProjectRoot('custom', { dir: repo }, { declareArrangement: false });
  await assert.rejects(access(path.join(repo, 'RONIN_REPO')), /ENOENT/);

  const written = await setArrangementProfile(repo, {
    mode: 'reviewed', working: 'gather', stable: 'ship', worktrees: 'enabled',
  });
  assert.deepEqual(arrangementProfile(written), {
    mode: 'reviewed', working: 'gather', stable: 'ship', worktrees: 'enabled',
  });
  assert.equal(await readFile(path.join(repo, 'RONIN_REPO'), 'utf8'), 'mode=reviewed\nworking=gather\nstable=ship\ndesks=managed\n');
});

test('non-git root remains legal when automatic declaration is deferred', async () => {
  const plain = path.join(box, 'plain'); await mkdir(plain);
  await upsertProjectRoot('plain', { title: 'Plain Workspace', dir: plain }, { declareArrangement: false });
  await assert.rejects(access(path.join(plain, 'RONIN_REPO')), /ENOENT/);
  const root = (await listProjectRoots()).find((row) => row.name === 'plain');
  assert.equal(root?.title, 'Plain Workspace');
  assert.equal(root?.name, 'plain', 'the display title never replaces the Workspace Folder handle');
});

test.after(async () => { await rm(box, { recursive: true, force: true }); });
