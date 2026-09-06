import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('Launch-your-own adapters open existing forms in a new tab without submitting', async () => {
  const [workspace, launch] = await Promise.all([source('workspace.js'), source('launch-view.js')]);
  assert.match(workspace, /openLaunchForm\(context, \{ kind, seed = \{\} \} = \{\}\)/);
  assert.match(workspace, /\['agent', 'team'\]\.includes\(kind\)/);
  assert.match(workspace, /window\.open\('about:blank', '_blank'\)/);
  assert.match(workspace, /context\.patchViewState\('launch', \{ preload: previous\.preload \}\)/);
  assert.match(workspace, /openTemplateLaunchForm/);
  assert.doesNotMatch(workspace, /request\('.*api\/launch/);
  assert.match(launch, /preload\.kind === 'template'/);
  assert.match(launch, /bench\.place\(TYPES\.agent, 'workspace1'/);
  assert.match(launch, /bench\.place\(TYPES\.team, 'workspace2'/);
  assert.match(launch, /patchViewState\('launch', \{ preload: null \}\)/);
});

test('the document adaptor sends root-name and relative path through the existing editor', async () => {
  const docs = await source('docs.js');
  assert.match(docs, /createDocumentWorkspaceAdapter/);
  assert.match(docs, /new URLSearchParams\(\{ path: target\.path \}\)/);
  assert.match(docs, /query\.set\('root', target\.root\)/);
  assert.match(docs, /buildDocs\(null, el/);
  assert.doesNotMatch(docs, /fetch\(/);
});
