import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * THE ONE MODEL PROVIDERS SURFACE (public/js/provider-surface.js), on a fake DOM: seated
 * by both workbenches, measuring once on paint, one stone per registry CLI, and a detail
 * of two sections — Yours (Setup's three steps and the native sign-in tile, mounted
 * through the environment), then The catalog (the dated facts and the model table).
 */
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
  { provider: 'openai', cli: 'codex', label: 'OpenAI', models: [{ model: 'gpt-5.6-sol', tier: 'frontier', default: true, cost: '$5 in · $30 out per M tokens (2026-09)', good_at: 'the hardest coding', not_good_at: 'bulk loops', cmd: 'codex --model gpt-5.6-sol' }] },
  { provider: 'pi', cli: 'pi', label: 'Pi', models: [{ model: 'pi-1', tier: 'standard', default: true, cost: 'free (2026-09)', good_at: 'chat', not_good_at: 'code', cmd: 'pi' }] },
] };
let machine = { measured_at: '2026-09-08T11:00:00.000Z', activated_count: 1, providers: [
  { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, signed_in: true, activated: true, state: 'activated' },
  { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, signed_in: false, activated: false, login_open: true, state: 'login_open', attachment: { type: 'session', key: 'provider_setup_codex', team: 'provider_setup', temporary: true } },
  { id: 'grok', label: 'Grok Build', from: 'xAI', installed: false, installable: true, install: 'npm install -g @xai-official/grok', activated: false, state: 'installable' },
] };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push(`${init.method || 'GET'} ${url}`);
  const body = url.startsWith('/api/provider-catalog') ? catalog : url.startsWith('/api/setup/runtime') || url.startsWith('/api/setup/providers/measure') ? machine : null;
  return { ok: body !== null, status: body ? 200 : 404, json: async () => body ?? { error: 'no such door' } };
};

const surface = await import('../public/js/provider-surface.js');
const walk = (root) => [...root.walk()];
const byClass = (root, cls) => walk(root).filter((node) => node.className.split(' ').includes(cls));
const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');
const context = () => {
  const mounts = [];
  const refreshed = { count: 0 };
  return {
    mounts, refreshed,
    workspace: 'workspace2', detail: {},
    workbench: { refreshSelector: () => { refreshed.count++; } },
    environment: { mountProviderSetupSession: (args) => { mounts.push(args); return { el: new FakeNode('div'), park() {}, destroy() {} }; } },
  };
};

test('one definition under one type, registered by both workbenches, with one shared sign-in mount', async () => {
  const definition = surface.providerSurfaceDefinition();
  assert.equal(definition.type, 'setup.providers');
  assert.equal(surface.PROVIDER_SURFACE_TYPE, 'setup.providers');
  assert.equal(definition.label(), 'Model providers');
  const setup = await source('setup-surfaces.js');
  assert.match(setup, /providers: PROVIDER_SURFACE_TYPE/);
  assert.match(setup, /providerSurfaceDefinition\(\),/);
  assert.doesNotMatch(setup, /createProviderSurface|setup-provider-state/);
  const campaign = await source('campaign-view.js');
  assert.match(campaign, /providers: PROVIDER_SURFACE_TYPE/);
  assert.match(campaign, /add\(providerSurfaceDefinition\(\)\)/);
  for (const view of ['setup-view.js', 'campaign-view.js']) {
    const text = await source(view);
    assert.match(text, /createProviderSetupSessionMount\(\)/, `${view} takes the shared mount`);
    assert.match(text, /mountProviderSetupSession: providerSessions\.mountProviderSetupSession/, `${view} hands it to its environment`);
    assert.match(text, /providerSessions\.destroyAll\(\)/, `${view} tears the tiles down with the view`);
    assert.doesNotMatch(text, /createTerminalTileHost/, `${view} keeps no copy of the mount`);
  }
  assert.match(await source('provider-setup-session.js'), /createTerminalTileHost\(\{ mode: 'full' \}\)/);
});

test('showing the surface measures once, then reads the catalog, and lists one stone per registry CLI plus catalog-only providers', async () => {
  const ctx = context();
  calls.length = 0;
  const made = surface.createProviderSurface(ctx);
  await made.show();
  assert.deepEqual(calls.slice(0, 3), ['POST /api/setup/providers/measure', 'GET /api/provider-catalog', 'GET /api/setup/runtime'], 'the probe first, the catalog read after the record is written');
  assert.equal(ctx.refreshed.count, 1);
  assert.equal(ctx.environment.setupRuntime, machine);
  const stones = byClass(made.el, 'sws-stone');
  assert.deepEqual(stones.map((stone) => stone.attributes['data-provider']), ['claude', 'codex', 'grok', 'pi']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-label')[0].textContent), ['Claude Code', 'Codex', 'Grok Build', 'Pi']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-state')[0].textContent), ['Activated', 'Sign-in open', 'Not installed', 'No CLI']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-secondary')[0].textContent), ['Anthropic · 2 models', 'OpenAI · 1 models', 'xAI', 'Pi · 1 models']);
  assert.deepEqual(stones.map((stone) => stone.attributes['data-activated']), ['true', 'false', 'false', 'false']);
  assert.equal(byClass(made.el, 'setup-provider-snapshot')[0].textContent, 'Catalog updated 2026-09-08 · prices and models as read then; refreshed with each Ronin update.');
  assert.match(byClass(made.el, 'setup-provider-measured')[0].textContent, /^This machine was measured .+; opening this surface measures it again\.$/);
  assert.equal(surface.providersSummary((await import('../public/js/form-steps.js')).providerCatalog()), '3 providers · 4 models · 1 activated here · catalog updated 2026-09-08');
});

