import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * THE ONE PICKER (public/js/form-steps.js `providerModelPair`) and the catalog read it
 * owns. A fake DOM of the few members the picker touches, and a fake fetch answering the
 * two doors it reads: the catalog with its rows already joined on the server (since
 * 2026-09-25 the client joins nothing), and the Campaign's recorded machine facts.
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

/** Rows as the server joins them: Native first, then what the CLI listed, two names each. */
const joined = (entry, on, listed = [], off = false) => {
  const base = { provider: entry.provider, cli: entry.cli, provider_label: entry.label, cli_label: entry.cli_label, operational: on, off, selectable: on, origin: 'stock', shadowed: false };
  const meta = new Map(entry.models.map((row) => [row.model, row]));
  return { ...entry, operational: on, off, origin: 'stock', shadowed: false, launch_modes: ['configured'], models: [
    { ...base, model: 'native', name: 'Native', cmd: entry.native, tier: '', default: true, cost: '', good_at: 'the CLI choosing its own configured or current default model', not_good_at: 'pinning a particular model' },
    ...listed.map(([id, name]) => ({ ...base, model: id, name, cmd: `${entry.native} --model ${id}`, tier: meta.get(id)?.tier || '', default: false, cost: meta.get(id)?.cost || '', good_at: meta.get(id)?.good_at || '', not_good_at: meta.get(id)?.not_good_at || '' })),
  ] };
};
const ANTHROPIC = { provider: 'anthropic', cli: 'claude', native: 'claude', label: 'Anthropic', cli_label: 'Claude Code', models: [
  { model: 'opus', tier: 'frontier', cost: '$5 in · $25 out per M tokens (2026-06)', good_at: 'long agentic coding runs', not_good_at: 'quick throwaway questions' },
  { model: 'haiku', tier: 'light', cost: '$1 in · $5 out per M tokens (2026-06)', good_at: 'fast sub-agents', not_good_at: 'large refactors' },
] };
const OPENAI = { provider: 'openai', cli: 'codex', native: 'codex', label: 'OpenAI', cli_label: 'Codex', models: [
  { model: 'gpt-5.6-sol', tier: 'frontier', cost: '$5 in · $30 out per M tokens (2026-09)', good_at: 'the hardest coding', not_good_at: 'bulk loops' },
] };
const GOOGLE = { provider: 'google', cli: 'gemini', native: 'gemini', label: 'Google', cli_label: 'Gemini CLI', models: [
  { model: 'gemini-3.8-flash', tier: 'standard', cost: '$0.75 in · $3.75 out per M tokens (2026-09)', good_at: 'fast everyday coding', not_good_at: 'the deepest reasoning' },
] };
// GET /api/provider-catalog: the catalog's origin and date, the record's dates, and one
// entry per provider with its joined rows — launchable providers first. Anthropic is
// installed but not activated here: its list was read once, so its rows are greyed, not hidden.
const door = (anthropicOff = false) => ({ origin: 'stock', path: '/stock/MODEL_PROVIDERS.md', updated: '2026-09-08', stock_updated: '2026-09-08', withdrawn: [], measured_at: '2026-09-08T11:00:00.000Z', refreshed_at: '2026-09-08T10:00:00.000Z', providers: [
  joined(OPENAI, true, [['gpt-5.6-sol', 'GPT-5.6-Sol']]),
  joined(ANTHROPIC, false, [['opus', 'Opus 5'], ['haiku', 'Haiku 4.5']], anthropicOff),
  joined(GOOGLE, false),
] });
let CATALOG_DOOR = door();
const MACHINE = {
  measured_at: '2026-09-08T11:00:00.000Z', refreshed_at: '2026-09-08T10:00:00.000Z',
  providers: [
    { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, signed_in: false, activated: false, version: null },
    { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, signed_in: true, activated: true, version: '0.157.0' },
    { id: 'gemini', label: 'Gemini CLI', from: 'Google', installed: false, signed_in: false, activated: false, version: null },
  ],
};
globalThis.fetch = async (url) => {
  const body = url.startsWith('/api/provider-catalog') ? CATALOG_DOOR : url.startsWith('/api/setup/runtime') ? MACHINE : null;
  return { ok: body !== null, status: body ? 200 : 404, text() { return this.json().then((b) => JSON.stringify(b)); }, json: async () => body ?? { error: 'no such door' } };
};

const steps = await import('../public/js/form-steps.js');
const { modelLabel, modelWord, providerModelPair, loadProviderCatalog, providerCatalog } = steps;
const schema = await import('../public/js/machine-settings-schema.js');

