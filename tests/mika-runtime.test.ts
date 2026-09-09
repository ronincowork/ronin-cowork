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

test('the default provider supplies Mika and cascades Light → Standard → Frontier inside itself', () => {
  const specs = [spec('anthropic', 'claude', 'haiku', 'light'), spec('openai', 'codex', 'sol', 'frontier'), spec('openai', 'codex', 'terra', 'standard')];
  const both = summary(['claude', 'codex']);
  const picked = resolveMikaModel({ level: 'light', generalProvider: 'openai', specs, summary: both });
  assert.equal(picked.provider, 'openai');
  assert.equal(picked.model, 'terra', 'no Light on the default provider: the next level up, never another provider');
  assert.equal(picked.resolved_level, 'standard');
  assert.equal(picked.provider_notice, null);
  assert.deepEqual(picked.available_levels, ['standard', 'frontier']);
  const standard = resolveMikaModel({ level: 'standard', generalProvider: 'anthropic', specs: [spec('anthropic', 'claude', 'opus', 'frontier'), ...specs], summary: both });
  assert.equal(standard.model, 'opus', 'the configured level is the floor of the cascade');
  const frontier = resolveMikaModel({ level: 'frontier', generalProvider: 'openai', specs, summary: both });
  assert.equal(frontier.model, 'sol');
});

test('with no signed-in default provider the first operational provider in catalog order supplies Mika', () => {
  const specs = [spec('anthropic', 'claude', 'haiku', 'light'), spec('openai', 'codex', 'luna', 'light')];
  const setup = resolveMikaModel({ level: 'light', generalProvider: '', specs, summary: summary(['codex']) });
  assert.equal(setup.provider, 'openai');
  assert.equal(setup.model, 'luna');
  assert.equal(setup.provider_notice, null, 'no default provider is not a notice');
  const away = resolveMikaModel({ level: 'light', generalProvider: 'anthropic', specs, summary: summary(['codex']) });
  assert.equal(away.model, 'luna');
  assert.equal(away.provider_notice, 'default_provider_unavailable');
});

test('a provider with nothing at or above the configured level refuses distinctly', () => {
  const specs = [spec('openai', 'codex', 'luna', 'light'), spec('openai', 'codex', 'terra', 'standard')];
  assert.throws(() => resolveMikaModel({ level: 'frontier', generalProvider: 'openai', specs, summary: summary(['codex']) }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_no_model_at_level');
});

test('unmeasured and zero ready providers refuse distinctly', () => {
  const row = spec('openai', 'codex', 'luna', 'light');
  assert.throws(() => resolveMikaModel({ level: 'light', specs: [row], summary: null }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_provider_unmeasured');
  assert.throws(() => resolveMikaModel({ level: 'light', specs: [row], summary: summary([]) }), (e: unknown) => e instanceof MikaUnavailable && e.code === 'mika_no_ready_provider');
});
