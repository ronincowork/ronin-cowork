import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-registration-'));
process.env.RONIN_CONFIG_DIR = path.join(root, 'config');
process.env.RONIN_SERVICES_SECRETS_DIR = path.join(root, 'secrets');

const { deleteRegistration, readRegistration, registrationAnswer, submitRegistration, updateCommunication } = await import('../src/activation/registration.js');
const { putEntitlementToken, getEntitlementToken } = await import('../src/activation/secrets.js');

test('registration begins optional with communication explicitly off', async () => {
  const answer = await registrationAnswer();
  assert.equal(answer.status, 'optional');
  assert.equal(answer.services_entitled, false);
  assert.deepEqual(answer.communication, {
    newsletter: false, release_updates: false, follow_up: [], no_communication: true,
  });
});

test('registration records purpose fields but never stores the plain email', async () => {
  await submitRegistration({
    email: 'person@example.com', purpose: 'Build a product', kind: 'work',
    user_type: 'individual', own_words: 'Keep the setup small.',
  });
  const record = await readRegistration();
  assert.equal(record.email_masked, 'p*****@example.com');
  assert.equal(record.purpose, 'Build a product');
  assert.equal(record.user_type, 'individual');
  assert.equal(JSON.stringify(record).includes('person@example.com'), false);
  assert.equal((await registrationAnswer()).status, 'pending', 'submission is not entitlement');
});

test('communication remains independent and No communication clears other choices', async () => {
  let record = await updateCommunication({ newsletter: true, release_updates: true, follow_up: ['research'] });
  assert.equal(record.communication.newsletter, true);
  assert.equal(record.communication.no_communication, false);
  record = await updateCommunication({ newsletter: true, release_updates: true, follow_up: ['research'], no_communication: true });
  assert.deepEqual(record.communication, {
    newsletter: false, release_updates: false, follow_up: [], no_communication: true,
  });
});

test('registration rejects a missing or malformed email', async () => {
  await assert.rejects(submitRegistration({ email: 'not-an-email' }), /valid email/);
});

test('registration recovery keeps consent separate and deletion removes local identity and entitlement', async () => {
  await putEntitlementToken('server-only-entitlement');
  let answer = await registrationAnswer();
  assert.equal(answer.status, 'registered');
  assert.equal(answer.communication.no_communication, true, 'entitlement does not infer communication consent');
  await deleteRegistration();
  answer = await registrationAnswer();
  assert.equal(answer.status, 'optional');
  assert.equal(answer.services_entitled, false);
  assert.equal(await getEntitlementToken(), null);
});

test('setup surface definitions keep all six ruled ids and gates only Library and Share', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const id of ['setup.register', 'setup.providers', 'setup.roots', 'setup.services', 'setup.gbrain', 'setup.templates']) assert.match(source, new RegExp(id.replace('.', '\\.')));
  assert.match(source, /Loaded Templates/);
  assert.match(source, /Make Your Own Template/);
  assert.match(source, /Ronin Library/);
  assert.match(source, /Share Yours/);
  assert.match(source, /mode === 'library'[\s\S]*entitled/);
  assert.doesNotMatch(source, /servicesCard\s*\(/, 'Setup has no separate Services email/token activation card');
});

test('provider discovery is catalog-driven and a keyed surface resolves only its provider', async () => {
  const { providerOffers, providerFromRuntime } = await import('../public/js/setup-provider-state.js');
  const providers = [
    ['anthropic', 'Claude'], ['openai', 'Codex'], ['hermes', 'Hermes'],
    ['grok', 'Grok'], ['gemini', 'Gemini'], ['future_cli', 'Future CLI'],
  ].map(([id, label], index) => ({ id, label, state: index ? 'installed' : 'activated' }));
  const runtime = { providers };
  assert.deepEqual(providerOffers(runtime).map((offer) => offer.label), providers.map((provider) => provider.label));
  assert.equal(providerFromRuntime(runtime, 'future_cli')?.label, 'Future CLI');
  assert.equal(providerFromRuntime(runtime, 'openai')?.label, 'Codex');
});

test('native login mounts only the attachment published by the real setup runtime', async () => {
  const { mountProviderAttachment } = await import('../public/js/setup-provider-state.js');
  const { setupRuntimeAnswer } = await import('../src/setup-runtime.js');
  const calls: unknown[] = [];
  const environment = { mountProviderSetupSession: (input: unknown) => { calls.push(input); return { destroy() {} }; } };
  const host = {};
  const availability = [{
    id: 'claude', label: 'Claude Code', from: 'Anthropic', get: '', parked: '', cmd: 'claude', installed: true, path: '/bin/claude',
  }];
  const closed = await setupRuntimeAnswer({}, { exists: async () => false }, availability);
  assert.equal(mountProviderAttachment(environment, host, closed.providers[0], 'workspace1', () => {}), null);
  const open = await setupRuntimeAnswer({}, { exists: async (name) => name === 'provider_setup_claude' }, availability);
  const mounted = mountProviderAttachment(environment, host, open.providers[0], 'workspace1', () => {});
  assert.ok(mounted);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { session: string; workspace: string }).session, 'provider_setup_claude');
  assert.deepEqual((calls[0] as { session: string; workspace: string }).workspace, 'workspace1');
});

test('legacy Services mutation entry points explicitly retire to registration', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/services-activation-api.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.post\('\/api\/services\/activation'[\s\S]*status\(410\)/);
  assert.match(source, /Registration recovery moved to \/api\/setup\/registration\/recovery/);
  assert.match(source, /Registration deletion moved to \/api\/setup\/registration/);
});

test('retired Services mutation handlers return 410 while registration routes remain live', async () => {
  const handlers = new Map<string, Function>();
  const app = {
    get(path: string, handler: Function) { handlers.set(`GET ${path}`, handler); },
    post(path: string, handler: Function) { handlers.set(`POST ${path}`, handler); },
    patch(path: string, handler: Function) { handlers.set(`PATCH ${path}`, handler); },
    delete(path: string, handler: Function) { handlers.set(`DELETE ${path}`, handler); },
  };
  const { registerServicesActivation } = await import('../src/routes/services-activation-api.js');
  registerServicesActivation(app as never);
  assert.ok(handlers.has('POST /api/setup/registration'));
  assert.ok(handlers.has('POST /api/setup/registration/recovery'));
  assert.ok(handlers.has('DELETE /api/setup/registration'));
  for (const route of [
    'POST /api/services/activation', 'POST /api/services/activation/resend',
    'POST /api/services/activation/address', 'DELETE /api/services/activation',
  ]) {
    let code = 200; let body: unknown = null;
    const response = { status(value: number) { code = value; return this; }, json(value: unknown) { body = value; return this; } };
    await handlers.get(route)?.({ body: {} }, response);
    assert.equal(code, 410, route);
    assert.match(String((body as { error?: string })?.error), /registration/i);
  }
});

test('all browser mutation callers use registration; Services activation is read/poll/install only', async () => {
  const fs = await import('node:fs/promises');
  for (const file of ['services-card.js', 'services-activation.js', 'campaign-routines.js', 'cowork-setup.js']) {
    const source = await fs.readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /['"]\/api\/services\/activation(?:\/resend|\/address)?['"][\s\S]{0,80}(?:method:\s*['"](?:POST|DELETE)|,\s*['"]DELETE)/, file);
  }
});
