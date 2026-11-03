import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
const box = await mkdtemp(path.join(os.tmpdir(), 'ronin-hermes-setups-'));
process.env.RONIN_USER_ROOT = path.join(box, 'user');
process.env.HERMES_HOME = path.join(box, 'missing-native-home');
process.env.DOTENV_CONFIG_PATH = path.join(box, 'missing-env');
const h = await import('../src/hermes-setups.js');
const { providerRows } = await import('../src/model-providers.js');
test.after(() => rm(box, { recursive: true, force: true }));
test('connections, named models and concurrent homes preserve isolation and credential rotation', async () => {
  const c = await h.saveHermesConnection({ name: 'Office OpenAI', provider: 'openai', baseUrl: 'https://api.example.test/v1', apiKey: 'test-secret-first' });
  assert.equal(await h.hermesConfigured(), true);
  assert.doesNotMatch(JSON.stringify(await h.hermesSettingsAnswer()), /test-secret/);
  await assert.rejects(h.saveHermesSetup({ name: 'Luna', connection: c.id, model: 'invented', reasoning: 'medium', approvals: 'off' }), /discovered/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/models');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-secret-first');
    assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6.1-sol' }, { id: 'bad;command' }] }), { status: 200 });
  };
  try { assert.deepEqual(await h.discoverHermesModels(c.id), ['gpt-6-luna', 'gpt-6.1-sol']); } finally { globalThis.fetch = originalFetch; }
  const setup = await h.saveHermesSetup({ name: 'Luna', connection: c.id, model: 'gpt-6-luna', reasoning: 'medium', approvals: 'off' });
  const a = path.join(box, 'a'); const b = path.join(box, 'b');
  await Promise.all([h.prepareHermesHome(setup.id, a), h.prepareHermesHome(setup.id, b)]);
  const config = JSON.parse(await readFile(path.join(a, 'config.yaml'), 'utf8'));
  assert.equal(config.agent.reasoning_effort, 'medium'); assert.equal(config.approvals.mode, 'off');
  assert.equal(config.model.default, 'gpt-6-luna');
  assert.equal((await stat(a)).mode & 0o777, 0o700);
  assert.doesNotMatch(await readFile(path.join(a, 'ronin-setup.json'), 'utf8'), /test-secret/);
  await h.saveHermesSetup({ ...setup, name: 'Luna', reasoning: 'high' });
  assert.equal(JSON.parse(await readFile(path.join(b, 'config.yaml'), 'utf8')).agent.reasoning_effort, 'medium');
  await h.saveHermesConnection({ ...c, apiKey: 'test-secret-rotated' });
  assert.match(await readFile(path.join(a, '.env'), 'utf8'), /test-secret-rotated/);
  assert.match(await readFile(path.join(b, '.env'), 'utf8'), /test-secret-rotated/);
  await assert.rejects(h.deleteHermesEntry('connections', c.id), /setups/);
  const rows = await providerRows({ installed: ['hermes'], operational: ['hermes'], off: [], models: {} } as any);
  const hermes = rows.find(row => row.provider === 'hermes')!;
  assert.deepEqual(hermes.models.map(row => [row.model, row.name]), [[setup.id, 'Luna']]);
  assert.equal(hermes.models[0].cmd, 'hermes chat -m gpt-6-luna');
  const off = await providerRows({ installed: ['hermes'], operational: [], off: ['hermes'], models: {} } as any);
  assert.equal(off.find(row => row.provider === 'hermes')!.models[0].selectable, false);
});
test('invalid connection inputs never reach the network or write credentials', async () => {
  for (const baseUrl of ['http://example.test/v1', 'https://user:password@example.test/v1', 'https://example.test/v1?key=x']) {
    await assert.rejects(h.saveHermesConnection({ name: 'bad', provider: 'custom', baseUrl, apiKey: 'key' }));
  }
  await assert.rejects(h.saveHermesConnection({ name: 'bad', provider: 'custom', baseUrl: 'https://example.test/v1', apiKey: "key\nOTHER=bad" }));
});

