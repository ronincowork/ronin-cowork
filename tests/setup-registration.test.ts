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
  const closed = await setupRuntimeAnswer({}, { exists: async () => false, signedIn: async () => false }, availability);
  assert.equal(mountProviderAttachment(environment, host, closed.providers[0], 'workspace1', () => {}), null);
  const open = await setupRuntimeAnswer({}, { exists: async (name) => name === 'provider_setup_claude', signedIn: async () => false }, availability);
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
  for (const name of ['email', 'own_words']) assert.match(source, new RegExp(`name = '${name}'|input\\('${name}'`));
  for (const name of ['identity_mode', 'kind', 'preferred_feature', 'run_location']) assert.match(source, new RegExp(`choiceGroup\\('${name}'`));
  assert.match(source, /checklistGroup\('reasons'/);
  assert.match(source, /reasons\.other\.value/);
  assert.match(source, /kind_other: kindOther\.value/);
  assert.doesNotMatch(source, /Who is using Ronin\?|\['individual', 'Just me'\]|\['team', 'A team'\]|\['builder', 'Builder'\]|\['exploring', 'Exploring'\]/);
  assert.match(source, /Welcome to Ronin/);
  assert.match(source, /setup-register-group/);
  assert.match(source, /setup-register-choice-grid/);
  assert.match(source, /aria-pressed/);
  const css = await (await import('node:fs/promises')).readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(source, /group\.dataset\.choices = String\(choices\.length\)/, 'choice grids know their count so four choices sit two by two');
  assert.match(source, /\{ explain: true \}/, 'the core-feature question explains the chosen answer');
  assert.match(source, /explanation\.textContent = chosen \? description : ''; explanation\.hidden = !chosen \|\| !description; if \(chosen\) button\.after\(explanation\)/, 'the explanation drops out right under the chosen row');
  assert.match(source, /Which of these describes you best in terms of getting value from Ronin\?/);
  assert.doesNotMatch(source, /Which of these things Ronin does would you appreciate most\?/);
  assert.match(css, /\.setup-register-choice-grid\[data-layout='rows'\] > \.setup-register-explain \{ grid-column: 2;/, 'the explanation sits beside the rows when the surface is wide');
  assert.doesNotMatch(source, /Why is that useful to you\?/);
  for (const reason of ['own_instructions', 'no_collisions']) assert.match(source, new RegExp(`\\['${reason}', `));
  assert.match(source, /reads by default/);
  assert.match(source, /keep them from colliding/);
  for (const words of ['You open it from a browser wherever you are', 'Ronin never stands in between', 'light reading an agent does to build its brief']) assert.match(source, new RegExp(words));
  assert.doesNotMatch(source, /Use multiple providers without lock-in/);
  assert.match(source, /notice\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /const wordFor = \(key\) => labels\.get\(key\)/, 'the submitted summary speaks the form\'s words, never a stored key');
  assert.match(source, /el\('span', '', summaryWords\(\)\)/);
  assert.doesNotMatch(source, /\.\.\.\(current\?\.reasons \|\| \[\]\)\]\.filter\(Boolean\)/);
  assert.match(source, /checkRow\(t\('setup_surface\.no_communication', 'No communication'\), checks\.no_communication, 'setup-register-check-apart'\)/);
  assert.match(source, /identity\.dataset\.tone = current\?\.status === 'pending' \? 'pending' : 'ok'/);
  assert.match(css, /\.setup-register-compact \{ container: setup-register \/ inline-size;/, 'Register sizes its pairs from its own width');
  assert.match(css, /@container setup-register \(min-width: 40rem\)/);
  assert.match(css, /\.setup-register-group \{[^}]*border-top: var\(--edge-2\) solid var\(--kaki\)/, 'groups open with a kaki rule');
  assert.doesNotMatch(css, /\.setup-register-group \{[^}]*(?:border: var\(--edge\)|background: var\(--panel\))/, 'groups are not boxes');
  assert.doesNotMatch(css, /\.setup-register-choice \{[^}]*aspect-ratio/, 'choices are fluid rectangles, not fixed squares');
  assert.match(css, /\.setup-register-choice-grid\[data-choices='4'\]/);
  assert.match(css, /\.setup-register-explain \{/);
  for (const label of ['With email', 'Anonymous', 'No thank you', 'Work from anywhere', 'Multiple providers without lock-in', 'Agents with team coordination skills']) assert.match(source, new RegExp(label));
  for (const message of ['Different models have different strengths', 'network issues', 'New models keep arriving', 'locked into one provider', 'runs out of tokens', 'hidden sub-agents', 'Something else']) assert.match(source, new RegExp(message));
  for (const place of ['Virtual machine', 'Personal server', 'Personal computer']) assert.match(source, new RegExp(place));
  assert.match(source, /Where will you install Ronin\?/);
  assert.doesNotMatch(source, /Where will you run Ronin\?|Where Ronin fits/);
  for (const kind of ['Which of these are you most likely to use?', 'Build software', 'Life assistants', 'Research and writing']) assert.match(source, new RegExp(kind.replace('?', '\\?')));
  assert.match(source, /about\.append\([\s\S]*?identityMode\.wrap, emailField, runLocation\.wrap\)/, 'where Ronin will live belongs to About you');
  assert.ok(source.indexOf('runLocation.wrap') < source.indexOf('preferredFeature.wrap, reasons.wrap'), 'machine location comes before feature preference');
  assert.match(source, /const chosen = value\.value === key \? '' : key;/, 'a second click clears a single choice');
  assert.doesNotMatch(source, /Your starting theme|theme\.wrap/);
  assert.doesNotMatch(source, /What would make Ronin useful to you\?|Anything else\? \(optional\)/);
  assert.match(source, /setup_surface\.own_words', 'Anything else'/);
  assert.match(source, /We hope you enjoy Ronin\. If you’d like to share feedback later, we’d be glad to hear it\./);
  assert.match(source, /declinedRegistration[\s\S]*?fit\.hidden = declinedRegistration/);
  assert.match(source, /registerAction\.hidden = declinedRegistration/);
  assert.match(source, /Communication choices/);
  assert.match(source, /Communication stays off unless you choose otherwise/);
  assert.match(source, /register_action'[\s\S]*?'Send'\), '', async/);
  assert.match(source, /registerAction\.dataset\.launch = 'true'/);
  assert.match(source, /identity_mode: anonymous \? 'anonymous' : 'email'/);
  assert.doesNotMatch(source, /identityMode\.wrap\.querySelector\('\[data-value="email"\]'\)\?\.click/);
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

test('Services leads with identity, the beta, and benefits, then one measured status and the three same-shape steps', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ servicesSetupModel \} from '\.\/services-setup-state\.js'/);
  assert.match(source, /import \{ campaignById, campaigns, loadCampaigns, saveCampaign \} from '\.\/campaigns\.js'/);
  assert.match(source, /import \{ completeRoutineMap \} from '\.\/campaign-routines\.js'/);
  assert.match(source, /setup-services-mark/);
  assert.match(source, /mark\.src = 'brand\/services-mark\.svg'/);
  assert.match(source, /fetch\('brand\/services-mark\.svg'\)/, 'the one mark file is inlined so the R follows data-theme');
  assert.match(source, /host\.innerHTML = markup;\n\s*host\.querySelector\('svg'\)\?\.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(source, /rs-r|M31 6h58/, 'no second copy of the mark lives in the surface');
  const order = ['setup-services-lockup', 'services_setup.beta', 'services_setup.transcripts', 'services_setup.library', 'setup-services-status', 'setup-services-steps', 'services_setup.gate'];
  for (let i = 1; i < order.length; i += 1) assert.ok(source.indexOf(order[i - 1]) < source.indexOf(order[i]), `${order[i - 1]} precedes ${order[i]}`);
  for (const key of ['services_setup.beta_copy', 'services_setup.transcripts_copy', 'services_setup.records', 'services_setup.voice']) assert.match(source, new RegExp(key.replace('.', '\\.')));
  assert.match(source, /request\('\/api\/setup\/registration', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/installed', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/services\/activation', \{ cache: 'no-store' \}\)/);
  assert.match(source, /servicesSetupModel\(registration, installed, activation\)/);
  assert.match(source, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /if \(item\.act === 'register'\) \{ openRegister\(\); return; \}/);
  assert.match(source, /workbench\?\.place\(SETUP_SURFACE_TYPES\.register/);
  assert.match(source, /item\.act === 'install' \? '\/api\/services\/install' : '\/api\/services\/activation\/poll'/);
  // The On step is the Campaign's own Routine switch, saved the way Routines and Installs saves it.
  assert.match(source, /request\('\/api\/routines'\)/);
  assert.match(source, /ronin_services: on/);
  assert.match(source, /saveCampaign\(row\.id, \{ config: \{ agent_defaults: \{ \.\.\.defaults, routines \} \} \}\)/);
  assert.match(source, /setAttribute\('aria-pressed', String\(item\.pressed === true\)\)/);
  // Restart: the one sanctioned tool behind one route; the browser asks, then watches /api/installed come back.
  assert.match(source, /if \(item\.act === 'restart'\) \{ await restartRonin\(state\); return; \}/);
  assert.match(source, /request\('\/api\/machine\/restart', \{ method: 'POST', json: \{\} \}\)/);
  assert.match(source, /const probe = await request\('\/api\/installed', \{ cache: 'no-store' \}\);\n\s*if \(probe\.ok\) break;/);
  const route = await (await import('node:fs/promises')).readFile(new URL('../src/routes/machine-restart-api.ts', import.meta.url), 'utf8');
  assert.match(route, /join\(REPO_ROOT, 'ronin_bin', 'tejun-machine-restart'\)/, 'the route runs the sanctioned tool and names no unit');
  assert.doesNotMatch(route, /execFile\(['"]systemctl|ronin\.service/, 'the route invokes no systemctl and names no unit; only the tool does');
  assert.ok(route.indexOf('res.json({ started: true') < route.indexOf('setTimeout'), 'the answer goes out before Ronin goes down');
  const index = await (await import('node:fs/promises')).readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(index, /registerMachineRestart\(app\)/);
  assert.match(source, /notifySummary\(SETUP_SURFACE_TYPES\.services, model\.summary/);
  assert.match(source, /if \(body\.isConnected\) void show\(\)/, 'polling stops when the surface leaves the workspace');
  assert.doesNotMatch(source, /Requires a confirmed registration|services_requires_short|services_register_enables|Registration confirmed · Services access not included|not activated|setup-services-account/);
  assert.doesNotMatch(source, /const state = el\('dl'|<dd>|'Yes' : 'No'/);
});

test('the Services mark is a constructed RS monogram in the house hexagon, blue R and kaki S, leaning with the frame', async () => {
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
  // Letters are built from one house cell and turned to the frame's own angle.
  assert.match(services, /transform="translate\(60 52\) scale\(\.86\) rotate\(28\.5\) translate\(-62\.5 -52\)"/);
  assert.match(services, /<g class="rs-r" stroke="#3f6a95"><path d="M31 76V28H51L57 40L51 52H31"\/><path d="M45 52L57 76"\/><\/g>/, 'the R: stem, cell, leg');
  assert.match(services, /<path stroke="#c46243" d="M94 40L88 28H74L68 40L74 52H88L94 64L88 76H74L68 64"\/>/, 'the S: two cells, kaki');
  // The R follows the shell's reference blue; as a plain image it falls back by scheme.
  assert.match(services, /\.rs-r\{stroke:var\(--accent-2,#3f6a95\)\}@media \(prefers-color-scheme:dark\)\{\.rs-r\{stroke:var\(--accent-2,#81a2be\)\}\}/);
  assert.doesNotMatch(services, /<text|<image|fill="#/, 'letters are drawn strokes, not a font or a filled badge');
  assert.doesNotMatch(services, /<!--[^>]*--[^>]*-->/, 'no double hyphen inside a comment: XML rejects it and the browser shows a broken image');
  const colours = new Set((services.match(/#[0-9a-fA-F]{6}\b/g) || []).map((c) => c.toLowerCase()));
  assert.deepEqual([...colours].sort(), ['#3f6a95', '#81a2be', '#c46243'], 'kaki plus the two shell values of the reference blue, nothing else');
});

test('Services setup model keeps installation and registration as separate facts and shapes three steps', async () => {
  const { SERVICES_SETUP_STATES, servicesSetupModel } = await import('../public/js/services-setup-state.js');
  const reg = (status: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { status, services_entitled: false, ...extra } });
  const entitled = (extra: Record<string, unknown> = {}) => reg('registered', { services_entitled: true, ...extra });
  const inst = (services: Record<string, unknown> = {}) => ({ ok: true, data: { services: { installed: false, activated: false, switched_on: false, restart_needed: false, parts: [], loaded: [], ...services } } });
  const here = (extra: Record<string, unknown> = {}) => inst({ installed: true, parts: ['counting', 'gbrain', 'koe', 'koshi', 'machine', 'rireki'], loaded: ['gbrain', 'machine'], ...extra });
  const act = (stage: string, extra: Record<string, unknown> = {}) => ({ ok: true, data: { stage, ...extra } });
  type Step = { id: string; label: string; done: boolean; enabled: boolean; act: string | null };
  const shape = (m: { steps: Step[] }) => m.steps.map((s) => `${s.id}:${s.label}:${s.done ? 'done' : s.enabled ? s.act : 'off'}`).join(' ');
  const cases: Array<[string, unknown, unknown, unknown, string, string, string, boolean]> = [
    ['unregistered', { ok: false, status: 500 }, inst(), null, 'not installed', 'Not installed on this machine', 'register:Register:register install:Install:off switch:Turn on:off', false],
    ['anonymous', reg('anonymous'), inst(), act('not_requested'), 'not installed', 'Not installed · anonymous hello sent', 'register:Register:register install:Install:off switch:Turn on:off', false],
    ['sending', reg('pending'), inst(), act('requesting'), 'sending', 'Sending the confirmation email…', 'register:Sending…:off install:Install:off switch:Turn on:off', true],
    ['awaiting_email', reg('pending', { email_masked: 'p*****@example.com' }), inst(), act('awaiting_email'), 'confirm email', 'Confirmation email sent to p*****@example.com', 'register:Check status:check install:Install:off switch:Turn on:off', true],
    ['expired', reg('pending'), inst(), act('expired'), 'link expired', 'Confirmation link expired', 'register:Register:register install:Install:off switch:Turn on:off', false],
    ['send_failed', reg('pending'), inst(), act('error', { error_at_stage: 'awaiting_email' }), 'waiting to send', 'Waiting to send', 'register:Check status:check install:Install:off switch:Turn on:off', false],
    ['entitled', entitled(), inst(), act('verified'), 'ready to install', 'Registered · Ready to install', 'register:Done:done install:Install:install switch:Turn on:off', false],
    ['installing', entitled(), inst(), act('installing'), 'installing', 'Installing Services…', 'register:Done:done install:Installing…:off switch:Turn on:off', true],
    ['install_failed', entitled(), inst(), act('error', { error_at_stage: 'installing', error_message: 'the installer did not start' }), 'install failed', 'Install did not finish', 'register:Done:done install:Try again:install switch:Turn on:off', false],
    ['switched_off', reg('optional'), here(), act('not_requested'), 'switched off', 'Installed · switched off', 'register:Register:register install:Done:done switch:Turn on:switch_on', false],
    ['restart_needed', reg('optional'), here({ switched_on: true, restart_needed: true }), act('not_requested'), 'restart needed', 'Switched on · not yet running', 'register:Register:register install:Done:done switch:Turn off:switch_off restart:Restart:restart', true],
    ['active', entitled(), here({ switched_on: true }), act('installed'), 'active', 'Active on this Cowork', 'register:Done:done install:Done:done switch:Turn off:switch_off', false],
  ];
  assert.deepEqual(cases.map(([state]) => state).sort(), [...SERVICES_SETUP_STATES].sort());
  for (const [state, registration, installed, activation, summary, status, steps, polling] of cases) {
    const model = servicesSetupModel(registration as never, installed as never, activation as never);
    assert.equal(model.state, state);
    assert.equal(model.summary, summary);
    assert.equal(model.status, status);
    assert.equal(shape(model), steps);
    assert.equal(model.polling, polling);
    assert.ok(model.next.length > 0);
    assert.deepEqual(model.steps.slice(0, 3).map((s: Step) => s.id), ['register', 'install', 'switch'], 'always the same three steps in the same order');
    assert.equal(model.steps.length, state === 'restart_needed' ? 4 : 3, 'Restart appears only while a restart is due');
    assert.doesNotMatch(`${model.status} ${model.next} ${model.steps.map((s: Step) => s.label).join(' ')}`, /HTTP|undefined|null/);
  }
  // Installed on the live box without any registration: installed, usable, switchable, and Register stays an optional step.
  const live = servicesSetupModel(reg('optional'), here(), act('not_requested'));
  assert.equal(live.steps[2].act, 'switch_on');
  assert.equal(live.steps[2].enabled, true, 'installed Services can be switched on here without registering');
  assert.match(live.next, /2 of 6 parts are running now/);
  const liveOn = servicesSetupModel(reg('optional'), here({ switched_on: true }), act('not_requested'));
  assert.equal(liveOn.state, 'active');
  assert.equal(liveOn.steps[2].act, 'switch_off', 'the switch is a toggle: on reads Turn off');
  assert.equal(liveOn.steps[2].label, 'Turn off');
  assert.equal(liveOn.steps[2].pressed, true);
  assert.equal(liveOn.steps[2].done, false, 'a toggle is never Done');
  assert.equal(live.steps[2].pressed, false);
  assert.equal(liveOn.steps[2].enabled, true);
  assert.match(servicesSetupModel(reg('optional'), here({ switched_on: true, restart_needed: true }), act('not_requested')).next, /Press Restart, or ask any of your Agents to restart Ronin/);
  const offButRunning = servicesSetupModel(reg('optional'), here({ restart_needed: true }), act('not_requested'));
  assert.equal(offButRunning.steps[3]?.act, 'restart', 'switching off also waits on a restart, so Restart is offered');
  assert.equal(offButRunning.polling, true, 'the surface watches for the restart an Agent may do instead');
  assert.equal(liveOn.steps[1].enabled, false, 'Done install has nothing to press');
  assert.equal(servicesSetupModel(reg('optional'), inst(), act('not_requested')).steps[1].enabled, false, 'the hosted install waits for the entitlement the API demands');
  assert.equal(servicesSetupModel(reg('optional'), inst(), act('not_requested')).steps[2].enabled, false, 'nothing to switch on before parts are installed');
  const installedAwaiting = servicesSetupModel(reg('pending', { email_masked: 'p*****@example.com' }), here(), act('awaiting_email'));
  assert.equal(installedAwaiting.state, 'switched_off');
  assert.equal(installedAwaiting.polling, true, 'a confirmation in flight still re-reads');
  assert.equal(installedAwaiting.steps[0].act, 'check');
  assert.equal(servicesSetupModel(null, null, null).state, 'unregistered', 'no reads at all still paint a truthful floor');
  assert.match(servicesSetupModel(entitled(), here({ restart_needed: true }), act('installed')).next, /still running/);
  assert.match(servicesSetupModel(entitled(), inst(), act('error', { error_at_stage: 'installing', error_message: 'the installer did not start' })).next, /did not start/);
  assert.equal(servicesSetupModel(entitled(), here({ switched_on: true }), act('installing')).state, 'active', 'parts present and switched on outrank a stale installing stage');
  assert.deepEqual(new Set(cases.map(([, r, i, a]) => servicesSetupModel(r as never, i as never, a as never).tone)), new Set(['', 'warn', 'bad', 'ok']));
});

test('Setup gbrain answers three questions plainly with at most one action per state', async () => {
  const { GBRAIN_SETUP_STATES, gbrainSetupModel, gbrainAccounts } = await import('../public/js/gbrain-setup-state.js');
  const snapshot = (over: Record<string, unknown> = {}) => ({
    ok: true, status: 200,
    data: {
      installed: true, install: { state: 'idle', op: null, log: [] },
      process: { state: 'running', health: 'reachable', version: '1.2.3' },
      listener: { scope: 'vm_only', address: '127.0.0.1', port: 7777 },
      externalModelProvider: 'none', publicAccess: { state: 'off' },
      search: { weights: 'running', mode: 'hybrid', model: 'nomic', dimensions: 768, reason: null, answers: { state: 'off', reason: 'model-key-missing' } },
      integrationsKnown: true, integrations: [
        { id: 'credential-gateway', label: 'Credential Gateway', category: 'infra', state: 'not_connected' },
        { id: 'email-to-brain', label: 'Email-to-Brain', category: 'senses', state: 'not_connected' },
        { id: 'twilio-voice-brain', label: 'Voice-to-Brain (DEPRECATED — see agent-voice)', category: 'senses', state: 'not_connected' },
        { id: 'calendar-to-brain', label: 'Calendar-to-Brain', category: 'senses', state: 'connected' },
        { id: 'x-to-brain', label: 'X-to-Brain', category: 'senses', state: 'not_connected' },
      ],
      observedAt: '2026-09-07T12:00:00.000Z',
      ...over,
    },
  });
  const one = { installed: true, active: true, activated_count: 1 };
  const cases: Array<[string, unknown, unknown, string, string | null, string | null, boolean]> = [
    ['reading', undefined, one, 'Checking…', null, null, false],
    ['services_needed', { ok: false, status: 404, message: 'HTTP 404' }, { installed: false, active: false }, 'Not installed', 'open_services', 'not installed', false],
    ['services_off', { ok: false, status: 404, message: 'HTTP 404' }, { installed: true, active: false, services: { installed: true, active: false } }, 'Installed · Ronin Services is switched off', 'open_services', 'installed', false],
    ['unreadable', { ok: false, status: 500, message: 'HTTP 500' }, { installed: true, active: false }, 'Could not read', 'check_again', 'installed', false],
    ['not_installed', snapshot({ installed: false }), { installed: false, active: false }, 'Not installed', 'load', 'not installed', false],
    ['install_failed', snapshot({ installed: false, install: { state: 'failed', op: 'install', log: ['step 3 failed'] } }), null, 'Install did not finish', 'retry', 'not installed', false],
    ['installing', snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } }), null, 'Installing…', null, 'installing', false],
    ['removing', snapshot({ install: { state: 'running', op: 'uninstall', log: [] } }), null, 'Removing…', null, 'removing', false],
    ['provider_first', snapshot(), { installed: true, active: true, activated_count: 0 }, 'Installed · running', 'open_providers', 'running', true],
    ['ready', snapshot(), one, 'Installed · running', 'start_assistant', 'running', true],
    ['stopped', snapshot({ process: { state: 'stopped', health: 'unreachable', version: null } }), { installed: true, active: false }, 'Installed · not running', 'check_assistant', 'installed', true],
  ];
  assert.deepEqual(cases.map(([state]) => state).sort(), [...GBRAIN_SETUP_STATES].sort());
  for (const [state, result, availability, answer, action, summary, installed] of cases) {
    const model = gbrainSetupModel(result as never, availability as never);
    assert.equal(model.state, state);
    assert.equal(model.answer, answer);
    assert.equal(model.action?.id ?? null, action);
    assert.equal(model.summary, summary);
    assert.equal(model.installed, installed);
    assert.doesNotMatch(`${model.answer} ${model.hint} ${model.action?.label || ''}`, /HTTP|undefined|null/);
  }
  // The next step sits below the answers; install-ish actions sit beside Installed.
  assert.equal(gbrainSetupModel(snapshot(), one).action?.place, 'next');
  assert.equal(gbrainSetupModel(snapshot(), { ...one, activated_count: 0 }).action?.place, 'next');
  assert.equal(gbrainSetupModel(snapshot({ installed: false }), null).action?.place, 'installed');
  // Accounts: yes or no per linkable account, read from gbrain's own list; infra and deprecated rows are not accounts.
  assert.deepEqual(gbrainAccounts(snapshot().data), [
    { id: 'email-to-brain', name: 'Gmail', linked: false },
    { id: 'calendar-to-brain', name: 'Google Calendar', linked: true },
    { id: 'x-to-brain', name: 'X', linked: false },
  ]);
  assert.equal(gbrainAccounts({ integrationsKnown: false, integrations: [] }), null);
  assert.deepEqual(gbrainSetupModel(snapshot(), one).accounts?.map((row: { linked: boolean }) => row.linked), [false, true, false]);
  assert.equal(gbrainSetupModel(snapshot({ integrationsKnown: false, integrations: [] }), one).accounts, null);
  assert.equal(gbrainSetupModel(snapshot({ search: { weights: 'stopped', mode: 'keyword_only' } }), one).answer, 'Installed · running · keyword-only search');
  assert.equal(gbrainSetupModel(snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } })).hint, 'fetching weights');
  assert.equal(gbrainSetupModel(snapshot({ installed: false, install: { state: 'running', op: 'install', log: ['fetching weights'] } })).polling, true);
  assert.deepEqual(gbrainSetupModel(snapshot({ installed: false, install: { state: 'failed', op: 'install', log: ['step 3 failed'] } })).log, ['step 3 failed']);
});

test('Setup gbrain paints the three questions, switches the Campaign gbrain Routine, and keeps the commons dashboard on its default', async () => {
  const [setup, gbrain] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/js/gbrain.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /presentation: 'setup'/);
  assert.match(setup, /setupRuntime\?\.gbrain|runtime\?\.gbrain/);
  assert.match(setup, /onState: \(summary\) => notifySummary\(SETUP_SURFACE_TYPES\.gbrain, summary/);
  assert.match(setup, /openServices: \(\) => context\.workbench\?\.place\(SETUP_SURFACE_TYPES\.services/);
  assert.match(setup, /openProviders: \(\) => context\.workbench\?\.place\(SETUP_SURFACE_TYPES\.providers/);
  // Available to Agents is the Campaign's own gbrain Routine, saved the way Routines and Installs saves it.
  assert.match(setup, /routines\.gbrain === true/);
  assert.match(setup, /completeRoutineMap\([\s\S]*?defaults\.routines\), gbrain: on === true \}/);
  assert.match(setup, /saveCampaign\(row\.id, \{ config: \{ agent_defaults: \{ \.\.\.defaults, routines \} \} \}\)/);
  // Start your first Personal Assistant is exactly the preset's launch: same plan, same route, same new tab.
  assert.match(setup, /launchPresetPlan\(buildLaunchPlan\(slot, '', controls\)\)/);
  assert.match(setup, /HOUSE_PRESETS\.find\(\(row\) => row\.handle === 'personal_assistant'\)/);
  assert.match(setup, /presetLaunchUrl\(result\.data \|\| \{\}, seatingPlan\('personal_assistant'/);
  assert.match(gbrain, /import \{ gbrainAssistantPrompt, gbrainSetupModel \} from '\.\/gbrain-setup-state\.js'/);
  assert.match(gbrain, /if \(!root\.querySelector\('\.setup-gbrain-compact'\)\) renderSetup\(undefined\)/);
  assert.match(gbrain, /const mine = \+\+reads;[\s\S]*?if \(mine === reads\) renderSetup\(result\)/);
  assert.match(gbrain, /if \(!setup\) root\.append\(head, privacy, search, integrations\)/);
  for (const question of ['gbrain.setup_q_installed', 'gbrain.setup_q_agents', 'gbrain.setup_q_accounts']) assert.ok(gbrain.includes(question), question);
  assert.match(gbrain, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(gbrain, /request\('\/api\/gbrain\/install', \{ method: 'POST', json: \{\} \}\)/);
  assert.match(gbrain, /root\.replaceChildren\(wrap\)/);
  for (const kept of ['renderPrivacy(r.data)', 'renderSearch(r.data)', 'renderIntegrations(r.data)', 'integrations.append(renderRemove())', 'renderLoad(r.data)']) assert.ok(gbrain.includes(kept), kept);
  assert.doesNotMatch(gbrain, /designedErrors|gb-notice|gb-setup|setup-gbrain-benefit|setup-gbrain-facts/);
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
