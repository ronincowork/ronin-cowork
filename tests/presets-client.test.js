import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode { constructor() { this.dataset = {}; } append() {} }
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => new FakeNode(), querySelector: () => null, head: { append() {} } };
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