test('canonical launch provisioning replaces inherited config links without changing the source home', async t => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { processLaunch } = await import('../src/launch-binding.js');
  const source = path.join(box, 'native-home'); await mkdir(source);
  await writeFile(path.join(source, 'config.yaml'), 'native-config');
  await writeFile(path.join(source, '.env'), 'native-key');
  const oldHome = process.env.HERMES_HOME; const oldStore = process.env.RONIN_SESSION_DIR;
  process.env.HERMES_HOME = source; process.env.RONIN_SESSION_DIR = path.join(box, 'sessions');
  t.after(() => { if (oldHome === undefined) delete process.env.HERMES_HOME; else process.env.HERMES_HOME = oldHome; if (oldStore === undefined) delete process.env.RONIN_SESSION_DIR; else process.env.RONIN_SESSION_DIR = oldStore; });
  const setup = (await h.readHermesSettings()).setups[0];
  const identity = await processLaunch({ name: 'luna', key: 'luna-birth', cli: 'hermes', argv: ['hermes', 'chat', '-m', setup.model], cwd: box, env: { RONIN_SETUP_ID: setup.id } }, async (_argv, env, identity) => {
    assert.equal(env.HERMES_HOME, identity.home);
    assert.equal(JSON.parse(await readFile(path.join(identity.home!, 'config.yaml'), 'utf8')).model.default, setup.model);
    assert.match(await readFile(path.join(identity.home!, '.env'), 'utf8'), /test-secret-rotated/);
    assert.equal(identity.journal?.root, identity.home);
    assert.equal(identity.journal?.pattern, 'state.db');
  });
  assert.equal(identity.strategy, 'isolated');
  assert.equal(await readFile(path.join(source, 'config.yaml'), 'utf8'), 'native-config');
  assert.equal(await readFile(path.join(source, '.env'), 'utf8'), 'native-key');
});

test('environment credentials appear automatically without exposing values or duplicating connections', async () => {
  const env = { MISTRAL_API_KEY: 'mistral-secret', OFFICE_API_KEY: 'office-secret', OFFICE_BASE_URL: 'https://office.example.test/v1', UNRELATED_API_KEY: 'ignored' };
  const discovered = h.environmentConnections(env);
  assert.deepEqual(discovered.map(c => [c.name, c.provider]), [['Mistral API', 'mistral'], ['OFFICE API', 'custom']]);
  const first = await h.readHermesSettings(env);
  const second = await h.readHermesSettings(env);
  assert.deepEqual(second, first);
  assert.equal(second.connections.filter(c => c.credentialEnv === 'MISTRAL_API_KEY').length, 1);
  assert.doesNotMatch(JSON.stringify(second), /mistral-secret|office-secret/);
  const mistral = second.connections.find(c => c.credentialEnv === 'MISTRAL_API_KEY')!;
  await assert.rejects(h.deleteHermesEntry('connections', mistral.id), /environment/);
});


test('managed local gateway connections allow only explicit 127.0.0.1 HTTP with a port', async () => {
  for (const baseUrl of ['http://127.0.0.2:4912/v1', 'http://127.0.0.1.evil.test:4912/v1', 'http://127.0.0.1/v1', 'http://127.0.0.1:4912/v1?key=x', 'http://user@127.0.0.1:4912/v1']) {
    await assert.rejects(h.saveHermesConnection({ name: 'bad gateway', provider: 'custom', baseUrl, apiKey: 'fixture-house-token' }), /HTTPS/);
  }
  const c = await h.saveHermesConnection({ name: 'House test', provider: 'custom', baseUrl: 'http://127.0.0.1:4912/v1', apiKey: 'fixture-house-token' });
  assert.equal(c.baseUrl, 'http://127.0.0.1:4912/v1');
  assert.equal(c.provider, 'custom');
  await h.deleteHermesEntry('connections', c.id);
});
