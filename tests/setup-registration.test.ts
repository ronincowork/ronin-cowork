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
    user_type: 'individual', preferred_feature: 'multiple_providers',
    reasons: ['different_strengths', 'avoid_lock_in'], run_location: 'personal_server', own_words: 'Keep the setup small.',
  });
  const record = await readRegistration();
  assert.equal(record.email_masked, 'p*****@example.com');
  assert.equal(record.purpose, 'Build a product');
  assert.equal(record.user_type, 'individual');
  assert.equal(record.preferred_feature, 'multiple_providers');
  assert.deepEqual(record.reasons, ['different_strengths', 'avoid_lock_in']);
  assert.equal(record.run_location, 'personal_server');
  assert.equal(JSON.stringify(record).includes('person@example.com'), false);
  assert.equal((await registrationAnswer()).status, 'pending', 'submission is not entitlement');
});

test('anonymous registration needs no email and keeps a stable outgoing packet identity', async () => {
  let record = await submitRegistration({
    identity_mode: 'anonymous', intended_use: ['self_help', 'personal_assistance'], theme_preference: 'automatic',
  });
  assert.equal(record.email_masked, null);
  assert.match(record.anonymous_packet_id, /^pkt_[a-z2-9]{26}$/);
  const packetId = record.anonymous_packet_id;
  record = await submitRegistration({ identity_mode: 'anonymous', intended_use: ['coding'] });
  assert.equal(record.anonymous_packet_id, packetId);
  assert.equal((await registrationAnswer()).status, 'anonymous');
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

test('Setup reuses canonical Campaign Templates only inside Launch Your Own', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const id of ['setup.register', 'setup.providers', 'setup.roots', 'setup.services', 'setup.gbrain']) assert.match(source, new RegExp(id.replace('.', '\\.')));
  assert.match(source, /templates: CAMPAIGN_TEMPLATES_TYPE/);
  assert.match(source, /createTemplatesSurface\(\)/);
  assert.doesNotMatch(source, /campaignTemplatesDefinition\(\)/);
  assert.doesNotMatch(source, /setup-template-(?:modes|room|card)|openTemplateMaker|\/api\/library/);
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
  assert.ok(providerOffers(runtime).every((offer) => offer.groupKey === 'setup.providers'));
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

test('selector definitions retain neutral provider grouping without requirement targets', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /createProviderSurface, 'setup\.providers'/);
  assert.doesNotMatch(source, /SETUP_REQUIREMENT_TARGETS|targetKey|targetClass/);
});

test('Register presents one open profile flow with card choices and anonymous delivery', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const name of ['email', 'purpose', 'own_words']) assert.match(source, new RegExp(`name = '${name}'|input\\('${name}'`));
  for (const name of ['identity_mode', 'kind', 'preferred_feature', 'run_location']) assert.match(source, new RegExp(`choiceGroup\\('${name}'`));
  assert.match(source, /checklistGroup\('reasons'/);
  assert.doesNotMatch(source, /Who is using Ronin\?|\['individual', 'Just me'\]|\['team', 'A team'\]|\['builder', 'Builder'\]|\['exploring', 'Exploring'\]/);
  assert.match(source, /Welcome to Ronin/);
  assert.match(source, /setup-register-group/);
  assert.match(source, /setup-register-choice-grid/);
  assert.match(source, /aria-pressed/);
  for (const label of ['With email', 'Anonymous', 'No thank you', 'Work from anywhere', 'Use multiple providers without lock-in', 'Agents with team coordination skills']) assert.match(source, new RegExp(label));
  for (const message of ['Different models have different strengths', 'network issues', 'New models keep arriving', 'locked into one provider', 'runs out of tokens', 'hidden sub-agents', 'Something else']) assert.match(source, new RegExp(message));
  for (const place of ['Virtual machine', 'Personal server', 'Personal computer']) assert.match(source, new RegExp(place));
  assert.doesNotMatch(source, /Your starting theme|theme\.wrap/);
  assert.match(source, /We hope you enjoy Ronin\. If you’d like to share feedback later, we’d be glad to hear it\./);
  assert.match(source, /declinedRegistration[\s\S]*?fit\.hidden = declinedRegistration/);
  assert.match(source, /registerAction\.hidden = declinedRegistration/);
  assert.match(source, /Communication choices/);
  assert.match(source, /Communication stays off unless you choose otherwise/);
  assert.match(source, /register_action'[\s\S]*?'Register'\), '', async/);
  assert.doesNotMatch(source, /Optional profile|setup-register-disclosure/);
  assert.doesNotMatch(source, /setup-register-pill/);
  assert.doesNotMatch(source, /const kind = el\('select'\)|const userType = el\('select'\)/);
  assert.doesNotMatch(source, /renderKindPills|createKindsPreference|setup-kinds/);
  assert.doesNotMatch(source, /registration_pending'[\s\S]*?Registration pending/);
});

test('anonymous Register delivery uses the durable Ronin message path and never starts email activation', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/services-activation-api.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(anonymous\)[\s\S]*?sendKansou\(buildKansou/);
  assert.match(source, /the packet is durable before immediate delivery is attempted/);
  assert.match(source, /if \(anonymous\)[\s\S]*?return;[\s\S]*?await request\(str\(body\.email\)\)/);
});

