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
  assert.match(source, /Where will you install Ronin\?/);
  assert.doesNotMatch(source, /Where will you run Ronin\?|Where Ronin fits/);
  for (const kind of ['Which of these are you most likely to use?', 'Build software', 'Life assistants', 'Research and writing']) assert.match(source, new RegExp(kind.replace('?', '\\?')));
  assert.ok(source.indexOf('runLocation.wrap, preferredFeature.wrap') > -1, 'machine location comes before feature preference');
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

test('Services leads with identity and benefits, then paints one measured status and at most one real action', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ servicesSetupModel \} from '\.\/services-setup-state\.js'/);
  assert.match(source, /setup-services-mark/);
  assert.match(source, /mark\.src = 'brand\/services-mark\.svg'/);
  assert.doesNotMatch(source, /setup-services-mark'\);\n\s*mark\.src = 'brand\/nin-mark\.svg'/);
  assert.ok(source.indexOf('services_setup.library') < source.indexOf('setup-services-status'), 'benefits precede the status block');
  for (const key of ['services_setup.library', 'services_setup.records', 'services_setup.voice', 'services_setup.gate']) assert.match(source, new RegExp(key.replace('.', '\\.')));
  assert.match(source, /request\('\/api\/setup\/registration', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/installed', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/services\/activation', \{ cache: 'no-store' \}\)/);
  assert.match(source, /servicesSetupModel\(registration, installed, activation\)/);
  assert.match(source, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /'register'\) \{ openRegister\(\); return; \}/);
  assert.match(source, /workbench\?\.place\(SETUP_SURFACE_TYPES\.register/);
  assert.match(source, /'install' \? '\/api\/services\/install' : '\/api\/services\/activation\/poll'/);
  assert.match(source, /notifySummary\(SETUP_SURFACE_TYPES\.services, model\.summary/);
  assert.match(source, /if \(body\.isConnected\) void show\(\)/, 'polling stops when the surface leaves the workspace');
  assert.doesNotMatch(source, /Requires a confirmed registration|services_requires_short|services_register_enables|Registration confirmed · Services access not included/);
  assert.doesNotMatch(source, /const state = el\('dl'|<dd>|'Yes' : 'No'/);
  assert.doesNotMatch(source, /services_value_records|Continue where you left off|readable transcripts/i, 'no benefit promises what this beta does not hold');
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

test('Services setup model gives every measured state one status, one next line, and at most one action', async () => {
  const { SERVICES_SETUP_STATES, servicesSetupModel } = await import('../public/js/services-setup-state.js');
  const reg = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { status, services_entitled: false, ...extra } });
  const entitled = (extra: Record<string, unknown> = {}) => reg('registered', { services_entitled: true, ...extra });
  const inst = (services: Record<string, unknown> = {}) => ({ ok: true, data: { services: { installed: false, activated: false, switched_on: false, restart_needed: false, ...services } } });
  const act = (stage: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { stage, ...extra } });
  const cases: Array<[string, unknown, unknown, unknown, string, string, string | null, boolean]> = [
    ['unregistered', { ok: false, status: 500 }, inst(), null, 'not active', 'Not active on this machine', 'register', false],
    ['anonymous', reg('anonymous'), inst(), act('not_requested'), 'not active', 'Not active · anonymous hello sent', 'register', false],
    ['sending', reg('pending'), inst(), act('requesting'), 'sending', 'Sending the confirmation email…', null, true],
    ['awaiting_email', reg('pending', { email_masked: 'p*****@example.com' }), inst(), act('awaiting_email'), 'confirm email', 'Confirmation email sent to p*****@example.com', 'check', true],
    ['expired', reg('pending'), inst(), act('expired'), 'link expired', 'Confirmation link expired', 'register', false],
    ['send_failed', reg('pending'), inst(), act('error', { error_at_stage: 'awaiting_email' }), 'waiting to send', 'Waiting to send', 'check', false],
    ['entitled', entitled(), inst(), act('verified'), 'ready to install', 'Access confirmed · Ready to install', 'install', false],
    ['installing', entitled(), inst(), act('installing'), 'installing', 'Installing Services…', null, true],
    ['install_failed', entitled(), inst(), act('error', { error_at_stage: 'installing', error_message: 'the installer did not start' }), 'install failed', 'Install did not finish', 'install', false],
    ['switched_off', entitled(), inst({ installed: true, activated: true }), act('installed'), 'switched off', 'Installed and activated · switched off', null, false],
    ['restart_needed', entitled(), inst({ installed: true, activated: true, switched_on: true, restart_needed: true }), act('installed'), 'restart needed', 'Switched on · not yet running', null, false],
    ['active', entitled(), inst({ installed: true, activated: true, switched_on: true }), act('installed'), 'active', 'Active on this Cowork', null, false],
  ];
  assert.deepEqual(cases.map(([state]) => state).sort(), [...SERVICES_SETUP_STATES].sort());
  for (const [state, registration, installed, activation, summary, status, action, polling] of cases) {
    const model = servicesSetupModel(registration as never, installed as never, activation as never);
    assert.equal(model.state, state);
    assert.equal(model.summary, summary);
    assert.equal(model.status, status);
    assert.equal(model.action?.id ?? null, action);
    assert.equal(model.polling, polling);
    assert.ok(model.next.length > 0);
    assert.doesNotMatch(`${model.status} ${model.next} ${model.action?.label || ''}`, /HTTP|undefined|null/);
  }
  assert.equal(servicesSetupModel(reg('optional'), inst(), act('not_requested')).state, 'unregistered', 'a read that answers optional is unregistered');
  assert.equal(servicesSetupModel(null, null, null).state, 'unregistered', 'no reads at all still paint a truthful floor');
  const installedUnactivated = servicesSetupModel(reg('pending'), inst({ installed: true }), act('awaiting_email'));
  assert.equal(installedUnactivated.status, 'Installed · not activated');
  assert.equal(installedUnactivated.summary, 'not activated');
  assert.equal(installedUnactivated.action?.id, 'check', 'the parts being present does not change the path to entitlement');
  assert.match(servicesSetupModel(entitled(), inst(), act('error', { error_at_stage: 'installing', error_message: 'the installer did not start' })).next, /did not start/);
  assert.match(servicesSetupModel(entitled(), inst({ installed: true, activated: true, restart_needed: true }), act('installed')).next, /still running/);
  assert.equal(servicesSetupModel(entitled(), inst({ installed: true, activated: true, switched_on: true }), act('installing')).state, 'active', 'parts present and switched on outrank a stale installing stage');
  assert.deepEqual(new Set(cases.map(([, r, i, a]) => servicesSetupModel(r as never, i as never, a as never).tone)), new Set(['', 'warn', 'bad', 'ok']));
});

