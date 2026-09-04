import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toRequests } from '../public/js/machine-settings-schema.js';
import { MACHINE_SETTINGS_SCHEMA } from '../src/machine-settings-schema.js';

test('cowork_setup is the live two-stage companion page, not the legacy renderer', async () => {
  const source = await readFile(new URL('../public/js/cowork-setup.js', import.meta.url), 'utf8');
  for (const phrase of [
    'YOU’RE CONNECTED', 'Make this coworkspace yours.', 'Set up your coworkspace',
    'Campaign', 'This machine', 'You', 'Kind', 'Routine Bundles', 'Your agents',
    'How new sessions should start', 'Optional', 'When you save', 'Save and open RoninCoWork',
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /\/api\/machine-settings/);
  assert.match(source, /\/api\/agents/);
  assert.match(source, /\/api\/session-launch-specs/);
  assert.match(source, /toRequests\(schema, values\)/);
  assert.match(source, /Your first workspace folder/);
  assert.match(source, /createFolderPicker/);
  assert.match(source, /\/api\/project-roots\/inspect/);
  assert.match(source, /folder_skipped/);
});

test('the two setup asks are registry rows and the renderer carries no client field list', async () => {
  const registry = await readFile(new URL('../src/machine-settings-schema.ts', import.meta.url), 'utf8');
  const source = await readFile(new URL('../public/js/cowork-setup.js', import.meta.url), 'utf8');
  assert.match(registry, /id: 'mainIntent'/);
  assert.match(registry, /id: 'routineBundle'/);
  assert.match(registry, /seed: 'open'/);
  assert.match(registry, /seed: 'worktrees'/);
  assert.doesNotMatch(source, /\['coding', 'work', 'personal'/);
});

test('the setup seat names its behaviour and carries no retired launch role', () => {
  assert.deepEqual(MACHINE_SETTINGS_SCHEMA.seat.behaviours, ['ways:setup']);
  assert.ok(!('session_role' in MACHINE_SETTINGS_SCHEMA.seat));
});

test('registry metadata writes the campaign bootstrap without a client field list', () => {
  const schema = {
    fields: [
      { id: 'intent', lands: { family: 'bootstrap', key: 'kind' } },
      { id: 'model', shape: 'provider-model', lands: { family: 'agents', key: 'sessions.default' }, setup_lands: { family: 'bootstrap', key: 'provider_model' } },
    ],
    families: { bootstrap: { route: '/api/machine-settings', method: 'PATCH' }, agents: { route: '/api/machine-settings', method: 'PATCH' } },
  };
  const rows = toRequests(schema, { intent: 'coding', model: 'openai\tgpt-5' });
  assert.deepEqual(rows.find((row) => row.family === 'bootstrap')?.json, {
    family: 'bootstrap', value: {
      kind: 'coding', provider_model: { provider: 'openai', model: 'gpt-5' },
    },
  });
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
