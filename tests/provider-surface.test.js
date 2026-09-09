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

let catalog = { origin: 'stock', path: '/stock/MODEL_PROVIDERS.md', updated: '2026-09-08', stock_updated: '2026-09-08', withdrawn: [], providers: [
  { provider: 'anthropic', cli: 'claude', label: 'Anthropic', origin: 'stock', shadowed: false, models: [
    { model: 'opus', tier: 'frontier', default: true, cost: '$5 in · $25 out per M tokens (2026-06)', good_at: 'long agentic coding runs', not_good_at: 'quick throwaway questions', cmd: 'claude --model opus' },
    { model: 'haiku', tier: 'light', default: false, cost: '$1 in · $5 out per M tokens (2026-06)', good_at: 'fast sub-agents', not_good_at: 'large refactors', cmd: 'claude --model haiku' },
  ] },
  { provider: 'openai', cli: 'codex', label: 'OpenAI', models: [{ model: 'gpt-5.6-sol', tier: 'frontier', default: true, cost: '$5 in · $30 out per M tokens (2026-09)', good_at: 'the hardest coding', not_good_at: 'bulk loops', cmd: 'codex --model gpt-5.6-sol' }] },
  { provider: 'pi', cli: 'pi', label: 'Pi', models: [{ model: 'pi-1', tier: 'standard', default: true, cost: 'free (2026-09)', good_at: 'chat', not_good_at: 'code', cmd: 'pi' }] },
] };
let machine = { measured_at: '2026-09-08T11:00:00.000Z', activated_count: 1, providers: [
  { id: 'claude', label: 'Claude Code', from: 'Anthropic', installed: true, path: '/home/glen/.local/bin/claude', signed_in: true, activated: true, state: 'activated', version: '2.1.263', latest: '2.1.265', latest_checked_at: '2026-09-09T12:00:00.000Z', updatable: true, self_updates: true, askable: true, update: 'claude update', update_available: true },
  { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, signed_in: false, activated: false, login_open: true, state: 'login_open', attachment: { type: 'session', key: 'provider_setup_codex', team: 'provider_setup', temporary: true } },
  { id: 'grok', label: 'Grok Build', from: 'xAI', installed: false, installable: true, install: 'npm install -g @xai-official/grok', activated: false, state: 'installable' },
] };
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push(`${init.method || 'GET'} ${url}`);
  const body = url.startsWith('/api/provider-catalog') ? catalog
    : url.startsWith('/api/setup/runtime') || url.startsWith('/api/setup/providers/measure') || url.startsWith('/api/setup/providers/refresh') ? machine
      : url.endsWith('/update') || url.endsWith('/close') ? { ok: true } : null;
  return { ok: body !== null, status: body ? 200 : 404, json: async () => body ?? { error: 'no such door' } };
};

