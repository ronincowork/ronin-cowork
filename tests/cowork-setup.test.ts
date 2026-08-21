import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cowork_setup is the live two-stage companion page, not the legacy renderer', async () => {
  const source = await readFile(new URL('../public/js/cowork-setup.js', import.meta.url), 'utf8');
  for (const phrase of [
    'YOU’RE CONNECTED', 'Make this coworkspace yours.', 'Set up your coworkspace',
    'Start your first project', 'When you save', 'Save and open RoninCoWork',
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /\/api\/settei/);
  assert.match(source, /\/api\/agents/);
  assert.match(source, /\/api\/session-launch-specs/);
  assert.match(source, /\/api\/project-roots\/inspect/);
  assert.match(source, /toRequests\(schema, values\)/);
});

test('the old first-run entry delegates to cowork_setup', async () => {
  const source = await readFile(new URL('../public/js/firstrun.js', import.meta.url), 'utf8');
  assert.match(source, /cowork-setup\.js/);
  assert.doesNotMatch(source, /Set up your coworkspace/);
});

test('cowork_setup owns the canonical route and the old name only redirects', async () => {
  const source = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/cowork_setup'/);
  assert.match(source, /pathname === '\/cowork_setup'/);
  assert.match(source, /history\.replaceState\([^\n]+'\/cowork_setup'/);
  assert.match(source, /location\.href = '\/\?' \+ q/);
  assert.match(source, /has\('setup'\)/);
});