test('the picker reads the two doors itself; the rows arrive joined, launchable providers first, and it joins nothing', async () => {
  const catalog = await loadProviderCatalog();
  assert.equal(catalog.loaded, true);
  assert.equal(catalog.measured_at, MACHINE.measured_at);
  assert.equal(catalog.refreshed_at, '2026-09-08T10:00:00.000Z', 'when Refresh all last read every list rides with the read');
  assert.equal(catalog.origin, 'stock');
  assert.equal(catalog.updated, '2026-09-08', 'the catalog is a snapshot: its date rides with it');
  assert.equal(providerCatalog(), catalog);
  assert.deepEqual(catalog.rows.map((row) => `${row.provider}/${row.model}`), ['openai/native', 'openai/gpt-5.6-sol', 'anthropic/native', 'anthropic/opus', 'anthropic/haiku', 'google/native'], 'exactly the server\'s rows, in the server\'s order');
  assert.deepEqual(catalog.rows.map((row) => row.operational), [true, true, false, false, false, false]);
  assert.equal(catalog.rows[0].provider_label, 'OpenAI');
  assert.equal(catalog.rows[2].cli_label, 'Claude Code');
  assert.deepEqual(catalog.machine.map((row) => row.id), ['claude', 'codex', 'gemini'], 'the machine facts are kept for the Model providers surface');
});

test('two names: a row reads as the CLI\'s own name (the version is in it), the id is the value; a draft that carries only the id finds its name in the read', async () => {
  await loadProviderCatalog();
  const opus = providerCatalog().rows.find((row) => row.model === 'opus');
  assert.equal(modelLabel(opus), 'Opus 5');
  assert.equal(modelWord(opus), 'Opus 5 · frontier');
  assert.equal(modelLabel({ provider: 'anthropic', model: 'opus' }), 'Opus 5', 'a saved draft names the id; the label is the CLI\'s name');
  assert.equal(modelLabel({ provider: 'anthropic', model: 'unknown-id' }), 'unknown-id', 'an id the read does not know stands as itself');
  assert.equal(modelLabel({ model: 'native' }), 'Native');
  assert.equal(modelWord({ provider: 'openai', model: 'gpt-5.6-sol', name: 'GPT-5.6-Sol', tier: '' }), 'GPT-5.6-Sol', 'no tier, no dot');
});