test('Setup gbrain model gives every measured state one status, one next line, and at most one action', async () => {
  const { GBRAIN_SETUP_STATES, gbrainSetupModel, gbrainAssistantPrompt } = await import('../public/js/gbrain-setup-state.js');
  const snapshot = (over: Record<string, unknown> = {}) => ({
    ok: true, status: 200,
    data: {
      installed: true, install: { state: 'idle', op: null, log: [] },
      process: { state: 'running', health: 'reachable', version: '1.2.3' },
      listener: { scope: 'vm_only', address: '127.0.0.1', port: 7777 },
      externalModelProvider: 'none', publicAccess: { state: 'off' },
      search: { weights: 'running', mode: 'hybrid', model: 'nomic', dimensions: 768, reason: null, answers: { state: 'off', reason: 'model-key-missing' } },
      integrationsKnown: true, integrations: [{ id: 'gmail', label: 'Gmail', state: 'not_connected' }],
      observedAt: '2026-09-07T12:00:00.000Z',
      ...over,
    },
  });
  const cases: Array<[string, unknown, unknown, string, string | null, string]> = [
    ['services_needed', { ok: false, status: 404, message: 'HTTP 404' }, { installed: false, active: false }, 'Not installed on this machine', 'open_services', 'not installed'],
    ['unreadable', { ok: false, status: 500, message: 'HTTP 500' }, { installed: true, active: false }, 'Status could not be read', 'check_again', 'installed'],
    ['not_installed', snapshot({ installed: false }), { installed: false, active: false }, 'Not installed on this machine', 'load', 'not installed'],
    ['install_failed', snapshot({ installed: false, install: { state: 'failed', op: 'install', log: ['step 3 failed'] } }), null, 'Install did not finish', 'retry', 'not installed'],
    ['installing', snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } }), null, 'Installing…', null, 'installing'],
    ['removing', snapshot({ install: { state: 'running', op: 'uninstall', log: [] } }), null, 'Removing…', null, 'removing'],
    ['running', snapshot(), { installed: true, active: true }, 'Running on this machine', 'start_assistant', 'running'],
    ['stopped', snapshot({ process: { state: 'stopped', health: 'unreachable', version: null } }), { installed: true, active: false }, 'Installed · not running', 'check_assistant', 'installed'],
  ];
  assert.deepEqual(cases.map(([state]) => state).sort(), [...GBRAIN_SETUP_STATES].sort());
  for (const [state, result, availability, status, action, summary] of cases) {
    const model = gbrainSetupModel(result as never, availability as never);
    assert.equal(model.state, state);
    assert.equal(model.status, status);
    assert.equal(model.action?.id ?? null, action);
    assert.equal(model.summary, summary);
    assert.ok(model.next.length > 0);
    assert.doesNotMatch(`${model.status} ${model.next} ${model.action?.label || ''}`, /HTTP|undefined|null/);
  }
  assert.equal(gbrainSetupModel(snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } })).next, 'fetching weights');
  assert.equal(gbrainSetupModel(snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } })).polling, true);
  assert.deepEqual(gbrainSetupModel(snapshot({ installed: false, install: { state: 'failed', op: 'install', log: ['step 3 failed'] } })).log, ['step 3 failed']);
  const running = gbrainSetupModel(snapshot(), { installed: true, active: true });
  assert.deepEqual(running.facts.map(([label]: [string]) => label), ['Local gbrain process', 'Local embeddings', 'Reach', 'Outside model use', 'Integrations']);
  assert.deepEqual(running.facts.map(([, , tone]: [string, string, string]) => tone), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.match(running.next, /hybrid/);
  assert.match(gbrainSetupModel(snapshot({ search: { weights: 'stopped', mode: 'keyword_only' } })).next, /keyword-only/);
  assert.equal(gbrainSetupModel(snapshot({ integrationsKnown: false, integrations: [] })).facts[4][1], 'unknown');
  assert.equal(gbrainSetupModel(snapshot({ integrations: [{ id: 'gmail', label: 'Gmail', state: 'connected' }] })).facts[4][1], '1 connected');
  assert.equal(running.polling, false);
  assert.match(gbrainAssistantPrompt('running'), /start using gbrain/);
  assert.match(gbrainAssistantPrompt('stopped'), /not running/);
});