test('a stone opens Yours — the three steps as Setup measures them — then The catalog with the dated facts and the model table', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show();
  byClass(made.el, 'sws-stone')[0].click();
  const detail = byClass(made.el, 'sws-detail')[0];
  const [yours, section] = detail.children;
  assert.equal(yours.className, 'setup-provider-yours');
  assert.equal(byClass(yours, 'setup-provider-eyebrow')[0].textContent, 'Yours');
  const card = byClass(yours, 'setup-provider')[0];
  assert.equal(card.dataset.provider, 'claude');
  assert.equal(walk(card).find((node) => node.tagName === 'H2').textContent, 'Claude Code');
  assert.equal(byClass(card, 'setup-provider-from')[0].textContent, 'From Anthropic');
  const steps = byClass(card, 'setup-provider-step');
  assert.deepEqual(steps.map((step) => [step.dataset.step, step.dataset.status, step.dataset.done]), [['installed', 'installed', 'true'], ['authenticated', 'recorded', 'true'], ['ready', 'ready', 'true']]);
  assert.equal(section.className, 'setup-provider-catalog');
  assert.equal(byClass(section, 'setup-provider-eyebrow')[0].textContent, 'The catalog · updated 2026-09-08');
  const facts = byClass(section, 'setup-provider-facts')[0].children;
  assert.deepEqual(facts.map((fact) => [fact.children[0].textContent, fact.children[1].textContent, fact.dataset.on]), [['Installed', 'yes', 'true'], ['Signed in', 'yes', 'true'], ['Activated', 'yes', 'true']]);
  const table = byClass(section, 'setup-provider-models')[0];
  assert.deepEqual(walk(table).filter((node) => node.tagName === 'TH').map((node) => node.textContent), ['Model', 'Tier', 'Cost', 'Good at', 'Not good at']);
  const rows = walk(table).filter((node) => node.tagName === 'TR' && node.dataset.model);
  assert.deepEqual(rows.map((row) => row.children.map((cell) => cell.textContent)), [
    ['opusthe default', 'frontier', '$5 in · $25 out per M tokens (2026-06)', 'long agentic coding runs', 'quick throwaway questions'],
    ['haiku', 'light', '$1 in · $5 out per M tokens (2026-06)', 'fast sub-agents', 'large refactors'],
  ]);
  assert.ok(byClass(section, 'setup-provider-table')[0], 'the table scrolls in its own box');
});

test('a sign-in in progress mounts the native tile through the environment, on whichever seat', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show();
  byClass(made.el, 'sws-stone')[1].click();
  assert.equal(ctx.mounts.length, 1);
  assert.equal(ctx.mounts[0].session, 'provider_setup_codex');
  assert.equal(ctx.mounts[0].workspace, 'workspace2');
  assert.equal(ctx.mounts[0].provider.id, 'codex');
  assert.ok(byClass(made.el, 'setup-provider-terminal')[0]);
  const labels = byClass(made.el, 'setup-provider-action').map((node) => node.textContent);
  assert.deepEqual(labels, ['Done', 'Close']);
  // Without a mount in the environment the surface says so rather than failing.
  const bare = surface.createProviderSurface({ ...context(), environment: {} });
  await bare.show();
  byClass(bare.el, 'sws-stone')[1].click();
  assert.match(byClass(bare.el, 'setup-provider-terminal')[0].textContent, /terminal attachment is unavailable/);
});

test('a catalog provider no registry CLI serves keeps its catalog section and says it cannot be set up here', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show();
  byClass(made.el, 'sws-stone')[3].click();
  const detail = byClass(made.el, 'sws-detail')[0];
  const [yours, section] = detail.children;
  assert.equal(walk(yours).find((node) => node.tagName === 'H2').textContent, 'Pi');
  assert.match(yours.textContent, /No CLI in Ronin’s registry serves this provider/);
  assert.equal(byClass(yours, 'setup-provider-step').length, 0);
  assert.deepEqual(walk(section).filter((node) => node.tagName === 'TR' && node.dataset.model).map((row) => row.dataset.model), ['pi-1']);
});

test('an unmeasured machine and the owner\'s catalog copy are each said, never guessed', async () => {
  machine = { providers: [] };
  catalog = { ...catalog, origin: 'user', updated: '2026-10-01' };
  const made = surface.createProviderSurface(context());
  await made.show();
  assert.equal(byClass(made.el, 'setup-provider-measured')[0].textContent, 'This machine has not been measured yet.');
  assert.equal(byClass(made.el, 'setup-provider-snapshot')[0].textContent, 'Your catalog copy, updated 2026-10-01.');
  assert.deepEqual(byClass(made.el, 'sws-stone').map((stone) => stone.attributes['data-provider']), ['anthropic', 'openai', 'pi'], 'with no registry rows every catalog provider is a stone of its own');
  assert.equal(surface.catalogLine({ origin: 'stock', updated: '' }), 'Catalog updated date not stated · prices and models as read then; refreshed with each Ronin update.');
});
