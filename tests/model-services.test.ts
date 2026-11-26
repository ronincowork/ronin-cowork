import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import express from 'express';
import { registerCatalogs } from '../src/routes/catalogs.js';
import { registerSetupRuntime } from '../src/routes/setup-runtime-api.js';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setModels } from '../src/model-catalog.js';
import { saveService as saveAccount, deleteModelOption as deletePreset } from '../src/model-services.js';
import { discoverModelIds as discoverAccount } from '../src/model-service-store.js';
import { saveModelOption } from '../src/model-service-store.js';
import { modelServices } from '../src/model-services.js';
import { serviceLaunch } from '../src/model-service-launch.js';
import { harnessRows, type HarnessSummary } from '../src/harness-catalog.js';

test('named models stay with their service through discovery, catalog and CLI launch', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'model-services-'));
  const stores = ['SERVICES_SECRETS', 'OFFICE_UNIT', 'CONFIG', 'MODEL_CATALOG'];
  const prior = new Map(stores.map(id => [id, process.env['RONIN_' + id + '_DIR']]));
  for (const id of stores) process.env['RONIN_' + id + '_DIR'] = path.join(root, id);
  t.after(async () => {
    for (const [id, value] of prior) {
      const key = 'RONIN_' + id + '_DIR';
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  });
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'upstream/example', name: 'Gateway example' }, { id: 'legacy/model' }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port;
  const gateway = await saveAccount({ kind: 'ronin_api', baseUrl: base + '/gateway', token: 'gateway-fixture' });
  const api = await saveAccount({ name: 'Private', provider: 'custom', wireApi: 'responses', baseUrl: base + '/private', apiKey: 'private-fixture' });
  const chat = await saveAccount({ name: 'Chat', provider: 'custom', wireApi: 'chat', baseUrl: base + '/chat', apiKey: 'chat-fixture' });
  await discoverAccount(gateway.id); await discoverAccount(api.id);
  await assert.rejects(saveModelOption({ connection: gateway.id, name: 'Alias', model: 'upstream/example', reasoning: 'default', approvals: 'prompt' }), /supplies its own model list/);
  let services = await modelServices();
  assert.equal(services.find(s => s.id === gateway.id)?.models.length, 2);
  assert.deepEqual(services.find(s => s.id === api.id)?.models, []);
  assert.equal(services.find(s => s.id === gateway.id)?.models.find(m => m.model === 'legacy/model')?.name, 'legacy/model');
  const gatewayOption = services.find(s => s.id === gateway.id)?.models[0];
  assert.deepEqual([gatewayOption?.name, gatewayOption?.model], ['Gateway example', 'upstream/example']);
  const setup = await saveModelOption({ name: 'upstream/example', connection: api.id, model: 'vendor/private', reasoning: 'default', approvals: 'prompt' });
  const chatSetup = await saveModelOption({ name: 'Chat', connection: chat.id, model: 'vendor/chat', reasoning: 'default', approvals: 'prompt' });
  services = await modelServices();
  assert.equal(services.find(s => s.id === api.id)?.models[0]?.id, setup.id);
  assert.ok(!JSON.stringify(services).includes('private-fixture'));
  const summary = { installed: ['hermes', 'codex', 'opencode'], operational: [], off: [], models: {} } as unknown as HarnessSummary;
  const catalog = await harnessRows(summary, { harness_models: [], openrouter_starters: [] });
  const rows = catalog.flatMap(cli => cli.models).filter(row => row.service_id === api.id);
  assert.deepEqual(rows.map(r => r.cli).sort(), ['codex', 'hermes']);
  assert.ok(rows.every(r => r.selectable));
  assert.equal(rows.find(r => r.cli === 'hermes')?.model, setup.id);
  const app = express();
  app.use(express.json());
  registerSetupRuntime(app);
  registerCatalogs(app);
  const apiServer = app.listen(0, '127.0.0.1'); await once(apiServer, 'listening');
  t.after(() => apiServer.close());
  const apiAddress = apiServer.address(); assert.ok(apiAddress && typeof apiAddress === 'object');
  const endpoint = 'http://127.0.0.1:' + apiAddress.port + '/api/model-services';
  const prefsUrl = 'http://127.0.0.1:' + apiAddress.port + '/api/new-agent-models/hermes';
  const savedPrefs = { [gateway.id]: [gatewayOption!.id], [api.id]: [] };
  assert.equal((await fetch(prefsUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedPrefs) })).status, 200);
  const catalogRead = await fetch('http://127.0.0.1:' + apiAddress.port + '/api/harness-catalog');
  assert.deepEqual((await catalogRead.json()).preferences.hermes, savedPrefs);
  const change = async (action: string, body: Record<string, unknown>) => {
    const result = await fetch(endpoint + '/' + action, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(result.status, 200);
    return (await result.json() as { services: typeof services }).services;
  };
  assert.equal((await fetch(endpoint)).status, 200);
  const created = await change('save', { kind: 'personal_api', name: 'UI fixture', provider: 'custom',
    baseUrl: base + '/ui', apiKey: 'ui-fixture', wireApi: 'chat' });
  const owner = created.find(s => s.name === 'UI fixture'); assert.ok(owner);
  const emptyCatalog = await harnessRows(summary, { harness_models: [], openrouter_starters: [] });
  assert.ok(emptyCatalog.find(row => row.cli === 'hermes')?.services?.some(service => service.id === owner.id));
  assert.ok(!emptyCatalog.some(cli => cli.models.some(model => model.service_id === owner.id)));
  await change('discover', { id: owner.id });
  const edited = await change('save-model', { service_id: owner.id, name: 'UI model', model: 'any/model' });
  const saved = edited.find(s => s.id === owner.id)?.models[0]; assert.ok(saved);
  await change('delete-model', { id: saved.id });
  await change('delete', { id: owner.id });
  // The office can receive HQ's list after the user has connected OpenRouter.
  const liveFetch = globalThis.fetch;
  const discovery = t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(url) !== 'https://openrouter.ai/api/v1/models/user') return liveFetch(url, init);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer router-fixture');
    return Response.json({ data: [{ id: 'author/available' }] });
  });
  const router = await saveAccount({ kind: 'personal_api', name: 'OpenRouter', provider: 'custom', wireApi: 'chat',
    baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'router-fixture' });
  const routerModels = async () => (await modelServices()).find(service => service.id === router.id)!.models;
  assert.deepEqual(await routerModels(), []);
  await setModels({ openrouter_starters: [{ id: 'author/available', name: 'Fast' }, { id: 'author/restricted', name: 'Restricted' }],
    harness_models: [{ harness: 'codex', id: 'author/available', name: 'Native' }] });
  const starters = await routerModels();
  assert.deepEqual(starters.map(row => [row.name, row.model]), [['Fast', 'author/available']]);
  assert.equal(starters[0]?.approvals, 'off');
  await deletePreset(starters[0]!.id);
  await discoverAccount(router.id);
  await saveAccount({ id: router.id, kind: 'personal_api', name: 'OpenRouter', provider: 'custom', wireApi: 'chat',
    baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'router-fixture' });
  assert.deepEqual(await routerModels(), []);
  discovery.mock.restore();
  const marker = 'service:' + setup.id;
  assert.deepEqual(await serviceLaunch('hermes', ['hermes', 'chat', '-m', marker], ''), ['hermes', 'chat', '-m', 'vendor/private']);
  const probe = path.join(root, 'probe');
  await writeFile(probe, '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),correctKey:process.env.RONIN_MODEL_SERVICE_KEY===process.env.EXPECTED_KEY,config:process.env.OPENCODE_CONFIG_CONTENT}))');
  await chmod(probe, 0o700);
  for (const [cli, model, expectedKey] of [['codex', setup.id, 'private-fixture'], ['opencode', chatSetup.id, 'chat-fixture']]) {
    const command = await serviceLaunch(cli!, [probe, '--model', 'service:' + model], '');
    assert.ok(!command.join(' ').includes(expectedKey!));
    const result = JSON.parse(execFileSync(command[0]!, command.slice(1), { encoding: 'utf8', env: { ...process.env, EXPECTED_KEY: expectedKey } }));
    assert.equal(result.correctKey, true);
    if (cli === 'codex') {
      assert.ok(result.args.includes('vendor/private'));
      assert.ok(result.args.includes('model_providers.ronin_service.base_url="' + base + '/private"'));
    } else {
      assert.ok(result.args.includes('ronin_service/vendor/chat'));
      assert.equal(JSON.parse(result.config).provider.ronin_service.options.baseURL, base + '/chat');
    }
  }
  await assert.rejects(serviceLaunch('codex', ['codex', '--model', 'service:' + chatSetup.id], ''), /unavailable/);
});
