import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes.flat().filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  add(node) { this.append(node); }
  click() { if (!this.disabled) for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
  querySelector(selector) {
    const cls = selector.match(/\.([a-z0-9_-]+)$/i)?.[1];
    return this.walk().find((node) => cls && node.className?.split(' ').includes(cls)) || null;
  }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  get options() { return this.children.filter((node) => node.tagName === 'OPTION'); }
  get textContent() { return this._text + this.children.map((node) => node?.textContent || '').join(''); }
  set textContent(value) { this._text = String(value || ''); this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const presets = await import('../public/js/presets.js');

test('the seven house slots are fixed core handles', () => {
  assert.equal(presets.HOUSE_PRESETS.length, 7);
  assert.deepEqual(presets.HOUSE_PRESETS.map((row) => row.handle), [
    'bare_metal', 'staff_my_codebase', 'develop_new_project', 'personal_assistant',
    'health_and_fitness', 'morning_brief', 'agent_editable_doc',
  ]);
  assert.ok(presets.HOUSE_PRESETS.every((row) => presets.isCorePreset(row.handle)));
});

test('a non-core replacement receives only universal actions and ordinary launch', () => {
  assert.deepEqual(presets.presetActions('dinner_party'), ['user_message', 'customize', 'launch']);
  assert.equal(presets.buildLaunchPlan({ handle: 'dinner_party', shelf: 'teams' }, 'Hello', {}).treatment, null);
  assert.equal(presets.seatingPlan('dinner_party', { sessions: [{ name: 'real' }] }), null);
});

test('Bare Metal starts with two default-provider rows and three sessions use four workspaces', () => {
  assert.deepEqual(presets.initialControls('bare_metal', 'codex').sessions, [
    { name: 'session_1', provider: 'codex' }, { name: 'session_2', provider: 'codex' },
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map(presets.bareMetalWorkspaceCount), [1, 1, 2, 4, 4]);
});

test('provider cascading preserves explicit row overrides', () => {
  const rows = [{ name: 'one', provider: 'codex' }, { name: 'two', provider: 'claude' }, { name: 'three', provider: '' }];
  assert.deepEqual(presets.cascadeProvider(rows, 'gemini', 'codex').map((row) => row.provider), ['gemini', 'claude', 'gemini']);
});

test('fixed seating uses only returned objects and falls back when none exist', () => {
  assert.equal(presets.seatingPlan('agent_editable_doc', {}), null);
  assert.deepEqual(presets.seatingPlan('agent_editable_doc', { sessions: [{ name: 'brainstorm' }], document: 'README.md' }), {
    count: 2,
    seats: [{ workspace: 'workspace1', type: 'session', key: 'brainstorm' }, { workspace: 'workspace2', type: 'document', key: 'README.md' }],
  });
});

test('Home Health seats real coach, Wipeboard, and supporting roles', () => {
  assert.deepEqual(presets.seatingPlan('health_and_fitness', {
    team: 'health', sessions: [{ name: 'nutritionist' }, { name: 'head_coach' }, { name: 'race_guide' }],
  }), {
    count: 4,
    seats: [
      { workspace: 'workspace1', type: 'session', key: 'head_coach' },
      { workspace: 'workspace2', type: 'team.commons', key: 'health', tab: 'wipeboard' },
      { workspace: 'workspace3', type: 'session', key: 'nutritionist' },
      { workspace: 'workspace4', type: 'session', key: 'race_guide' },
    ],
  });
});

test('every preset gates on a provider and named presets add their dependencies', () => {
  for (const row of presets.HOUSE_PRESETS) {
    assert.equal(presets.presetReadiness(row.handle, { activated_count: 0 }).surface, 'setup.providers');
  }
  assert.equal(presets.presetReadiness('bare_metal', { activated_count: 1 }).ready, true);
  assert.equal(presets.presetReadiness('personal_assistant', { activated_count: 1, gbrain: { active: false } }).surface, 'setup.gbrain');
  assert.equal(presets.presetReadiness('personal_assistant', { activated_count: 1, gbrain: { active: true } }).ready, true);
  assert.equal(presets.presetReadiness('morning_brief', { activated_count: 1, services: { active: false } }).surface, 'setup.services');
  assert.equal(presets.presetReadiness('morning_brief', { activated_count: 1, services: { active: true } }).ready, true);
});

test('requirement targets use the first activatable provider and never invent an id', () => {
  const runtime = {
    activated_count: 0,
    providers: [
      { id: 'blocked', state: 'absent', blocked: 'Install this provider yourself.' },
      { id: 'claude', state: 'installable', installable: true },
      { id: 'codex', state: 'installed', installed: true },
    ],
    gbrain: { active: false },
  };
  assert.deepEqual(presets.presetRequirementTargets('bare_metal', runtime), [
    'setup.providers', 'setup.provider:claude',
  ]);
  assert.deepEqual(presets.presetRequirementTargets('personal_assistant', runtime), [
    'setup.providers', 'setup.provider:claude', 'setup.gbrain',
  ]);
  assert.deepEqual(presets.presetRequirementTargets('bare_metal', {
    activated_count: 0,
    providers: [{ id: 'codex', state: 'absent', blocked: 'Unavailable here.' }],
  }), ['setup.providers']);
  assert.deepEqual(presets.presetRequirementTargets('bare_metal', { activated_count: 0 }), ['setup.providers']);
});

test('hover and keyboard focus share preview state while open marks persist', () => {
  const emitted = [];
  const state = presets.createPresetRequirementState((next) => emitted.push(next));
  const targets = ['setup.providers', 'setup.provider:claude', 'setup.provider:claude'];
  assert.deepEqual(state.preview(targets).hovered, ['setup.providers', 'setup.provider:claude']);
  assert.deepEqual(state.select(targets), {
    hovered: [],
    open: ['setup.providers', 'setup.provider:claude'],
    flash: ['setup.providers', 'setup.provider:claude'],
    flashCycle: 1,
  });
  state.preview(['setup.gbrain']);
  const afterBlur = state.clearPreview();
  assert.deepEqual(afterBlur.hovered, []);
  assert.deepEqual(afterBlur.open, ['setup.providers', 'setup.provider:claude']);
  assert.equal(emitted.length, 4);
});

test('each blocked selection increments flashCycle and ready selection clears marking', () => {
  const state = presets.createPresetRequirementState();
  assert.equal(state.select(['setup.gbrain']).flashCycle, 1);
  assert.deepEqual(state.syncOpen(['setup.gbrain']).open, ['setup.gbrain']);
  assert.equal(state.select(['setup.gbrain']).flashCycle, 2);
  assert.deepEqual(state.select([]), { hovered: [], open: [], flash: [], flashCycle: 2 });
});

test('blocked detail retains ordinary controls and a native held Launch contract', async () => {
  const source = await readFile(new URL('../public/js/presets.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /detail\.append\(blocked\);\s*return/);
  assert.match(source, /label: 'Launch', kind: 'primary', disabled: !gate\.ready/);
  assert.match(source, /gate\.ready \? \{ action: launchNow \} : \{\}/);
  assert.match(source, /actions\.append\(el\('span', 'sp-held', 'Held'\)\)/);
  assert.match(source, /headingCopy\.append\([\s\S]*slot\.destination/);
  assert.doesNotMatch(source, /button\.append\([^\n]*slot\.destination/);
});

test('Customize calls only its adapter with exact template and User Message', async () => {
  const customizations = [];
  let launches = 0;
  const surface = presets.createPresetsSurface({ environment: {
    presetData: async () => ({
      templates: [],
      runtime: { activated_count: 1, providers: [{ id: 'codex', activated: true }], roots: [] },
    }),
    loadPresetSlots: () => null,
    customize: (payload) => customizations.push(payload),
    launch: async () => { launches += 1; return { ok: false }; },
  } });
  await surface.enter();
  const nodes = [...surface.el.walk()];
  const message = nodes.find((node) => node.tagName === 'TEXTAREA');
  const customize = nodes.find((node) => node.tagName === 'BUTTON' && node.textContent === 'Customize');
  message.value = 'Keep the caller honest';
  customize.click();
  assert.equal(launches, 0);
  assert.deepEqual(customizations, [{
    template: { shelf: 'teams', name: 'bare_metal' },
    workspace: 'workspace2',
    user_message: 'Keep the caller honest',
  }]);
});
