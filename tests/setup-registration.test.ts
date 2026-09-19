import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(os.tmpdir(), 'ronin-registration-'));
process.env.RONIN_CONFIG_DIR = path.join(root, 'config');
process.env.RONIN_SERVICES_SECRETS_DIR = path.join(root, 'secrets');
process.env.RONIN_WAYS_DIR = path.join(root, 'ways');

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
    reasons: ['different_strengths', 'avoid_lock_in'], run_location: 'personal_server',
    user_intro: 'I build small, durable software.\nI prefer direct answers.\nThis third line is dropped.',
    own_words: 'Keep the setup small.',
  });
  const record = await readRegistration();
  assert.equal(record.email_masked, 'p*****@example.com');
  assert.equal(record.purpose, 'Build a product');
  assert.equal(record.user_type, 'individual');
  assert.equal(record.preferred_feature, 'multiple_providers');
  assert.deepEqual(record.reasons, ['different_strengths', 'avoid_lock_in']);
  assert.equal(record.run_location, 'personal_server');
  assert.equal(record.user_intro, 'I build small, durable software.\nI prefer direct answers.');
  const intro = await readFile(path.join(root, 'ways', 'floor', 'user-intro.md'), 'utf8');
  assert.match(intro, /- \*\*scope:\*\* floor/);
  assert.match(intro, /## About the user\n\nI build small, durable software\.\nI prefer direct answers\./);
  assert.doesNotMatch(intro, /third line/);
  const { resolveFloorBehaviours } = await import('../src/behaviours.js');
  const resolvedIntro = (await resolveFloorBehaviours()).find((row) => row.book === 'user-intro');
  assert.equal(resolvedIntro?.file, path.join(root, 'ways', 'floor', 'user-intro.md'));
  const { compileBirthReadmeAt, isShelfTeaching } = await import('../src/birth-readme.js');
  const readme = await compileBirthReadmeAt(path.join(root, 'session'), [resolvedIntro!.file], 'newborn', isShelfTeaching);
  assert.match(await readFile(readme, 'utf8'), /^## User intro[\s\S]*^### About the user/m);
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

test('Setup keeps Campaign Templates out and opens Presets only from Launch Your Own', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const id of ['setup.register', 'setup.roots', 'setup.installations']) assert.match(source, new RegExp(id.replace('.', '\\.')));
  assert.doesNotMatch(source, /setup\.services|setup\.gbrain/);
  // Model providers is the one surface Ronin Settings also seats; its type is that module's.
  assert.match(source, /providers: PROVIDER_SURFACE_TYPE/);
  assert.match(source, /item\.id === 'preset'[\s\S]*context\.workbench\?\.place\(PRESETS_TYPE/);
  assert.doesNotMatch(source, /CAMPAIGN_TEMPLATES_TYPE|createTemplatesSurface|campaignTemplatesDefinition/);
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
  const { measureProviders } = await import('../src/provider-summary.js');
  const calls: unknown[] = [];
  const environment = { mountProviderSetupSession: (input: unknown) => { calls.push(input); return { destroy() {} }; } };
  const host = {};
  const availability = [{
    id: 'claude', label: 'Claude Code', get: '', parked: '', cmd: 'claude', installed: true, path: '/bin/claude',
  }];
  const measured = await measureProviders({}, { availability, signedIn: async () => false });
  const closed = await setupRuntimeAnswer({}, measured, { exists: async () => false });
  assert.equal(mountProviderAttachment(environment, host, closed.providers[0], 'workspace1', () => {}), null);
  const open = await setupRuntimeAnswer({}, measured, { exists: async (name) => name === 'provider_setup_claude' });
  const mounted = mountProviderAttachment(environment, host, open.providers[0], 'workspace1', () => {});
  assert.ok(mounted);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0] as { session: string; workspace: string }).session, 'provider_setup_claude');
  assert.deepEqual((calls[0] as { session: string; workspace: string }).workspace, 'workspace1');
});

test('selector definitions retain neutral provider grouping without requirement targets', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  // Model providers is the one surface two workbenches seat; its grouping rides its own definition.
  assert.match(source, /providerSurfaceDefinition\(\),/);
  const shared = await (await import('node:fs/promises')).readFile(new URL('../public/js/provider-surface.js', import.meta.url), 'utf8');
  assert.match(shared, /groupKey: PROVIDER_SURFACE_TYPE/);
  assert.doesNotMatch(source, /SETUP_REQUIREMENT_TARGETS|targetKey|targetClass/);
});

