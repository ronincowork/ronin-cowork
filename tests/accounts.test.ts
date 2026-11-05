import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-accounts-'));
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.HERMES_HOME = path.join(box, 'missing-native-home');
process.env.DOTENV_CONFIG_PATH = path.join(box, 'missing-env');
const a = await import('../src/accounts.js');
const h = await import('../src/hermes-setups.js');
test.after(() => rm(box, { recursive: true, force: true }));

test('the Ronin API is seeded greyed until a token arrives; a personal API is the Hermes connection with its kind and harnesses', async () => {
  const empty = await a.accountsAnswer();
  const seed = empty.accounts.find(row => row.kind === 'ronin_api')!;
  assert.equal(seed.id, a.RONIN_API_SEED_ID); assert.equal(seed.configured, false); assert.equal(seed.seeded, true);
  assert.ok(seed.harnesses.includes('hermes')); assert.ok(!seed.harnesses.includes('claude'), 'the Ronin API does not serve Claude Code');
  assert.deepEqual(empty.kinds, ['personal_api', 'ronin_api']);

  const c = await a.saveAccount({ name: 'Office OpenAI', provider: 'openai', baseUrl: 'https://api.example.test/v1', apiKey: 'test-secret' });
  let answer = await a.accountsAnswer();
  const personal = answer.accounts.find(row => row.id === c.id)!;
  assert.equal(personal.kind, 'personal_api'); assert.equal(personal.configured, true);
  assert.deepEqual(personal.harnesses, ['hermes', 'codex']); assert.deepEqual(personal.bound, ['hermes']);
  assert.doesNotMatch(JSON.stringify(answer), /test-secret/);
  // The same record read as Hermes sees it: one list, two views.
  assert.equal((await h.hermesSettingsAnswer()).connections.find(row => row.id === c.id)?.name, 'Office OpenAI');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6.1-sol' }] }), { status: 200 });
  try { await a.discoverAccount(c.id); } finally { globalThis.fetch = originalFetch; }
  answer = await a.accountsAnswer();
  assert.deepEqual(answer.accounts.find(row => row.id === c.id)!.offered, ['gpt-6-luna', 'gpt-6.1-sol'], 'every discovered model is offered until the owner ticks');
  await a.updateAccountLists(c.id, { offered: ['gpt-6-luna'], harnesses: ['hermes'] });
  await assert.rejects(a.updateAccountLists(c.id, { offered: ['invented'] }), /discovered/);
  await assert.rejects(a.updateAccountLists(c.id, { harnesses: ['bad id'] }), /harness/);
  answer = await a.accountsAnswer();
  assert.deepEqual(answer.accounts.find(row => row.id === c.id)!.offered, ['gpt-6-luna']);
  assert.deepEqual(answer.accounts.find(row => row.id === c.id)!.harnesses, ['hermes']);

  // A preset is the Hermes named setup, read with its harness and account.
  await a.savePreset({ name: 'Luna', account: c.id, model: 'gpt-6-luna', reasoning: 'medium', approvals: 'off' });
  answer = await a.accountsAnswer();
  assert.deepEqual(answer.presets.map(p => [p.name, p.harness, p.account, p.model]), [['Luna', 'hermes', c.id, 'gpt-6-luna']]);
  assert.equal((await h.hermesSettingsAnswer()).setups[0].name, 'Luna');
  await assert.rejects(a.savePreset({ name: 'X', harness: 'codex', account: c.id, model: 'gpt-6-luna', reasoning: 'default', approvals: 'off' }), /binding/);
  await assert.rejects(a.deleteAccount(c.id), /setups/);
  await a.deletePreset(answer.presets[0].id);

  // Saving a token for the seeded Ronin API makes it the gateway connection; the seed row goes.
  await a.saveAccount({ id: a.RONIN_API_SEED_ID, kind: 'ronin_api', token: 'house-token' });
  answer = await a.accountsAnswer();
  const ronin = answer.accounts.filter(row => row.kind === 'ronin_api');
  assert.equal(ronin.length, 1); assert.equal(ronin[0].seeded, undefined); assert.equal(ronin[0].configured, true);
  assert.equal(ronin[0].baseUrl, a.RONIN_API_BASE_URL); assert.equal(ronin[0].wire, 'responses'); assert.equal(ronin[0].provider, 'custom');
  assert.doesNotMatch(JSON.stringify(answer), /house-token/);

  // system_lead's condition (2026-11-04): the gateway connection with the new fields present still provisions the
  // same custom:ronin Hermes config — api_mode codex_responses, key_env OPENAI_API_KEY — and no secret leaves the store.
  await a.updateAccountLists(ronin[0].id, { harnesses: ['hermes', 'codex'] });
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-6-luna' }] }), { status: 200 });
  try { await a.discoverAccount(ronin[0].id); } finally { globalThis.fetch = originalFetch; }
  await a.savePreset({ name: 'House', account: ronin[0].id, model: 'openai/gpt-6-luna', reasoning: 'medium', approvals: 'off' });
  const house = (await a.accountsAnswer()).presets.find(p => p.name === 'House')!;
  const home = path.join(box, 'house-home');
  await h.prepareHermesHome(house.id, home);
  const { readFile } = await import('node:fs/promises');
  const config = JSON.parse(await readFile(path.join(home, 'config.yaml'), 'utf8'));
  assert.equal(config.model.provider, 'custom:ronin'); assert.equal(config.model.api_mode, 'codex_responses');
  assert.equal(config.model.base_url, a.RONIN_API_BASE_URL); assert.equal(config.model.default, 'openai/gpt-6-luna');
  assert.deepEqual(config.providers.ronin, { name: 'ronin', base_url: a.RONIN_API_BASE_URL, key_env: 'OPENAI_API_KEY', api_mode: 'codex_responses' });
  assert.doesNotMatch(await readFile(path.join(home, 'ronin-setup.json'), 'utf8'), /house-token|harnesses|offered/);
  assert.match(await readFile(path.join(home, '.env'), 'utf8'), /OPENAI_API_KEY='house-token'/);
});
