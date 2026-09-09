import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderSummary, SessionLaunchSpec, Tier } from '../src/model-providers.js';
import { MikaUnavailable, mikaLevelFromAgents, resolveMikaModel } from '../src/mika-runtime.js';

const spec = (provider: string, cli: string, model: string, tier: Tier): SessionLaunchSpec => ({
  provider, cli, model, tier, cmd: `${cli} --model ${model}`, default: false,
  cost: '', good_at: '', not_good_at: '', gbrainDisconnected: '--no-mcp',
});
const summary = (operational: string[]): ProviderSummary => ({
  measured_at: '2026-09-09T00:00:00Z', installed: operational, signed_in: operational,
  operational, activated_count: operational.length, paths: {},
});

test('Mika defaults to light and accepts only the three levels', () => {
  assert.equal(mikaLevelFromAgents({}), 'light');
  assert.equal(mikaLevelFromAgents({ jobs: { mikaassist: { level: 'frontier' } } }), 'frontier');
  assert.throws(() => mikaLevelFromAgents({ jobs: { mikaassist: { level: 'cheap' } } }), MikaUnavailable);
});

test('exact level is invariant and the general provider wins only within it', () => {
  const specs = [spec('anthropic', 'claude', 'haiku', 'light'), spec('openai', 'codex', 'luna', 'light'), spec('openai', 'codex', 'terra', 'standard')];
  const picked = resolveMikaModel({ level: 'light', generalProvider: 'openai', specs, summary: summary(['claude', 'codex']) });
  assert.equal(picked.model, 'luna');
  const cross = resolveMikaModel({ level: 'standard', generalProvider: 'anthropic', specs, summary: summary(['claude', 'codex']) });
  assert.equal(cross.model, 'terra');
  assert.equal(cross.provider_notice, 'default_provider_has_no_level');
});

test('another available level is a refusal remedy, never an automatic launch', () => {
  const specs = [spec('openai', 'codex', 'terra', 'standard'), spec('openai', 'codex', 'sol', 'frontier')];
  assert.throws(
    () => resolveMikaModel({ level: 'light', generalProvider: 'openai', specs, summary: summary(['codex']) }),
    (error: unknown) => error instanceof MikaUnavailable
      && error.code === 'mika_no_model_at_level'
      && assert.deepEqual(error.available_levels, ['standard', 'frontier']) === undefined,
  );
});

test('unmeasured, zero ready, and MCP-capable eligibility refuse distinctly', () => {
  const row = spec('openai', 'codex', 'luna', 'light');
  assert.throws(() => resolveMikaModel({ level: 'light', specs: [row], summary: null }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_provider_unmeasured');
  assert.throws(() => resolveMikaModel({ level: 'light', specs: [row], summary: summary([]) }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_no_ready_provider');
  assert.throws(() => resolveMikaModel({ level: 'light', specs: [{ ...row, gbrainDisconnected: undefined }], summary: summary(['codex']) }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_no_ready_provider');
});
