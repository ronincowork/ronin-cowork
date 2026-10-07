import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WORKSPACE_DESTINATIONS, WORKBENCH_APPEARANCES } from '../public/js/workspace-contract.js';
import { readingKey } from '../public/js/store.js';

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

// The key is the server's spelling of the want (src/ws/events.ts wantedReading): resource, then
// the filter's JSON in its field order, trimmed, empties dropped, roots deduped. A key spelt
// otherwise would want a reading the server answers under a different name.
test('a reading key is the server spelling of its filter', () => {
  assert.equal(readingKey('collection'), 'collection:{}');
  assert.equal(readingKey('collection', { root: ['b', 'a', 'b', ''], team: ' surface ', campaign: 'c 1', agent: 'x' }), 'collection:{"campaign":"c 1","team":"surface","root":["b","a"]}');
  assert.equal(readingKey('collection', { board: 'w3', root: 'one' }), 'collection:{"board":"w3","root":["one"]}');
  assert.equal(readingKey('work-items', { board: 'w1', team: 'surface' }), 'work-items:{"team":"surface","board":"w1"}');
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
    assert.doesNotMatch(await source(file), /\/api\/collection|\/api\/work-items/, `${file} reads through collection-reading.js`);
  }
});

// Owner 2026-09-28: Cowork and Desk offer no per-Team card. The Team profile card is a type of
// its own, offered on team-next alone; the old type stays exactly as it was.
test('the Team profile card belongs to team-next only', async () => {
  const catalog = await source('workbench-catalog.js');
  assert.match(catalog, /type: WORKBENCH_TYPES\.team, header: 'surface', discover: \(\) => \[\]/);
  assert.match(catalog, /WORKBENCH_PROFILES\.teamNext, \[[^\n]*WORKBENCH_TYPES\.teamProfile/);
  assert.doesNotMatch(catalog, /WORKBENCH_PROFILES\.(cowork|desk|team|agent), \[[^\n]*teamProfile/);
});

// Owner 2026-10-07: on team-next the Trello view and Work Items are one card, Work, with a
// toggle between the two existing surfaces; and the island is the tab name for any view
// that offers one, so the tenants on the frame have it as the old Team does.
test('team-next offers Work as one card over both existing surfaces, and the island follows tabName', async () => {
  const [catalog, teamView, work, header] = await Promise.all([source('workbench-catalog.js'), source('team-view.js'), source('work-surfaces.js'), source('workspace-header.js')]);
  assert.match(catalog, /WORKBENCH_PROFILES\.teamNext, \[[^\n]*WORKBENCH_TYPES\.teamWork/);
  assert.doesNotMatch(catalog, /WORKBENCH_PROFILES\.teamNext, \[[^\n]*WORKBENCH_TYPES\.workViews/);
  assert.match(teamView, /createWorkSurfaces\(\{/);
  assert.match(teamView, /trello: \(\) => createWorkViewsSurface\(/);
  assert.match(teamView, /workItems: \(\) => createWorkItemsSurface\(/);
  assert.match(work, /ask\(\[\{ fields: \[\{ key: 'layer'/);
  assert.match(header, /const editable = Boolean\(active\?\.view\?\.tabName\) && !\(active\?\.id === 'team' && !active\.param\)/);
});
