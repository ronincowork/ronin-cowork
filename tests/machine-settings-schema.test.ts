import assert from 'node:assert/strict';
import test from 'node:test';
import { getPath, toRequest, toRequests } from '../public/js/machine-settings-schema.js';
import { MACHINE_SETTINGS_SCHEMA, providerModelFields } from '../src/machine-settings-schema.js';
import { readFile } from 'node:fs/promises';

test('the real registry builds one complete request per family', () => {
  const fields = [...MACHINE_SETTINGS_SCHEMA.fields, ...providerModelFields(['anthropic'])];
  const schema = { ...MACHINE_SETTINGS_SCHEMA, fields };
  const values = Object.fromEntries(fields.map((field) => [
    field.id,
    field.shape === 'provider-model' ? 'anthropic\tclaude-sonnet-4-5'
      : field.kind === 'number' ? '3'
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

test('legacy page paths have no dedicated route or setup branch', async () => {
  const [server, client] = await Promise.all([
    readFile(new URL('../src/index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/main.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(server, /app\.get\(['"]\/cowork-setup/);
  assert.doesNotMatch(client, /cowork-setup|buildCoworkSetup|setup\.pending/);
  assert.match(server, /Browser navigation always enters the workspace shell/);
});