test('Register presents one open profile flow with card choices and anonymous delivery', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  for (const name of ['email', 'own_words']) assert.match(source, new RegExp(`name = '${name}'|input\\('${name}'`));
  assert.match(source, /userIntroText\.rows = 4/);
  assert.match(source, /saveUserIntro\(\)/, 'the local Agent introduction remains separate from registration delivery');
  for (const name of ['identity_mode', 'kind', 'preferred_feature', 'run_location']) assert.match(source, new RegExp(`choiceGroup\\('${name}'`));
  assert.match(source, /const question = ask\(/);
  assert.equal((source.match(/exposed: true/g) || []).length, 1, 'Register exposes its short choice selectors through ERABI');
  assert.match(source, /key: name, label: short \|\| t\('ask\.answer', 'Answer'\), many: multiple, options:/, 'the head carries the question; the stone carries a short noun, never the question again');
  assert.match(source, /el\('fieldset', 'setup-register-checklist'\)/, 'long reasons are plain check rows outside ERABI');
  for (const key of ['identity_short', 'kind_short', 'preferred_feature_short', 'reasons_short', 'run_location_short']) assert.match(source, new RegExp(`short: t\\('setup_surface\\.${key}'`), `${key} names the stone`);
  assert.doesNotMatch(source, /glyph: '·'/, 'unruled Register answers are rectangles without placeholder glyphs');
  assert.match(source, /reasons\.other\.value/);
  assert.match(source, /kind: '', kind_other: ''/);
  assert.doesNotMatch(source, /kind\.wrap\.append\(kindOther\)/, 'the conditional input stays outside ERABI repaint ownership');
  assert.match(source, /kind\.wrap, kindOther, ownField,/);
  assert.match(source, /preferredFeature\.wrap, reasons\.wrap,/);
  assert.doesNotMatch(source, /Who is using Ronin\?|\['individual', 'Just me'\]|\['team', 'A team'\]|\['builder', 'Builder'\]|\['exploring', 'Exploring'\]/);
  assert.match(source, /Welcome to Ronin/);
  assert.match(source, /setup-register-group/);
  assert.match(source, /setup-register-bounded/);
  const css = await (await import('node:fs/promises')).readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(source, /sub: description/, 'the core-capability explanation is the ask caption');
  assert.match(source, /Which of these describes you best in terms of getting value from Ronin\?/);
  assert.doesNotMatch(source, /Which of these things Ronin does would you appreciate most\?/);
  assert.doesNotMatch(source, /setup-register-half/, 'About you stacks its questions at every width');
  assert.doesNotMatch(css, /@container setup-register[^}]*\.setup-register-group \{ grid-template-columns: repeat\(2/, 'groups never split into two columns');
  assert.match(css, /\.setup-register-group > :not\(h3\) \+ :not\(h3\) \{ margin-top: var\(--space-6\); \}/, 'questions breathe more than the lines inside them');
  assert.match(css, /\.setup-register-check \{[^}]*padding: var\(--space-1\) 0;/, 'checklist lines sit tight');
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
  assert.doesNotMatch(source, /Communication choices|No communication|Update preferences/);
  assert.match(source, /registration_confirmation', 'Registration confirmation'/);
  assert.match(source, /Required only if you want to install Ronin Services\./);
  assert.match(source, /identity\.dataset\.tone = current\?\.status === 'pending' \? 'pending' : 'ok'/);
  assert.match(css, /\.setup-register-compact \{ container: setup-register \/ inline-size;/, 'Register sizes its pairs from its own width');
  assert.match(css, /@container setup-register \(min-width: 40rem\)/);
  assert.match(css, /\.setup-register-group \{[^}]*border-top: var\(--edge-2\) solid var\(--kaki\)/, 'groups open with a kaki rule');
  assert.doesNotMatch(css, /\.setup-register-group \{[^}]*(?:border: var\(--edge\)|background: var\(--panel\))/, 'groups are not boxes');
  for (const label of ['With email', 'Anonymous', 'No thank you', 'Work from anywhere', 'Multiple providers without lock-in', 'Agents with team coordination skills']) assert.match(source, new RegExp(label));
  for (const message of ['Different models have different strengths', 'network issues', 'New models keep arriving', 'locked into one provider', 'runs out of tokens', 'hidden sub-agents', 'Something else']) assert.match(source, new RegExp(message));
  for (const place of ['Virtual machine', 'Personal server', 'Personal computer']) assert.match(source, new RegExp(place));
  assert.match(source, /Where will you install Ronin\?/);
  assert.doesNotMatch(source, /Where will you run Ronin\?|Where Ronin fits/);
  for (const kind of ['Which of these are you most likely to use?', 'Build software', 'Life assistants', 'Research and writing']) assert.match(source, new RegExp(kind.replace('?', '\\?')));
  assert.match(source, /form\.append\(welcome, registrationIntro, about, fit, send\)/, 'the introduction and routing choice lead the registration form');
  assert.match(source, /context\.environment\?\.kinds\?\.set\(routeKind \? \[routeKind\] : \[\]\)/, 'the answer changes Setup routing preferences');
  assert.match(source, /kind: '', kind_other: ''/, 'routing is not registration profile data');
  assert.match(source, /own_words: ''/, 'routing notes are not registration profile data');
  assert.match(source, /about\.append\([\s\S]*?identityMode\.wrap, emailField, runLocation\.wrap\)/, 'where Ronin will live belongs to About you');
  assert.ok(source.indexOf('runLocation.wrap') < source.indexOf('preferredFeature.wrap, reasons.wrap'), 'machine location comes before capability preference');
  assert.doesNotMatch(source, /Your starting theme|theme\.wrap/);
  assert.doesNotMatch(source, /What would make Ronin useful to you\?|Anything else\? \(optional\)/);
  assert.match(source, /setup_surface\.own_words', 'Anything else'/);
  assert.match(source, /Enjoy using Ronin\. If you’d like to share feedback later, we’d be glad to hear from you at a later date\./);
  assert.match(source, /declinedRegistration[\s\S]*?fit\.hidden = declinedRegistration/);
  assert.match(source, /registerAction\.hidden = declinedRegistration/);
  assert.match(source, /user_intro_submit', 'Submit'/);
  assert.match(source, /if \(result\.ok\) userIntro\.hidden = true/);
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

test('Services retains registration, installation, master, and explicit restart authority', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ servicesSetupModel \} from '\.\/services-setup-state\.js'/);
  assert.match(source, /import \{ campaignById, campaigns, loadCampaigns, saveCampaign \} from '\.\/campaigns\.js'/);
  assert.match(source, /import \{ completeInstallationMap \} from '\.\/installation-map\.js'/);
  assert.match(source, /setup-services-mark/);
  assert.match(source, /mark\.src = 'brand\/services-mark\.svg'/);
  assert.match(source, /fetch\('brand\/services-mark\.svg'\)/, 'the one mark file is inlined so the R follows data-theme');
  assert.match(source, /host\.innerHTML = markup;\n\s*host\.querySelector\('svg'\)\?\.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(source, /rs-r|M31 6h58/, 'no second copy of the mark lives in the surface');
  assert.match(source, /request\('\/api\/setup\/registration', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/installed', \{ cache: 'no-store' \}\)/);
  assert.match(source, /request\('\/api\/services\/activation', \{ cache: 'no-store' \}\)/);
  assert.match(source, /servicesSetupModel\(registration, installed, activation\)/);
  assert.match(source, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(source, /if \(item\.act === 'register'\) \{ openRegister\(\); return; \}/);
  assert.match(source, /workbench\?\.place\(SETUP_SURFACE_TYPES\.register/);
  assert.match(source, /item\.act === 'install' \? '\/api\/services\/install' : '\/api\/services\/activation\/poll'/);
  // The On step is the Campaign's own installation switch.
  assert.match(source, /request\('\/api\/installations'\)/);
  assert.match(source, /ronin_services: on/);
  assert.match(source, /saveCampaign\(row\.id, \{ config: \{ installations \} \}\)/);
  assert.match(source, /setAttribute\('aria-pressed', String\(item\.pressed === true\)\)/);
  // Restart: the one sanctioned tool behind one route; the browser asks, then reads the restart off startedAt changing.
  assert.match(source, /if \(item\.act === 'restart'\) \{ await restartRonin\(state, startedAt\); return; \}/);
  assert.match(source, /request\('\/api\/machine\/restart', \{ method: 'POST', json: \{\} \}\)/);
  assert.match(source, /if \(!asked\.ok && asked\.kind !== 'network'\)/, 'a refusal is shown in the tool\'s words; only no answer means Ronin went down');
  assert.match(source, /probe\.data\.cowork\.startedAt !== startedAt\) break;/, 'the restart is read off the machine, not assumed');
  assert.match(source, /installed\.kind === 'network' && body\.dataset\.state\) \{ timer = setTimeout/, 'a server down for a moment does not repaint the surface as Not installed');
  const route = await (await import('node:fs/promises')).readFile(new URL('../src/routes/machine-restart-api.ts', import.meta.url), 'utf8');
  assert.match(route, /join\(REPO_ROOT, 'ronin_bin', 'ronin-host'\)/, 'the route runs the sanctioned tool and names no unit');
  assert.match(route, /execFile\(RESTART_TOOL, \['restart'\]/, 'the route selects only the fixed restart subcommand');
  assert.doesNotMatch(route, /execFile\(['"]systemctl|ronin\.service/, 'the route invokes no systemctl and names no unit; only the tool does');
  assert.match(route, /if \(!process\.env\.INVOCATION_ID\) \{\n\s*res\.status\(409\)/, 'a copy that is not the installed service refuses rather than restarting the wrong Ronin');
  assert.match(route, /res\.status\(409\)\.json\(\{ error: \(error\.stderr \|\| error\.message\)/, 'the tool\'s refusal is answered in its own words');
  const index = await (await import('node:fs/promises')).readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
  assert.match(index, /registerMachineRestart\(app\)/);
  assert.doesNotMatch(source, /notifySummary\(SETUP_SURFACE_TYPES\.services/);
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
  assert.match(services, /<title id="services-mark-title">Ronin Services mark<\/title>/);
  assert.match(services, /aria-labelledby="services-mark-title services-mark-desc"/);
  assert.doesNotMatch(services, /id="(title|desc)"/, 'ids are prefixed: the markup is inlined into the page, where a bare id would collide');
  // Letters are built from one house cell and turned to the frame's own angle.
  assert.match(services, /transform="translate\(60 52\) scale\(\.86\) rotate\(28\.5\) translate\(-62\.5 -52\)"/);
  assert.match(services, /<g class="rs-r" stroke="#3f6a95"><path d="M31 76V28H51L57 40L51 52H31"\/><path d="M45 52L57 76"\/><\/g>/, 'the R: stem, cell, leg');
  assert.match(services, /<path class="rs-k" stroke="#c46243" d="M94 40L88 28H74L68 40L74 52H88L94 64L88 76H74L68 64"\/>/, 'the S: two cells, kaki');
  assert.match(services, /<path class="rs-k" fill="none" stroke="#c46243" stroke-width="8"/, 'the frame carries the kaki class too');
  // The R follows the shell's reference blue; as a plain image it falls back by scheme.
  assert.match(services, /\.rs-k\{stroke:var\(--kaki,#c46243\)\}\.rs-r\{stroke:var\(--accent-2,#3f6a95\)\}@media \(prefers-color-scheme:dark\)\{\.rs-r\{stroke:var\(--accent-2,#81a2be\)\}\}/, 'every colour is token-bound when inlined, with the file fallbacks when loaded as an image');
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
    ['restart_needed', reg('optional'), here({ switched_on: true, restart_needed: true }), act('not_requested'), 'restart needed', 'Switched on · not yet running', 'register:Register:register install:Done:done switch:Turn off:switch_off restart:Restart:restart', false],
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
  assert.equal(offButRunning.polling, false, 'restart disagreement waits for an explicit restart without polling');
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

test('Setup gbrain answers its measured facts plainly with at most one action per state', async () => {
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

test('Setup gbrain keeps installation/default choice on Campaign Installations and keeps the commons dashboard on its default', async () => {
  const [setup, gbrain] = await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/js/gbrain.js', import.meta.url), 'utf8'),
  ]);
  assert.match(setup, /presentation: 'setup'/);
  assert.match(setup, /setupRuntime\?\.gbrain|runtime\?\.gbrain/);
  assert.match(setup, /onState: \(\) => context\.workbench\?\.refreshSelector/);
  assert.match(setup, /openServices: \(\) => context\.workbench\?\.place\(SETUP_SURFACE_TYPES\.installations/);
  assert.match(setup, /openProviders: \(\) => context\.workbench\?\.place\(SETUP_SURFACE_TYPES\.providers/);
  assert.doesNotMatch(setup, /agentsDefault/);
  // Start your first Personal Assistant is exactly the preset's launch: same plan, same route, same new tab.
  assert.match(setup, /launchPresetPlan\(buildLaunchPlan\(slot, '', controls\)\)/);
  assert.match(setup, /HOUSE_PRESETS\.find\(\(row\) => row\.handle === 'personal_assistant'\)/);
  assert.match(setup, /presetLaunchUrl\(result\.data \|\| \{\}, seatingPlan\('personal_assistant'/);
  assert.match(gbrain, /import \{ gbrainAssistantPrompt, gbrainSetupModel \} from '\.\/gbrain-setup-state\.js'/);
  assert.match(gbrain, /if \(!root\.querySelector\('\.setup-gbrain-compact'\)\) renderSetup\(undefined\)/);
  assert.match(gbrain, /row\(t\('campaign_view\.available', 'Available'\)\)/);
  assert.match(gbrain, /row\(t\('campaign_view\.default_for_all_agents', 'Default for all Agents'\)\)/);
  assert.match(setup, /installationControls: context\.installationControls/);
  assert.match(gbrain, /const mine = \+\+reads;[\s\S]*?if \(mine === reads\) renderSetup\(result\)/);
  assert.match(gbrain, /if \(!setup\) root\.append\(head, privacy, search, integrations\)/);
  for (const question of ['gbrain.setup_q_installed', 'gbrain.setup_q_accounts']) assert.ok(gbrain.includes(question), question);
  assert.doesNotMatch(gbrain, /gbrain\.setup_q_agents|gbrain\.setup_agents_/);
  assert.match(gbrain, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(gbrain, /request\('\/api\/gbrain\/install', \{ method: 'POST', json: \{\} \}\)/);
  assert.match(gbrain, /root\.replaceChildren\(wrap\)/);
  for (const kept of ['renderPrivacy(r.data)', 'renderSearch(r.data)', 'renderIntegrations(r.data)', 'integrations.append(renderRemove())', 'renderLoad(r.data)']) assert.ok(gbrain.includes(kept), kept);
  assert.doesNotMatch(gbrain, /designedErrors|gb-notice|gb-setup|setup-gbrain-benefit|setup-gbrain-facts/);
});

test('Setup has one Installations card, Account has no gbrain tab, and Machine Settings has no gbrain switch', async () => {
  const fs = await import('node:fs/promises');
  const [surfaces, setupView, account, machine, installations] = await Promise.all([
    fs.readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/setup-view.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/cowork-commons.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/machine-settings.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/js/campaign-installations.js', import.meta.url), 'utf8'),
  ]);
  assert.match(surfaces, /definition\(SETUP_SURFACE_TYPES\.installations, t\('campaign_view\.installations', 'Installations'\), createSetupInstallationsSurface\)/);
  assert.match(surfaces, /createInstallationsSurface\(selected, \{[\s\S]*onInstallationsState: \(values\) => context\.environment\?\.onInstallationsState\?\.\(values\)/);
  const setupInstallations = surfaces.match(/function createSetupInstallationsSurface\(context\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(setupInstallations, 'Setup keeps a thin adapter around the shared Installations surface');
  assert.doesNotMatch(setupInstallations, /\.disabled\s*=|registrationLocked|MutationObserver|querySelectorAll/,
    'Setup may sequence the shared page but must not override its controls');
  assert.doesNotMatch(setupView, /SETUP_SURFACE_TYPES\.(?:services|gbrain)/);
  assert.doesNotMatch(account, /id: 'gbrain'/);
  assert.match(machine, /tickRow\(observed\.ronin\.services\.includes\('gbrain'\)/, 'the measured gbrain row remains');
  assert.doesNotMatch(machine, /settei\.use_gbrain|family: 'gbrain'/);
  assert.match(installations, /context\.createInstallationSurface\?\.\(installation\.id, sharedContext\)/);
  assert.match(surfaces, /createInstallationSurface: \(id, shared\) => id === 'ronin_services' \? createServicesSurface\(shared\) : id === 'gbrain' \? createGbrainSurface\(shared\) : null/);
  assert.match(installations, /stoneSurface\.select\('ronin_services'\)/);
  assert.match(installations, /context\.onInstallationsState\?\.\(\{ \.\.\.values \}\)/, 'Setup completion follows the saved installation map');
});

test('legacy Services mutation entry points explicitly retire to registration', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/routes/services-activation-api.ts', import.meta.url), 'utf8');
  assert.match(source, /app\.post\('\/api\/services\/activation'[\s\S]*status\(410\)/);
  assert.match(source, /Registration recovery moved to \/api\/setup\/registration\/recovery/);
  assert.match(source, /Registration deletion moved to \/api\/setup\/registration/);
});

test('Register resend confirmation remains wired from its button to the live recovery action', async () => {
  const fs = await import('node:fs/promises');
  const [surface, api] = await Promise.all([
    fs.readFile(new URL('../public/js/setup-surfaces.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/routes/services-activation-api.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(surface, /resend_registration[\s\S]*\/api\/setup\/registration\/recovery[\s\S]*action: 'resend'/,
    'the visible Resend confirmation action posts the recovery request');
  assert.match(api, /action === 'resend'\) await resend\(\)/,
    'the live recovery route dispatches that request to HQ resend');
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
  for (const file of ['services-card.js', 'services-activation.js', 'campaign-installations.js']) {
    const source = await fs.readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /['"]\/api\/services\/activation(?:\/resend|\/address)?['"][\s\S]{0,80}(?:method:\s*['"](?:POST|DELETE)|,\s*['"]DELETE)/, file);
  }
});
