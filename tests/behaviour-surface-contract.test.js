import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const surface = await readFile(new URL('../public/js/behaviour-surface.js', import.meta.url), 'utf8');
const campaign = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
const launch = await readFile(new URL('../public/js/launch-view.js', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../public/js/workbench-catalog.js', import.meta.url), 'utf8');
const docs = await readFile(new URL('../public/js/docs.js', import.meta.url), 'utf8');
const agent = await readFile(new URL('../public/js/new-agent.js', import.meta.url), 'utf8');
const cowork = await readFile(new URL('../public/js/cowork-view.js', import.meta.url), 'utf8');

test('Behavior work surface reads every scope and edits optional guidance through the existing API', () => {
  assert.match(surface, /createStoneWorkSurface/);
  assert.match(surface, /\/api\/ways\/\$\{encodeURIComponent\(row\.scope\)\}/);
  assert.match(surface, /renderMarkdownDocument/);
  assert.match(surface, /if \(row\.scope !== 'selected'\) return/);
  assert.match(surface, /method: 'POST'/);
  assert.match(surface, /method: 'PUT'/);
  assert.match(surface, /shadow: true/);
  assert.doesNotMatch(surface, /bh-view-only/);
  assert.match(surface, /All Cowork Agents/);
  assert.match(surface, /Conditional/);
});

test('the central catalog registers Behavior once and admits every reading profile', () => {
  assert.match(catalog, /registerBehaviourSurface\(\)/);
  for (const profile of ['launch', 'cowork', 'team', 'campaign']) {
    assert.match(catalog, new RegExp(`profiles\\.define\\(WORKBENCH_PROFILES\\.${profile}, \\[.*BEHAVIOUR_SURFACE_TYPE`));
  }
  assert.match(campaign, /registerWorkbenchCatalog\(\)/);
  assert.match(launch, /registerWorkbenchCatalog\(\)/);
  assert.doesNotMatch(campaign, /registerBehaviourSurface/);
  assert.doesNotMatch(launch, /registerBehaviourSurface/);
});

test('Behavior implementation keeps the coordinated Docs editor boundary untouched', () => {
  assert.doesNotMatch(surface, /from ['"]\.\/docs\.js/);
  assert.match(docs, /export function createDocumentWorkspaceAdapter/);
});

test('New Agent offers the shared Behavior surface beside its optional choices', () => {
  assert.match(agent, /Customize Behaviors/);
  assert.match(agent, /openBehaviours\?\.\(\)/);
  assert.match(cowork, /openBehaviours: \(\) => bench\.place\(BEHAVIOUR_SURFACE_TYPE, oppositeSeat\(id\)\)/);
  assert.match(agent, /ronin:behaviours-changed/);
});
