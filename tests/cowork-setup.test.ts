import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getPath, toRequest, toRequests } from '../public/js/machine-settings-schema.js';
import { MACHINE_SETTINGS_SCHEMA, providerModelFields } from '../src/machine-settings-schema.js';

test('cowork_setup is the live two-stage companion page, not the legacy renderer', async () => {
  const source = await readFile(new URL('../public/js/cowork-setup.js', import.meta.url), 'utf8');
  for (const phrase of [
    'YOU’RE CONNECTED', 'Make this coworkspace yours.', 'Set up your coworkspace',
    'Campaign', 'This machine', 'You', 'Kind', 'Routine Bundles', 'Your agents',
    'How new sessions should start', 'Optional', 'When you save', 'Save and open RoninCoWork',
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /\/api\/machine-settings/);
  assert.match(source, /\/api\/agents/);
  // The model fields are the one picker, which reads the provider catalog itself.
  assert.match(source, /providerModelPair/);
  assert.match(source, /loadProviderCatalog\(\)/);
  assert.doesNotMatch(source, /session-launch-specs|LIGHT|modelOpts|Claude Code/);
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

test('the real registry builds one complete setup request per family', () => {
  const fields = [...MACHINE_SETTINGS_SCHEMA.fields, ...providerModelFields(['anthropic'])];
  const schema = { ...MACHINE_SETTINGS_SCHEMA, fields };
  const values = Object.fromEntries(fields.map((field) => [
    field.id,
    field.shape === 'provider-model' ? 'anthropic\tclaude-sonnet-4-5'
      : field.kind === 'number' ? '3'
        : field.id === 'routineBundle' ? 'worktrees'
          : field.id === 'mainIntent' ? 'coding'
            : `${field.id}-answer`,
  ]));

  const rows = toRequests(schema, values);
  const families = fields.map((field) => field.lands.family);
  assert.equal(rows.length, new Set(families).size);
  assert.equal(new Set(rows.map((row) => row.family)).size, rows.length);
  for (const row of rows) {
    assert.equal(row.route, '/api/machine-settings');
    assert.equal(row.method, 'PATCH');
    assert.equal(row.json.family, row.family);
    assert.notEqual(row.json.value, undefined);
  }
  for (const field of fields) {
    const row = rows.find((candidate) => candidate.family === field.lands.family);
    assert.notEqual(getPath(row?.json.value, field.lands.key), undefined, field.id);
    const landingFamilies = new Set([
      field.lands.family,
      ...('setup_lands' in field ? [(field.setup_lands as { family: string }).family] : []),
    ]);
    assert.equal(landingFamilies.size, 1, `${field.id} lands in more than one family`);
  }
});

test('a campaign registry row builds through the standing settings request path', () => {
  const field = MACHINE_SETTINGS_SCHEMA.fields.find((row) => row.lands.family === 'campaign');
  assert.ok(field);
  assert.deepEqual(toRequest(MACHINE_SETTINGS_SCHEMA, field, 'A new campaign'), {
    route: '/api/machine-settings',
    method: 'PATCH',
    json: { family: 'campaign', value: { [field.lands.key]: 'A new campaign' } },
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
