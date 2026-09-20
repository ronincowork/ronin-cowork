import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const surface = await readFile(new URL('../public/js/behaviour-surface.js', import.meta.url), 'utf8');
const campaign = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
const launch = await readFile(new URL('../public/js/launch-view.js', import.meta.url), 'utf8');
const docs = await readFile(new URL('../public/js/docs.js', import.meta.url), 'utf8');

test('Behavior work surface uses the shared stone surface and typed ways API', () => {
  assert.match(surface, /createStoneWorkSurface/);
  assert.match(surface, /\/api\/ways\/\$\{encodeURIComponent\(row\.scope\)\}/);
  assert.match(surface, /shadow: true/);
  assert.match(surface, /revision: reading\.revision/);
  assert.match(surface, /Add Your Own/);
  assert.match(surface, /Auto Selected/);
  assert.match(surface, /Conditional/);
});

test('Settings and launch profiles register the same Behavior surface', () => {
  assert.match(campaign, /registerBehaviourSurface\(\)/);
  assert.match(campaign, /TYPES\.machine, TYPES\.behaviours/);
  assert.match(launch, /registerBehaviourSurface\(\)/);
  assert.match(launch, /TYPES\.behaviours/);
});

test('Behavior implementation keeps the coordinated Docs editor boundary untouched', () => {
  assert.doesNotMatch(surface, /from ['"]\.\/docs\.js/);
  assert.match(docs, /export function createDocumentWorkspaceAdapter/);
});