test('the picker offers every provider, disabling what is not on this machine', async () => {
  await loadProviderCatalog();
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

test('naming a provider offers its rows as name and tier alone — the id is the value; the model pick stands alone', async () => {
  await loadProviderCatalog();
  const draft = { provider: 'anthropic', model: '' };
  const pair = providerModelPair(() => draft, (provider, model) => { draft.provider = provider; draft.model = model; }, (_label, control) => control);
  assert.equal(pair.providerSelect.value, 'anthropic');
  assert.equal(pair.modelSelect.disabled, false);
  assert.deepEqual(pair.modelSelect.options.map((option) => option.value), ['', 'native', 'opus', 'haiku']);
  assert.deepEqual(pair.modelSelect.options.map((option) => option.textContent), ['default', 'Native', 'Opus 5 · frontier', 'Haiku 4.5 · light'], 'the CLI\'s name and the tier, no description');
  assert.deepEqual(pair.modelSelect.options.map((option) => option.disabled), [false, true, true, true], 'Anthropic is installed but not activated here');
  pair.modelSelect.value = 'haiku'; pair.modelSelect.fire('change');
  assert.deepEqual(draft, { provider: 'anthropic', model: 'haiku' }, 'the id is what is saved');
  // Changing the provider clears the model: the pick is the provider's default until said otherwise.
  pair.providerSelect.value = 'openai'; pair.providerSelect.fire('change');
  assert.deepEqual(draft, { provider: 'openai', model: '' });
  assert.deepEqual(pair.modelSelect.options.map((option) => option.value), ['', 'native', 'gpt-5.6-sol']);
  assert.equal(pair.modelSelect.options[1].disabled, false, 'native remains selectable');
  assert.equal(pair.modelSelect.options[2].textContent, 'GPT-5.6-Sol · frontier');
});

test('a fixed provider drops the provider select: the row is the provider, the pick is the model alone', async () => {
  await loadProviderCatalog();
  const draft = { provider: 'openai', model: 'gpt-5.6-sol' };
  const pair = providerModelPair(() => draft, (provider, model) => { draft.provider = provider; draft.model = model; }, (label, control) => { control.setAttribute('aria-label', label); return control; }, { fixed: 'openai', blank: { model: '— none set —' } });
  assert.deepEqual(pair.el.children, [pair.modelSelect]);
  assert.equal(pair.modelSelect.attributes['aria-label'], 'model');
  assert.deepEqual(pair.modelSelect.options.map((option) => option.value), ['', 'native', 'gpt-5.6-sol']);
  assert.equal(pair.modelSelect.value, 'gpt-5.6-sol');
  pair.modelSelect.value = ''; pair.modelSelect.fire('change');
  assert.deepEqual(draft, { provider: 'openai', model: '' });
  // A fixed provider this machine cannot launch says so on each row rather than hiding them.
  const off = providerModelPair(() => ({ provider: 'google', model: '' }), () => {}, (_label, control) => control, { fixed: 'google' });
  assert.equal(off.modelSelect.options[1].textContent, 'Native — not on this machine');
  assert.equal(off.modelSelect.options[1].disabled, true);
});

test('a provider the owner turned off is greyed with that word — never the false "not on this machine"', async () => {
  CATALOG_DOOR = door(true);
  try {
    await loadProviderCatalog();
    assert.deepEqual(providerCatalog().rows.filter((row) => row.provider === 'anthropic').map((row) => [row.operational, row.off]), [[false, true], [false, true], [false, true]]);
    const pair = providerModelPair(() => ({ provider: '', model: '' }), () => {}, (_label, control) => control);
    assert.equal(pair.providerSelect.options[2].textContent, 'Anthropic — turned off');
    assert.equal(pair.providerSelect.options[2].disabled, true, 'disabled, never hidden');
    assert.equal(pair.providerSelect.options[3].textContent, 'Google — not on this machine', 'absent keeps its own words');
    const fixed = providerModelPair(() => ({ provider: 'anthropic', model: '' }), () => {}, (_label, control) => control, { fixed: 'anthropic' });
    assert.equal(fixed.modelSelect.options[1].textContent, 'Native — turned off');
    assert.equal(fixed.modelSelect.options[2].textContent, 'Opus 5 · frontier — turned off');
  } finally {
    CATALOG_DOOR = door();
    await loadProviderCatalog();
  }
});

test('the registry seeds name catalog rows by tier, and only rows this machine can launch', async () => {
  await loadProviderCatalog();
  const rows = providerCatalog().rows;
  assert.equal(schema.seedRow('models:first', rows).model, 'native');
  assert.equal(schema.seedRow('models:light', rows).model, 'native', 'no launchable light row: Native stands');
  const allOn = rows.map((row) => ({ ...row, operational: true, selectable: true }));
  assert.equal(schema.seedRow('models:first', allOn).model, 'native');
  assert.equal(schema.seedRow('models:light', allOn).model, 'haiku');
  assert.equal(schema.seedRow('models:first', []), null);
  assert.equal(schema.initialOf({ seed: 'models:light' }, { record: {}, rows: allOn }), 'anthropic\thaiku');
  assert.equal(schema.initialOf({ seed: 'models:first' }, { record: {}, rows: [] }), '');
  assert.deepEqual(schema.pickerProvider({ options: 'models' }), { fixed: '' });
  assert.deepEqual(schema.pickerProvider({ options: 'models_for:openai' }), { fixed: 'openai' });
  assert.equal(schema.pickerProvider({ options: 'desk_profiles' }), null);
});

test('no client module keeps its own provider or model list, join, or vendor name', async () => {
  const read = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
  for (const file of ['campaign-defaults.js', 'team-configuration.js', 'machine-settings.js', 'presets.js', 'new-agent.js', 'new-team-form.js', 'team-agents.js', 'provider-surface.js']) {
    const source = await read(file);
    if (source.includes("from './ask.js'")) assert.match(source, /ask\(/, `${file} asks through the one selector utility`);
    assert.match(source, /providerCatalog\(\)|providerModelPair/, `${file} reads or calls the shared provider catalog`);
    assert.doesNotMatch(source, /session-launch-specs|launchSpecData|launchTable|new Option\([^)]*\b(?:provider|model)\b|Claude Code|Codex|anthropic|openai/, `${file} keeps no copy`);
    assert.doesNotMatch(source, /model_list_current|\.listed\b|display_id|provider-inventory/, `${file} carries nothing of the client join that went away on 2026-09-25`);
  }
  const home = await read('home.js');
  assert.doesNotMatch(home, /launchSpecData|session-launch-specs/);
  const stepsSource = await read('form-steps.js');
  assert.match(stepsSource, /request\('\/api\/provider-catalog'\)/, 'the one catalog read');
  assert.doesNotMatch(stepsSource, /session-launch-specs|orderedCatalog|catalogRows|model_list|ronin:provider-inventory/, 'the client joins nothing and listens for no background read');
  assert.doesNotMatch(await read('events.js'), /provider-inventory/);
  const schemaSource = await read('machine-settings-schema.js');
  assert.doesNotMatch(schemaSource, /haiku|mini|flash|LIGHT|modelOpts/);
});
