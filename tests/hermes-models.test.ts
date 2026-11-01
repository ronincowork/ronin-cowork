import test from 'node:test';
import assert from 'node:assert/strict';
import { hermesConnections } from '../src/hermes-models.js';
import { parseProviderSummary, providerRows, type ProviderSummary } from '../src/model-providers.js';
import { resolveLaunchCommand } from '../src/launch-command.js';

test('Hermes inventory keeps each configured connection separate and discards credential fields', () => {
  const rows = hermesConnections({ provider: 'openai', default: 'gpt-5.6-luna', api_key: 'secret' }, {
    mistral: { name: 'Mistral API', base_url: 'https://example.test/v1', api_key: 'secret', models: ['mistral-small'] },
    disabled: { enabled: false, models: ['hidden'] },
    'bad;id': { models: ['bad'] },
  }, [{ name: 'Office API', key_env: 'OFFICE_KEY', models: { 'office/model': {} } }]);
  assert.deepEqual(rows, [
    { provider: 'mistral', label: 'Mistral API', rows: [{ id: 'mistral-small', name: 'mistral-small' }] },
    { provider: 'custom:office-api', label: 'Office API', rows: [{ id: 'office/model', name: 'office/model' }] },
    { provider: 'openai', label: 'openai', rows: [{ id: 'gpt-5.6-luna', name: 'gpt-5.6-luna' }] },
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /secret|OFFICE_KEY|example\.test/);
  assert.deepEqual(hermesConnections('unconfigured-model', null, null), []);
});

test('record round trip and launch join preserve the connection; no Codex model inventory leaks into Hermes', async () => {
  const summary: ProviderSummary = {
    measured_at: '2026-11-01', refreshed_at: '2026-11-01', installed: ['hermes', 'codex'], signed_in: [],
    operational: ['hermes', 'codex'], off: [], activated_count: 2, paths: {}, versions: {}, latest: {},
    models: {
      codex: { read_at: '2026-11-01', by: 'test', rows: [{ id: 'codex-only', name: 'Codex only' }] },
      hermes: { read_at: '2026-11-01', by: 'test', rows: [], connections: hermesConnections(null, {
        openai: { models: ['gpt-5.6-luna'] }, mistral: { models: ['mistral-small'] },
      }, null) },
    },
  };
  assert.deepEqual(parseProviderSummary(JSON.parse(JSON.stringify(summary))), summary);
  const providers = await providerRows(summary);
  const openai = providers.find(row => row.cli === 'hermes' && row.inference_provider === 'openai')!;
  const mistral = providers.find(row => row.cli === 'hermes' && row.inference_provider === 'mistral')!;
  assert.notEqual(openai.provider, 'openai');
  assert.deepEqual(openai.models.map(row => row.model), ['gpt-5.6-luna']);
  assert.deepEqual(mistral.models.map(row => row.model), ['mistral-small']);
  const specs = providers.flatMap(row => row.models);
  assert.equal(resolveLaunchCommand({ agent: true, provider: openai.provider, model: 'gpt-5.6-luna', specs }).cmd,
    'hermes chat --provider openai -m gpt-5.6-luna');
  assert.equal(resolveLaunchCommand({ agent: true, provider: mistral.provider, specs }).cmd,
    'hermes chat --provider mistral -m mistral-small');
  const empty = await providerRows({ ...summary, models: { codex: summary.models.codex! } });
  assert.equal(empty.find(row => row.cli === 'hermes')?.operational, false);
  const off = await providerRows({ ...summary, operational: ['codex'], off: ['hermes'] });
  assert.ok(off.filter(row => row.cli === 'hermes').every(row => !row.operational && row.off));
});
