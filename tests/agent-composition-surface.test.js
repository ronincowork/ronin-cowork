import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ui = await readFile(new URL('../public/js/agent-composition.js', import.meta.url), 'utf8');
const routes = await readFile(new URL('../src/routes/sessions-api.ts', import.meta.url), 'utf8');
const behaviours = await readFile(new URL('../src/behaviours.ts', import.meta.url), 'utf8');

test('Agent composition uses the shared selector and preserves many-valued Output', () => {
  assert.match(ui, /import \{ ask \} from '\.\/ask\.js'/);
  assert.doesNotMatch(ui, /document\.createElement\(['"]select/);
  assert.match(ui, /key: 'output'.*many: true/);
  assert.match(ui, /json: question\.value\(\)/);
  assert.doesNotMatch(ui, /output\?\.\[0\]/);
});

test('live composition mutations use owner delivery provenance and never expose removal', () => {
  const ownerCalls = routes.match(/enqueueMessage\([^;]+, 'owner'\)/gs) || [];
  assert.ok(ownerCalls.length >= 2);
  assert.match(routes, /enqueueMessage[\s\S]*addCurrentBehaviour/);
  assert.match(routes, /resolveBehaviourBooks/);
  assert.match(behaviours, /scope === 'selected'/);
  assert.match(routes, /already part of the current composition/);
  assert.doesNotMatch(routes, /delete\('\/api\/sessions\/:name\/composition/);
});
