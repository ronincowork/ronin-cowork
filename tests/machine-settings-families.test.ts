import assert from 'node:assert/strict';
import test from 'node:test';
import { MACHINE_SETTINGS_WRITERS, writeMachineSettings } from '../src/machine-settings.js';
import { MACHINE_SETTINGS_SCHEMA, providerModelFields } from '../src/machine-settings-schema.js';

test('every registry family has a machine-settings writer', () => {
  const fields = [
    ...MACHINE_SETTINGS_SCHEMA.fields,
    ...providerModelFields(['anthropic', 'openai']),
  ];

  for (const field of fields) {
    assert.ok(
      field.lands.family in MACHINE_SETTINGS_WRITERS,
      `${field.id} lands in family '${field.lands.family}', which has no writer`,
    );
  }
});

test('unknown families are refused by name, including inherited object names', async () => {
  await assert.rejects(
    writeMachineSettings('toString', {}),
    /no machine-settings family named 'toString'/,
  );
});
