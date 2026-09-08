import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** The Campaign's Model providers surface (public/js/campaign-providers.js) on a fake DOM. */
class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.disabled = false; this.className = ''; this.hidden = false; }
  append(...nodes) { this.children.push(...nodes.flat().filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  add(node) { this.append(node); }
  remove() {}
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  focus() {}
  click() { if (!this.disabled) for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
  querySelector() { return null; }
  querySelectorAll(selector) { return selector === '[data-sws-id]' ? [...this.walk()].filter((node) => node.dataset.swsId) : []; }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  get textContent() { return this._text + this.children.map((node) => node?.textContent || '').join(''); }
  set textContent(value) { this._text = String(value || ''); this.children = []; }
  get classList() { const self = this; return { add: (...names) => { self.className = [self.className, ...names].filter(Boolean).join(' '); }, remove: (...names) => { self.className = self.className.split(' ').filter((n) => !names.includes(n)).join(' '); }, toggle: (name, on) => { on ? this.add(name) : this.remove(name); }, contains: (name) => self.className.split(' ').includes(name) }; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createElementNS: (_ns, tag) => new FakeNode(tag), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

let catalog = { origin: 'stock', path: '/stock/MODEL_PROVIDERS.md', updated: '2026-09-08', providers: [
  { provider: 'anthropic', cli: 'claude', label: 'Anthropic', models: [
    { model: 'opus', tier: 'frontier', default: true, cost: '$5 in · $25 out per M tokens (2026-06)', good_at: 'long agentic coding runs', not_good_at: 'quick throwaway questions', cmd: 'claude --model opus' },
    { model: 'haiku', tier: 'light', default: false, cost: '$1 in · $5 out per M tokens (2026-06)', good_at: 'fast sub-agents', not_good_at: 'large refactors', cmd: 'claude --model haiku' },
  ] },
  { provider: 'xai', cli: 'grok', label: 'xAI', models: [
    { model: 'grok-4.6', tier: 'frontier', default: true, cost: '$2 in · $6 out per M tokens (2026-09)', good_at: 'long-running agents', not_good_at: 'the cheapest bulk work', cmd: 'grok -m grok-4.6' },
  ] },
] };
let machine = {
  measured_at: '2026-09-08T11:00:00.000Z',
  providers: [
    { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, signed_in: true, activated: true },
    { id: 'grok', label: 'Grok Build', from: 'xAI', installed: false, signed_in: false, activated: false },
  ],
};
globalThis.fetch = async (url) => {
  const body = url.startsWith('/api/provider-catalog') ? catalog : url.startsWith('/api/setup/runtime') ? machine : null;
  return { ok: body !== null, status: body ? 200 : 404, json: async () => body ?? { error: 'no such door' } };
};

const providers = await import('../public/js/campaign-providers.js');
const walk = (root) => [...root.walk()];
const byClass = (root, cls) => walk(root).filter((node) => node.className.split(' ').includes(cls));

test('the card is a Campaign surface named Model providers, registered beside Routines and Installs', async () => {
  const definition = providers.campaignProvidersDefinition();
  assert.equal(definition.type, 'campaign.providers');
  assert.equal(definition.header, 'surface');
  assert.equal(definition.label(), 'Model providers');
  const view = await readFile(new URL('../public/js/campaign-view.js', import.meta.url), 'utf8');
  assert.match(view, /add\(\{ type: TYPES\.routines[\s\S]*?\n\s*add\(campaignProvidersDefinition\(\)\)/);
  assert.match(view, /providers: CAMPAIGN_PROVIDERS_TYPE/);
});

test('the surface lists every catalog provider as a stone with its measured state, dated once', async () => {
  let refreshed = 0;
  const surface = providers.createProvidersSurface(() => { refreshed++; });
  await surface.enter();
  assert.equal(refreshed, 1, 'the card summary is refreshed once the catalog is read');
  const stones = byClass(surface.el, 'sws-stone');
  assert.deepEqual(stones.map((stone) => stone.attributes['data-provider']), ['anthropic', 'xai'], 'operational first');
  assert.deepEqual(stones.map((stone) => stone.attributes['data-activated']), ['true', 'false']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-state')[0].textContent), ['activated', 'not installed']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-secondary')[0].textContent), ['2 models', '1 models']);
  const measured = byClass(surface.el, 'cv-providers-measured')[0].textContent;
  assert.match(measured, /^This machine was measured .+\. Ronin Setup → Model providers measures it again\.$/);
  assert.doesNotMatch(measured, /\bnow\b|\blive\b/);
  // The catalog is a snapshot, not live data: the surface says which copy and its date, once.
  assert.equal(byClass(surface.el, 'cv-providers-catalog')[0].textContent, 'Catalog updated 2026-09-08 · prices and models as read then; refreshed with each Ronin update.');
  const read = (await import('../public/js/form-steps.js')).providerCatalog();
  assert.equal(providers.providersSummary(read), '2 providers · 3 models · 1 activated here · catalog 2026-09-08');
  assert.equal(providers.providersSummary({ ...read, updated: '' }), '2 providers · 3 models · 1 activated here');
  assert.equal(providers.catalogLine({ origin: 'user', updated: '2026-10-01' }), 'Your catalog copy, updated 2026-10-01.');
  assert.equal(providers.catalogLine({ origin: 'stock', updated: '' }), 'Catalog updated date not stated · prices and models as read then; refreshed with each Ronin update.');
});

test('the owner\'s shadow copy is named as theirs, with its own date', async () => {
  catalog = { ...catalog, origin: 'user', path: '/yours/MODEL_PROVIDERS.md', updated: '2026-10-01' };
  const surface = providers.createProvidersSurface();
  await surface.enter();
  assert.equal(byClass(surface.el, 'cv-providers-catalog')[0].textContent, 'Your catalog copy, updated 2026-10-01.');
  catalog = { ...catalog, origin: 'stock', updated: '2026-09-08' };
});

test('a stone opens the provider: its three measured facts, then the catalog table with tier, cost, good at and not good at', async () => {
  const surface = providers.createProvidersSurface();
  await surface.enter();
  byClass(surface.el, 'sws-stone')[0].click();
  const card = byClass(surface.el, 'cv-provider')[0];
  assert.equal(card.dataset.provider, 'anthropic');
  assert.equal(walk(card).find((node) => node.tagName === 'H2').textContent, 'Anthropic');
  assert.equal(byClass(card, 'cv-from')[0].textContent, 'Served by Claude Code · 2 models in the catalog');
  const facts = byClass(card, 'cv-provider-facts')[0].children;
  assert.deepEqual(facts.map((fact) => [fact.children[0].textContent, fact.children[1].textContent, fact.dataset.on]), [['Installed', 'yes', 'true'], ['Signed in', 'yes', 'true'], ['Activated', 'yes', 'true']]);
  const table = byClass(card, 'cv-provider-models')[0];
  const head = walk(table).filter((node) => node.tagName === 'TH').map((node) => node.textContent);
  assert.deepEqual(head, ['Model', 'Tier', 'Cost', 'Good at', 'Not good at']);
  const rows = walk(table).filter((node) => node.tagName === 'TR' && node.dataset.model);
  assert.deepEqual(rows.map((row) => row.dataset.model), ['opus', 'haiku']);
  assert.deepEqual(rows[0].children.map((cell) => cell.textContent), ['opusthe default', 'frontier', '$5 in · $25 out per M tokens (2026-06)', 'long agentic coding runs', 'quick throwaway questions']);
  assert.deepEqual(rows[1].children.map((cell) => cell.textContent), ['haiku', 'light', '$1 in · $5 out per M tokens (2026-06)', 'fast sub-agents', 'large refactors']);
  assert.ok(byClass(card, 'cv-provider-table')[0], 'the table scrolls in its own box');
});

test('an unmeasured machine is said, never guessed', async () => {
  machine = { providers: [] };
  const surface = providers.createProvidersSurface();
  await surface.enter();
  const stones = byClass(surface.el, 'sws-stone');
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-state')[0].textContent), ['not installed', 'not installed']);
  assert.equal(byClass(surface.el, 'cv-providers-measured')[0].textContent, 'This machine has not been measured yet. Ronin Setup → Model providers measures it.');
  stones[1].click();
  const card = byClass(surface.el, 'cv-provider')[0];
  assert.equal(walk(card).find((node) => node.tagName === 'H2').textContent, 'xAI', 'no machine row: the catalog\'s own label stands');
});