test('Setup gbrain paints the model and keeps the commons dashboard on its default', async () => {
  const [setup, gbrain] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/js/gbrain.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /presentation: 'setup'/);
  assert.match(setup, /setupRuntime\?\.gbrain/);
  assert.match(setup, /onState: \(summary\) => notifySummary\(SETUP_SURFACE_TYPES\.gbrain, summary/);
  assert.match(setup, /openServices: \(\) => context\.workbench\?\.place\(SETUP_SURFACE_TYPES\.services/);
  assert.match(gbrain, /import \{ gbrainAssistantPrompt, gbrainSetupModel \} from '\.\/gbrain-setup-state\.js'/);
  assert.match(gbrain, /if \(setup\) \{ renderSetup\(await request\('\/api\/gbrain'\)\); return; \}/);
  assert.match(gbrain, /if \(!setup\) root\.append\(head, privacy, search, integrations\)/);
  assert.match(gbrain, /className = 'setup-gbrain-compact'|make\('section', 'setup-gbrain-compact'\)/);
  assert.match(gbrain, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(gbrain, /request\('\/api\/gbrain\/install', \{ method: 'POST', json: \{\} \}\)/);
  assert.match(gbrain, /root\.replaceChildren\(wrap\)/);
  // The commons tab still renders its three cards and the Load/Remove presses.
  for (const kept of ['renderPrivacy(r.data)', 'renderSearch(r.data)', 'renderIntegrations(r.data)', 'integrations.append(renderRemove())', 'renderLoad(r.data)']) assert.ok(gbrain.includes(kept), kept);
  assert.doesNotMatch(gbrain, /designedErrors|gb-notice|gb-setup/);
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
