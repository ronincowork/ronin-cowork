import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('folder browser lists directories only and hides dot folders by default', async () => {
  const base = await mkdtemp(path.join(os.homedir(), '.ronin-folder-test-'));
  try {
    await mkdir(path.join(base, 'Alpha'));
    await mkdir(path.join(base, '.secret'));
    const { browseFolders } = await import('../src/folder-browser.js');
    assert.deepEqual((await browseFolders(base)).folders, [{ name: 'Alpha', dir: path.join(base, 'Alpha'), kind: 'folder', repository: false }]);
    assert.deepEqual((await browseFolders(base, { hidden: true })).folders.map((x) => x.name), ['.secret', 'Alpha']);
    assert.deepEqual((await browseFolders(base, { query: 'ph' })).folders.map((x) => x.name), ['Alpha']);
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('folder browser classifies only each immediate entry direct .git marker', async () => {
  const base = await mkdtemp(path.join(os.homedir(), '.ronin-folder-test-'));
  try {
    await mkdir(path.join(base, 'Repo', '.git'), { recursive: true });
    await mkdir(path.join(base, 'Worktree'));
    await writeFile(path.join(base, 'Worktree', '.git'), 'gitdir: elsewhere\n');
    await mkdir(path.join(base, 'Parent', 'Nested', '.git'), { recursive: true });
    const { browseFolders } = await import('../src/folder-browser.js');
    const byName = Object.fromEntries((await browseFolders(base)).folders.map((item) => [item.name, item]));
    assert.equal(byName.Repo.kind, 'repository');
    assert.equal(byName.Repo.repository, true);
    assert.equal(byName.Worktree.kind, 'repository');
    assert.equal(byName.Parent.kind, 'folder', 'a descendant repository is not scanned or attributed to its parent');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('folder creation stays under home and can initialize local git without a remote', async () => {
  const base = await mkdtemp(path.join(os.homedir(), '.ronin-folder-test-'));
  try {
    const { createFolder } = await import('../src/folder-browser.js');
    const made = await createFolder(base, 'New Work', true);
    assert.equal(made.git, true);
    const { repoFacts } = await import('../src/project-roots.js');
    const facts = await repoFacts({ name: 'new-work', dir: made.dir, match: [], remit: '', docs: [], plans: [], archived: false, campaign_id: '' });
    assert.equal(facts.repo?.remote, '');
    await assert.rejects(() => createFolder('/tmp', 'outside'), /inside your home/);
    await assert.rejects(() => createFolder(base, '../outside'), /without slashes/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
