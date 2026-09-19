import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstallations } from '../src/installations.js';
import type { InstallationRow } from '../src/resource-adapters.js';

const installation = (name: string, requires: string[] = []): InstallationRow => ({
  name, origin: 'stock', shadowed: false, label: name, blurb: '',
  reading: [], reading_off: [], tools: [], parts: [],
  effect: 'system', maturity: '', provides: [], requires,
});

test('installations resolve directly from their cards, without an inferred dependency state', () => {
  const resolved = resolveInstallations(
    [installation('base'), installation('dependent', ['base'])],
    { base: false, dependent: true, ignored: 'yes' },
  );
  assert.deepEqual(resolved.map(({ name, enabled }) => ({ name, enabled })), [
    { name: 'base', enabled: false },
    { name: 'dependent', enabled: true },
  ]);
  assert.ok(resolved.every((row) => !('stated_by' in row) && !('required_by' in row)));
});
