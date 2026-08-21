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

test('cowork_setup owns one path with no legacy mapping', async () => {
  const source = await readFile(new URL('../public/js/main.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/cowork-setup'/);
  assert.match(source, /pathname === '\/cowork-setup'/);
  assert.match(source, /history\.replaceState\([^\n]+'\/cowork-setup'/);
  assert.match(source, /location\.href = '\/\?' \+ q/);
  assert.match(source, /from '\.\/cowork-setup\.js'/);
  assert.doesNotMatch(source, /has\('setup'\)|has\('cowork_setup'\)|firstrun/);
});
