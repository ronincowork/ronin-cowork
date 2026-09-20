import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Workbench owns one non-destructive dismissal boundary for every surface header', async () => {
  const workbench = await source('workbench.js');
  assert.match(workbench, /const dismiss = \(id, expected = null\) => \{/);
  assert.match(workbench, /if \(expected && previous !== expected\) return true;/);
  assert.match(workbench, /if \(value\?\.leave\?\.\(\) === false\) return false;/);
  assert.match(workbench, /if \(!restoreDefault\(id\)\) return false;/);
  assert.match(workbench, /refreshSelector\(\);\s*options\.onPlacement\?\.\(snapshot\(\), \{ dismissed: id \}\);/);
  assert.match(workbench, /consumed: \(\) => dismiss\(id, owned\)/);
  assert.match(workbench, /className: 'wk-surface-dismiss', action: \(\) => dismiss\(id\)/);
  assert.doesNotMatch(workbench, /const dismiss = WorkspacePrimitives\.createAction/);
  assert.match(workbench, /querySelector\('\.tile-head \.minimize'\)\?\.addEventListener\('click', \(\) => dismiss\(id\)\)/);
  assert.match(workbench, /restoreDefault, dismiss, isDefault/);
  assert.doesNotMatch(workbench, /Tile\.kill|retireSession/);
});

test('all Workbench defaults share the quiet Ronin surface', async () => {
  const [primitives, setup, launch, campaign, css] = await Promise.all([
    source('workspace-primitives.js'), source('setup-view.js'), source('launch-view.js'),
    source('campaign-view.js'), readFile(new URL('../public/style.css', import.meta.url), 'utf8'),
  ]);
  assert.match(primitives, /function createBlankSurface/);
  assert.match(primitives, /logo\.src = 'brand\/nin-mark\.svg'/);
  for (const consumer of [setup, launch, campaign]) assert.match(consumer, /primitives\.createBlankSurface/);
  assert.match(css, /\.wk-blank-surface[\s\S]*\.wk-blank-surface > \.wk-surface-header \{ display: none; \}/);
});

test('New Team is consumed only after complete creation and destination opening', async () => {
  const [form, cowork, catalog, launch] = await Promise.all([
    source('new-team-form.js'), source('cowork-view.js'), source('workbench-catalog.js'), source('launch-view.js'),
  ]);
  assert.match(form, /\{ created = null, consumed = null, embedded = false \}/);
  assert.match(form, /if \(launched\.length\) openLaunchHandoff\(\{ team: name, sessions: launched \}, launchTab\);[\s\S]*await created\?\.\(name\);\s*await consumed\?\.\(\);/);
  const partial = form.slice(form.indexOf('if (refused.length)'), form.indexOf("notice.set('', '')"));
  assert.doesNotMatch(partial, /consumed/);
  assert.match(catalog, /environment\.newTeamForm\(workspace, consumed\)/);
  assert.match(cowork, /createNewTeamFormView\(WorkspaceKit, \{ consumed,/);
  assert.match(launch, /team: \(workspace, _detail, consumed\)[\s\S]*createNewTeamFormView\(WorkspaceKit, \{\s*consumed,/);
});

test('New Agent consumes its workbench form only after a successful handoff', async () => {
  const [form, cowork, setup, catalog, launch] = await Promise.all([
    source('new-agent.js'), source('cowork-view.js'), source('setup-surfaces.js'),
    source('workbench-catalog.js'), source('launch-view.js'),
  ]);
  assert.match(form, /\{ connect = null, consumed = null, embedded = false, team = null,[^}]+ \}/);
  assert.match(form, /if \(connect\) await connect\(born\);\s*else openLaunchHandoff\([^;]+;\s*clearAfterLaunch\(\);\s*await consumed\?\.\(\);/);
  assert.match(catalog, /environment\.newAgent\(workspace, consumed\)/);
  assert.match(cowork, /createNewAgentView\(WorkspaceKit, \{\s*consumed,/);
  assert.match(launch, /agent: \(workspace, _detail, consumed\)[\s\S]*createNewAgentView\(WorkspaceKit, \{ consumed \}\)/);
  assert.doesNotMatch(setup, /createEmbeddedNewAgentView\([^)]*consumed/);
});
