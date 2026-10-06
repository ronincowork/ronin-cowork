import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKSPACE_DESTINATIONS, WORKBENCH_APPEARANCES } from '../public/js/workspace-contract.js';
import { collectionQuery } from '../public/js/collection-reading.js';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

// Destination id and appearance are one word in workspace.js: a tenant missing from either
// list opens on Home instead of itself.
test('the new tenants are destinations and appearances; the Next root is a destination only', () => {
  for (const word of ['collections', 'team-next', 'board', 'workspace']) {
    assert.ok(WORKSPACE_DESTINATIONS.includes(word), `${word} destination`);
    assert.ok(WORKBENCH_APPEARANCES.includes(word), `${word} appearance`);
  }
  assert.ok(WORKSPACE_DESTINATIONS.includes('next'));
  assert.ok(!WORKBENCH_APPEARANCES.includes('next'), 'the root is a static page, not a workbench');
});

test('the same filter always makes the same query, roots repeated', () => {
  assert.equal(collectionQuery(), '');
  assert.equal(collectionQuery({ root: ['b', 'a'], team: 'surface', campaign: 'c 1' }), 'campaign=c%201&team=surface&root=b&root=a');
  assert.equal(collectionQuery({ root: 'one', board: 'w3' }), 'board=w3&root=one');
});

test('the tenant frame is the one seat machinery; tenants are thin files over it and cowork-view is untouched', async () => {
  const [frame, cowork, main] = await Promise.all([source('tenant-frame.js'), source('cowork-view.js'), source('main.js')]);
  assert.match(frame, /createWarmTerminalPool\(/);
  assert.match(frame, /WorkspaceKit\.workbench\.create\(/);
  for (const file of ['collections-view.js', 'team-view.js', 'board-view.js', 'workspace-view.js']) {
    const tenant = await source(file);
    assert.doesNotMatch(tenant, /createWarmTerminalPool|workbench\.create\(/, `${file} owns no seats`);
    assert.match(tenant, /createTenantFrame\(\{/);
  }
  assert.doesNotMatch(cowork, /tenant-frame/, 'the old file is left as it is');
  assert.match(main, /workspace\.register\('collections', createCollectionsView\(\)\)/);
  assert.match(main, /workspace\.register\('team-next', createTeamView\(\)\)/);
  assert.match(main, /workspace\.register\('board', createBoardView\(\)\)/);
  assert.match(main, /workspace\.register\('workspace', createWorkspaceView\(\)\)/);
  assert.match(main, /standing: \['collections', 'team-next', 'board', 'workspace'\]/);
});

test('only the reading seam calls the collection route among the new files', async () => {
  for (const file of ['tenant-frame.js', 'collections-view.js', 'team-view.js', 'team-commons-surface.js', 'board-view.js', 'workspace-view.js', 'reading-surface.js', 'next-home.js']) {
    assert.doesNotMatch(await source(file), /\/api\/collection/, `${file} reads through collection-reading.js`);
  }
});
