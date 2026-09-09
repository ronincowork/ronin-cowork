import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * THE ONE PICKER (public/js/form-steps.js `providerModelPair`) and the catalog read it
 * owns. A fake DOM of the few members the picker touches, and a fake fetch answering the
 * two doors it reads: the catalog rows and the Campaign's recorded provider summary.
 */
class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.disabled = false; this.value = ''; this.className = ''; }
  append(...nodes) { this.children.push(...nodes.flat().filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  add(node) { this.append(node); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  fire(name) { for (const callback of this.listeners[name] || []) callback({ currentTarget: this }); }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  get options() { return this.children.filter((node) => node.tagName === 'OPTION'); }
  get textContent() { return this._text + this.children.map((node) => node?.textContent || '').join(''); }
  set textContent(value) { this._text = String(value || ''); this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

// GET /api/provider-catalog: the catalog's origin and date, then one entry per provider.
const CATALOG_DOOR = { origin: 'stock', path: '/stock/MODEL_PROVIDERS.md', updated: '2026-09-08', providers: [
  { provider: 'anthropic', cli: 'claude', label: 'Anthropic', models: [
    { model: 'opus', tier: 'frontier', default: true, cost: '$5 in · $25 out per M tokens (2026-06)', good_at: 'long agentic coding runs', not_good_at: 'quick throwaway questions', cmd: 'claude --model opus' },
    { model: 'haiku', tier: 'light', default: false, cost: '$1 in · $5 out per M tokens (2026-06)', good_at: 'fast sub-agents', not_good_at: 'large refactors', cmd: 'claude --model haiku' },
  ] },
  { provider: 'openai', cli: 'codex', label: 'OpenAI', models: [
    { model: 'gpt-5.6-sol', tier: 'frontier', default: true, cost: '$5 in · $30 out per M tokens (2026-09)', good_at: 'the hardest coding', not_good_at: 'bulk loops', cmd: 'codex --model gpt-5.6-sol' },
  ] },
  { provider: 'google', cli: 'gemini', label: 'Google', models: [
    { model: 'gemini-3.8-flash', tier: 'standard', default: true, cost: '$0.75 in · $3.75 out per M tokens (2026-09)', good_at: 'fast everyday coding', not_good_at: 'the deepest reasoning', cmd: 'gemini --model gemini-3.8-flash' },
  ] },
] };
const MACHINE = {
  measured_at: '2026-09-08T11:00:00.000Z',
  providers: [
    { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, signed_in: false, activated: false },
    { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, signed_in: true, activated: true },
    { id: 'gemini', label: 'Gemini CLI', from: 'Google', installed: false, signed_in: false, activated: false },
  ],
};
globalThis.fetch = async (url) => {
  const body = url.startsWith('/api/provider-catalog') ? CATALOG_DOOR : url.startsWith('/api/setup/runtime') ? MACHINE : null;
  return { ok: body !== null, status: body ? 200 : 404, json: async () => body ?? { error: 'no such door' } };
};

const steps = await import('../public/js/form-steps.js');
const { orderedCatalog, catalogRows, providerModelPair, loadProviderCatalog, providerCatalog } = steps;
const schema = await import('../public/js/machine-settings-schema.js');
const CATALOG = catalogRows(CATALOG_DOOR.providers);

test('the catalog door flattens to rows that carry their provider, CLI and the catalog\'s own label', () => {
  assert.deepEqual(CATALOG.map((row) => [row.provider, row.cli, row.provider_label, row.model]), [['anthropic', 'claude', 'Anthropic', 'opus'], ['anthropic', 'claude', 'Anthropic', 'haiku'], ['openai', 'codex', 'OpenAI', 'gpt-5.6-sol'], ['google', 'gemini', 'Google', 'gemini-3.8-flash']]);
  assert.deepEqual(catalogRows([{ provider: 'nous', cli: 'hermes', models: [{ model: 'x' }] }]).map((row) => row.provider_label), ['nous'], 'no label: the id stands');
  assert.deepEqual(catalogRows(null), []);
});

test('the catalog is ordered with the providers this machine can launch first, in catalog order within', () => {
  const rows = orderedCatalog(CATALOG, MACHINE.providers);
  assert.deepEqual(rows.map((row) => `${row.provider}/${row.model}`), ['openai/gpt-5.6-sol', 'anthropic/opus', 'anthropic/haiku', 'google/gemini-3.8-flash']);
  assert.deepEqual(rows.map((row) => row.operational), [true, false, false, false]);
  assert.equal(rows[0].provider_label, 'OpenAI', 'the catalog\'s label, not the machine row\'s');
  assert.equal(rows[1].cli_label, 'Claude Code');
  // A row whose CLI the machine has no row for is offered under its own id, never dropped.
  assert.equal(orderedCatalog([{ provider: 'nous', cli: 'hermes', model: 'x', tier: 'standard' }], [])[0].provider_label, 'nous');
});

test('the picker reads the two doors itself and offers every provider, disabling what is not on this machine', async () => {
  const catalog = await loadProviderCatalog();
  assert.equal(catalog.loaded, true);
  assert.equal(catalog.measured_at, MACHINE.measured_at);
  assert.equal(catalog.origin, 'stock');
  assert.equal(catalog.updated, '2026-09-08', 'the catalog is a snapshot: its date rides with it');
  assert.equal(providerCatalog(), catalog);
  const draft = { provider: '', model: '' };
  const pair = providerModelPair(() => draft, (provider, model) => { draft.provider = provider; draft.model = model; }, (label, control) => { control.setAttribute('aria-label', label); return control; });
  assert.equal(pair.el.className, 'fs-pair');
  const providerOptions = pair.providerSelect.options;
  assert.deepEqual(providerOptions.map((option) => [option.value, option.disabled]), [['', false], ['openai', false], ['anthropic', true], ['google', true]]);
  assert.equal(providerOptions[1].textContent, 'OpenAI');
  assert.equal(providerOptions[2].textContent, 'Anthropic — not on this machine');
  assert.equal(pair.modelSelect.disabled, true, 'no provider named yet');
  assert.deepEqual(pair.modelSelect.options.map((option) => option.value), ['']);
});

test('naming a provider offers its models as id and tier alone — no description in the option; the model pick stands alone', async () => {
  await loadProviderCatalog();
  const draft = { provider: 'anthropic', model: '' };
  const pair = providerModelPair(() => draft, (provider, model) => { draft.provider = provider; draft.model = model; }, (_label, control) => control);
  assert.equal(pair.providerSelect.value, 'anthropic');
  assert.equal(pair.modelSelect.disabled, false);
  assert.deepEqual(pair.modelSelect.options.map((option) => option.textContent), ['default', 'opus · frontier', 'haiku · light']);
  assert.deepEqual(pair.modelSelect.options.map((option) => option.disabled), [false, true, true], 'Anthropic is installed but not activated here');
  pair.modelSelect.value = 'haiku'; pair.modelSelect.fire('change');
  assert.deepEqual(draft, { provider: 'anthropic', model: 'haiku' });
  // Changing the provider clears the model: the pick is the provider's default until said otherwise.
  pair.providerSelect.value = 'openai'; pair.providerSelect.fire('change');
  assert.deepEqual(draft, { provider: 'openai', model: '' });
  assert.deepEqual(pair.modelSelect.options.map((option) => option.value), ['', 'gpt-5.6-sol']);
  assert.equal(pair.modelSelect.options[1].disabled, false);
});

test('a fixed provider drops the provider select: the row is the provider, the pick is the model alone', async () => {
  await loadProviderCatalog();
  const draft = { provider: 'openai', model: 'gpt-5.6-sol' };
  const pair = providerModelPair(() => draft, (provider, model) => { draft.provider = provider; draft.model = model; }, (label, control) => { control.setAttribute('aria-label', label); return control; }, { fixed: 'openai', blank: { model: '— none set —' } });
  assert.deepEqual(pair.el.children, [pair.modelSelect]);
  assert.equal(pair.modelSelect.attributes['aria-label'], 'model');
  assert.deepEqual(pair.modelSelect.options.map((option) => option.textContent), ['— none set —', 'gpt-5.6-sol · frontier']);
  assert.equal(pair.modelSelect.value, 'gpt-5.6-sol');
  pair.modelSelect.value = ''; pair.modelSelect.fire('change');
  assert.deepEqual(draft, { provider: 'openai', model: '' });
  // A fixed provider this machine cannot launch says so on each row rather than hiding them.
  const off = providerModelPair(() => ({ provider: 'google', model: '' }), () => {}, (_label, control) => control, { fixed: 'google' });
  assert.equal(off.modelSelect.options[1].textContent, 'gemini-3.8-flash · standard — not on this machine');
  assert.equal(off.modelSelect.options[1].disabled, true);
});

test('the registry seeds name catalog rows by tier, and only rows this machine can launch', () => {
  const rows = orderedCatalog(CATALOG, MACHINE.providers);
  assert.equal(schema.seedRow('models:first', rows).model, 'gpt-5.6-sol');
  assert.equal(schema.seedRow('models:light', rows).model, 'gpt-5.6-sol', 'no launchable light row: the first answer stands');
  const allOn = orderedCatalog(CATALOG, MACHINE.providers.map((row) => ({ ...row, activated: true })));
  assert.equal(schema.seedRow('models:first', allOn).model, 'opus', 'the first provider’s marked default, not its first row');
  assert.equal(schema.seedRow('models:light', allOn).model, 'haiku');
  assert.equal(schema.seedRow('models:first', orderedCatalog(CATALOG, [])), null);
  assert.equal(schema.initialOf({ seed: 'models:light' }, { record: {}, rows: allOn }), 'anthropic\thaiku');
  assert.equal(schema.initialOf({ seed: 'models:first' }, { record: {}, rows: [] }), '');
  assert.deepEqual(schema.pickerProvider({ options: 'models' }), { fixed: '' });
  assert.deepEqual(schema.pickerProvider({ options: 'models_for:openai' }), { fixed: 'openai' });
  assert.equal(schema.pickerProvider({ options: 'desk_profiles' }), null);
});

test('no client module keeps its own provider or model list, join, or vendor name', async () => {
  const read = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
  for (const file of ['add-agent.js', 'campaign-defaults.js', 'team-configuration.js', 'machine-settings.js', 'presets.js', 'new-agent.js', 'new-team-form.js']) {
    const source = await read(file);
    assert.match(source, /providerModelPair/, `${file} calls the one picker`);
    assert.doesNotMatch(source, /session-launch-specs|launchSpecData|launchTable|new Option\([^)]*\b(?:provider|model)\b|Claude Code|Codex|anthropic|openai/, `${file} keeps no copy`);
  }
  const home = await read('home.js');
  assert.doesNotMatch(home, /launchSpecData|session-launch-specs/);
  const stepsSource = await read('form-steps.js');
  assert.match(stepsSource, /request\('\/api\/provider-catalog'\)/, 'the one catalog read');
  assert.doesNotMatch(stepsSource, /session-launch-specs/);
  const schemaSource = await read('machine-settings-schema.js');
  assert.doesNotMatch(schemaSource, /haiku|mini|flash|LIGHT|modelOpts/);
});