const surface = await import('../public/js/provider-surface.js');
const walk = (root) => [...root.walk()];
/** Let a background measure land: the stub fetch resolves on microtasks, so one macrotask is enough. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
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

test('showing the surface paints the stones from the record at once, measures behind them, and lists one stone per registry CLI plus catalog-only providers', async () => {
  const ctx = context();
  calls.length = 0;
  const made = surface.createProviderSurface(ctx);
  await made.show();
  assert.deepEqual(calls.slice(0, 3), ['GET /api/provider-catalog', 'GET /api/setup/runtime', 'POST /api/mika/ready'], 'the recorded provider count is painted first, then the one shared Mika readiness controller observes it');
  assert.equal(ctx.refreshed.count, 1);
  await settle();
  assert.deepEqual(calls.slice(3), ['GET /api/provider-catalog', 'GET /api/setup/runtime', 'POST /api/setup/providers/measure', 'GET /api/provider-catalog', 'GET /api/setup/runtime', 'POST /api/mika/ready', 'GET /api/provider-catalog', 'GET /api/setup/runtime'], 'then the surface catalog paint and background measure each re-read the single provider record');
  assert.equal(ctx.refreshed.count, 2, 'and the frame repainted when it landed');
  assert.equal(ctx.environment.setupRuntime, machine);
  const stones = byClass(made.el, 'sws-stone');
  assert.deepEqual(stones.map((stone) => stone.attributes['data-provider']), ['claude', 'codex', 'grok', 'pi']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-label')[0].textContent), ['Claude Code', 'Codex', 'Grok Build', 'Pi']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-state')[0].textContent), ['Activated', 'Sign-in open', 'Not installed', 'No CLI']);
  assert.deepEqual(stones.map((stone) => byClass(stone, 'sws-secondary')[0].textContent), ['Anthropic · 2 models', 'OpenAI · 1 models', 'xAI', 'Pi · 1 models']);
  assert.deepEqual(stones.map((stone) => stone.attributes['data-activated']), ['true', 'false', 'false', 'false']);
  const dates = byClass(made.el, 'setup-provider-dates')[0];
  assert.equal(walk(dates).find((node) => node.tagName === 'SUMMARY').textContent, 'Check dates');
  assert.deepEqual(byClass(dates, 'setup-provider-date-list')[0].children.filter((row) => !row.hidden).map((row) => row.children.map((cell) => cell.textContent)), [
    ['Catalog researched', '2026-09-08'],
    ['Machine measured', new Date('2026-09-08T11:00:00.000Z').toLocaleString()],
    ['Latest versions checked', new Date('2026-09-09T12:00:00.000Z').toLocaleString()],
  ]);
  assert.equal(byClass(made.el, 'setup-provider-intro').length, 0);
  // Refresh lives inside the dates box — it is the one press that asks outside the machine,
  // its own door, never the plain measure — and it says what it found, changed or not.
  assert.equal(byClass(dates, 'setup-provider-refresh-action').length, 1, 'Refresh is inside Check dates');
  assert.equal(byClass(made.el, 'setup-provider-refresh').length, 1, 'and nowhere else');
  calls.length = 0;
  byClass(dates, 'setup-provider-refresh-action')[0].click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls[0], 'POST /api/setup/providers/refresh');
  assert.match(byClass(dates, 'setup-provider-refresh-outcome')[0].textContent, /^Checked .+ — unchanged$/, 'nothing moved, and that is said with its time');
  assert.equal(dates.open, true);
  assert.equal(surface.providersSummary((await import('../public/js/form-steps.js')).providerCatalog()), '3 providers · 4 models · 1 activated here · catalog updated 2026-09-08');
});

test('a stone opens Yours — the three steps as Setup measures them — then The catalog with the dated facts and the model table', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show(); await settle();
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
  // The Installed step says the version, WHICH binary said it, and what Refresh last learned;
  // Update is the owner's press, named by what it runs.
  assert.equal(byClass(steps[0], 'setup-provider-state')[0].textContent, 'Installed 2.1.263 · 2.1.265 available · ~/.local/bin/claude');
  assert.equal(byClass(steps[0], 'setup-provider-self-update-note')[0].textContent, 'Usually updates itself.');
  const update = byClass(steps[0], 'setup-provider-update')[0];
  assert.equal(update.textContent, 'Update to 2.1.265');
  assert.match(byClass(steps[0], 'setup-provider-update-note')[0].textContent, /^claude update runs here in the page\. Tiles already running keep the version/);
  calls.length = 0;
  update.click();
  assert.equal(update.disabled, true, 'the button closes immediately while its session is created');
  assert.equal(update.textContent, 'Starting…');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls[0], 'POST /api/setup/providers/claude/update');
  assert.equal(section.className, 'setup-provider-catalog');
  assert.equal(byClass(section, 'setup-provider-eyebrow')[0].textContent, 'The catalog');
  assert.equal(byClass(section, 'setup-provider-provenance')[0].textContent, 'Shipped catalog · updated 2026-09-08', 'the section says which layer it came from');
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

test('an update in progress is the same window-in-a-window as a sign-in, with the same Close; a CLI with no package source says so', async () => {
  const saved = machine;
  machine = { ...machine, providers: [
    { ...machine.providers[0], update_open: true, attachment: { type: 'session', key: 'provider_setup_claude_update', team: 'provider_setup', temporary: true } },
    { id: 'gemini', label: 'Gemini CLI', from: 'Google', installed: true, path: '/usr/bin/gemini', signed_in: true, activated: true, state: 'activated', version: '0.59.0', latest: '0.59.0', updatable: true, askable: false, update: 'gemini update', update_available: false },
    { id: 'codex', label: 'Codex', from: 'OpenAI', installed: true, path: '/usr/bin/codex', signed_in: false, activated: false, state: 'installed', version: '0.153.4', latest: '0.154.0', updatable: true, askable: true, update: 'npm install -g @openai/codex@latest', update_available: true },
  ] };
  try {
    const ctx = context();
    const made = surface.createProviderSurface(ctx);
    await made.show(); await settle();
    byClass(made.el, 'sws-stone')[0].click();
    assert.equal(ctx.mounts.length, 1, 'the update session is mounted in the page');
    assert.equal(ctx.mounts[0].session, 'provider_setup_claude_update');
    const step = byClass(made.el, 'setup-provider-step')[0];
    assert.ok(byClass(step, 'setup-provider-terminal')[0], 'in the Install step');
    assert.equal(byClass(step, 'setup-provider-update').length, 0, 'no second Update while one runs');
    assert.match(byClass(step, 'setup-provider-update-note')[0].textContent, /press Close; then Refresh/);
    calls.length = 0;
    byClass(step, 'setup-provider-update-close')[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls[0], 'POST /api/setup/providers/claude/close', 'the same Close as a sign-in ends it');
    byClass(made.el, 'sws-stone')[1].click();
    const geminiStep = byClass(made.el, 'setup-provider-step')[0];
    assert.equal(byClass(geminiStep, 'setup-provider-state')[0].textContent, 'Installed 0.59.0 · up to date · /usr/bin/gemini');
    assert.equal(byClass(geminiStep, 'setup-provider-update').length, 0, 'an up-to-date provider offers no Update control');
    byClass(made.el, 'sws-stone')[2].click();
    const codexStep = byClass(made.el, 'setup-provider-step')[0];
    assert.equal(byClass(codexStep, 'setup-provider-update').length, 0, 'an unauthenticated provider offers no Update control even when a newer version is known');
  } finally {
    machine = saved;
  }
});

test('a sign-in in progress mounts the native tile through the environment, on whichever seat', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show(); await settle();
  byClass(made.el, 'sws-stone')[1].click();
  assert.equal(ctx.mounts.length, 1);
  assert.equal(ctx.mounts[0].session, 'provider_setup_codex');
  assert.equal(ctx.mounts[0].workspace, 'workspace2');
  assert.equal(ctx.mounts[0].provider.id, 'codex');
  assert.ok(byClass(made.el, 'setup-provider-terminal')[0]);
  const labels = byClass(byClass(made.el, 'setup-provider')[0], 'setup-provider-action').map((node) => node.textContent);
  assert.deepEqual(labels, ['Done', 'Close'], 'the card owns only the current step\'s controls; Refresh sits by the dates, outside it');
  // Without a mount in the environment the surface says so rather than failing.
  const bare = surface.createProviderSurface({ ...context(), environment: {} });
  await bare.show(); await settle();
  byClass(bare.el, 'sws-stone')[1].click();
  assert.match(byClass(bare.el, 'setup-provider-terminal')[0].textContent, /terminal attachment is unavailable/);
});

test('a catalog provider no registry CLI serves keeps its catalog section and says it cannot be set up here', async () => {
  const ctx = context();
  const made = surface.createProviderSurface(ctx);
  await made.show(); await settle();
  byClass(made.el, 'sws-stone')[3].click();
  const detail = byClass(made.el, 'sws-detail')[0];
  const [yours, section] = detail.children;
  assert.equal(walk(yours).find((node) => node.tagName === 'H2').textContent, 'Pi');
  assert.match(yours.textContent, /No CLI in Ronin’s registry serves this provider/);
  assert.equal(byClass(yours, 'setup-provider-step').length, 0);
  assert.deepEqual(walk(section).filter((node) => node.tagName === 'TR' && node.dataset.model).map((row) => row.dataset.model), ['pi-1']);
});

test('an unmeasured machine and the owner\'s catalog copy are each said, never guessed — and a shadowed section says so, with its cost', async () => {
  machine = { providers: [] };
  catalog = { ...catalog, origin: 'user', updated: '2026-10-01', withdrawn: [{ provider: 'xai', label: 'xAI' }], providers: [
    { ...catalog.providers[0], origin: 'user', shadowed: true },
    catalog.providers[1],
    { ...catalog.providers[2], origin: 'user', shadowed: false },
  ] };
  const made = surface.createProviderSurface(context());
  await made.show(); await settle();
  const dates = byClass(made.el, 'setup-provider-dates')[0];
  assert.deepEqual(byClass(dates, 'setup-provider-date-list')[0].children.filter((row) => !row.hidden).map((row) => row.children.map((cell) => cell.textContent)), [
    ['Catalog researched', 'Shipped 2026-09-08 · your copy 2026-10-01'],
    ['Machine measured', 'Not measured yet'],
    ['Latest versions checked', 'Not checked yet — press Refresh'],
    ['Withdrawn by your copy', 'xAI'],
  ], 'two layers, two dates, neither borrowed; what the copy withdrew is named');
  assert.equal(surface.providersSummary((await import('../public/js/form-steps.js')).providerCatalog()), '3 providers · 4 models · 0 activated here · catalog updated 2026-09-08 · 2 yours');
  byClass(made.el, 'sws-stone')[0].click();
  const from = byClass(made.el, 'setup-provider-provenance')[0];
  assert.equal(from.dataset.origin, 'user'); assert.equal(from.dataset.shadowed, 'true');
  assert.equal(from.textContent, 'Your copy of this section (updated 2026-10-01) replaces the shipped one (updated 2026-09-08). It stays yours until you take the next shipped update: one edited price forks the whole section.');
  byClass(made.el, 'sws-stone')[2].click();
  assert.equal(byClass(made.el, 'setup-provider-provenance')[0].textContent, 'Yours · not in the shipped catalog (your copy updated 2026-10-01)');
  assert.deepEqual(byClass(made.el, 'sws-stone').map((stone) => stone.attributes['data-provider']), ['anthropic', 'openai', 'pi'], 'with no registry rows every catalog provider is a stone of its own');
});