test('Services leads with identity and benefits, then routes its only registration action directly', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /setup-services-mark/);
  assert.match(source, /mark\.src = 'brand\/services-mark\.svg'/);
  assert.doesNotMatch(source, /setup-services-mark'\);\n\s*mark\.src = 'brand\/nin-mark\.svg'/);
  assert.ok(source.indexOf('services_value_records') < source.indexOf('services_register_enables'), 'benefits precede the registration gate');
  assert.match(source, /services_value_records/);
  assert.match(source, /services_value_library/);
  assert.match(source, /services_register_enables/);
  assert.match(source, /register_direct'[\s\S]*?workbench\?\.place\(SETUP_SURFACE_TYPES\.register/);
  assert.doesNotMatch(source, /Requires a confirmed registration|services_requires_short/);
  assert.doesNotMatch(source, /usedFor: t\('setup_surface\.services_used'/);
});

test('the Services mark is a code-native R and S monogram in the house hexagon', async () => {
  const fs = await import('node:fs/promises');
  const [services, house] = await Promise.all([
    fs.readFile(new URL('../public/brand/services-mark.svg', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/brand/nin-mark.svg', import.meta.url), 'utf8'),
  ]);
  const frame = /d="M31 6h58l25 46-25 46H31L6 52z"/;
  assert.match(house, frame, 'the house mark still carries the hexagon this test pins');
  assert.match(services, frame, 'same open hexagon as the house mark');
  assert.match(services, /viewBox="0 0 120 104"/);
  assert.match(services, /<title id="title">Ronin Services mark<\/title>/);
  assert.match(services, /stroke="#c46243" stroke-width="8"/);
  assert.doesNotMatch(services, /<text|<image|fill="#/, 'letters are drawn strokes in the one kaki material, not a font or a filled badge');
  assert.doesNotMatch(services, /#[0-9a-fA-F]{3,8}\b(?<!#c46243)/, 'no colour beyond kaki');
});

test('Services keeps exact lifecycle states secondary and offers only the real install action', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const key of ['services_not_entitled', 'services_entitled_status', 'services_installed_status', 'services_activated_status', 'services_active_status']) {
    assert.match(source, new RegExp(key));
  }
  assert.match(source, /entitled && !facts\?\.installed[\s\S]*?\/api\/services\/install/);
  assert.match(source, /services_activate_next/);
  assert.match(source, /services_switch_next/);
  assert.doesNotMatch(source, /const state = el\('dl'|<dd>|'Yes' : 'No'/);
});

test('Setup gbrain opts into one diagnosed status notice without raw transport errors', async () => {
  const [setup, gbrain] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/js/gbrain.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /designedErrors: true/);
  assert.match(setup, /setupRuntime\?\.gbrain/);
  assert.match(gbrain, /className = 'gb-notice'/);
  assert.match(gbrain, /setAttribute\('role', 'status'\)/);
  assert.match(gbrain, /gbrain\.known_(?:not_)?installed/);
  assert.match(gbrain, /gbrain\.status_diagnosis/);
  assert.match(gbrain, /gbrain\.check_again/);
  assert.doesNotMatch(gbrain.match(/if \(options\.designedErrors\)[\s\S]*?return;/)?.[0] || '', /r\.message|HTTP/);
});

test('Setup gbrain uses a benefit-first, single-action presentation without changing the commons default', async () => {
  const [setup, gbrain] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/js/gbrain.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /presentation: 'setup'/);
  assert.match(gbrain, /Give your Agents a shared, searchable memory/);
  assert.match(gbrain, /Status and requirements/);
  assert.match(gbrain, /Start with PersonalAssistant/);
  assert.match(gbrain, /root\.replaceChildren\(wrap\)/);
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
