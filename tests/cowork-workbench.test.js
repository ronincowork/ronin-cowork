import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Cowork discovery offers existing no-Team Agents as ordinary Agent destination doors', async () => {
  const [text, catalog] = await Promise.all([source('cowork-view.js'), source('workbench-catalog.js')]);
  assert.match(catalog, /profiles\.define\(WORKBENCH_PROFILES\.cowork, \[[^\]]*WORKBENCH_TYPES\.terminal/);
  assert.match(text, /sessions: \(\) => \(campaign \? unassignedSessions\(\) : membersOfTeam\(team\)\)\.map/);
  assert.match(text, /campaign \? \{ action: \(\) => openAgentWorkbench\(member\.name\) \} : \{\}/);
});

test('Cowork launches use the standalone handoff while Team launches retain in-page seating', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /connect: campaign \? null : \(name\) => connectSession\(name, id\)/);
});

test('Teams opens its roster and New Team form in the two default workspaces', async () => {
  const text = await source('cowork-view.js');
  assert.match(text, /seats: campaign \? \{ workspace1: WB_TYPES\.roster, workspace2: WB_TYPES\.newTeamForm \} : \{\}/);
});

// The Desk workbench, a card-for-card duplicate of Cowork, is deleted (owner, 2026-10-20); the old
// Home's Desk door opens the Teams workbench at #/cowork. The desk PROFILE (skins, words) stays.
test('there is no Desk workbench: one Teams workbench at #/cowork (owner, 2026-10-20)', async () => {
  const [main, view, catalog, current] = await Promise.all([
    source('main.js'), source('cowork-view.js'), source('workbench-catalog.js'), source('current-home.js'),
  ]);
  assert.doesNotMatch(main, /desk-view|register\('desk'/);
  assert.doesNotMatch(catalog, /WORKBENCH_PROFILES\.desk|desk: 'desk'/);
  assert.doesNotMatch(view, /options\.kind === 'desk'/);
  assert.match(current, /key: 'desk', route: 'cowork'/, 'the old Home\u2019s Desk door opens the Teams workbench');
});
