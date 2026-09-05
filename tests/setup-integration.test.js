import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode { constructor() { this.dataset = {}; } append() {} }
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => new FakeNode(), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const presets = await import('../public/js/presets.js');
const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('all seven core handles expose only their ruled specialized controls after the universal shell', () => {
  const expected = {
    bare_metal: ['user_message', 'customize', 'launch', 'sessions'],
    staff_my_codebase: ['user_message', 'customize', 'launch', 'root'],
    develop_new_project: ['user_message', 'customize', 'launch', 'root', 'features'],
    personal_assistant: ['user_message', 'customize', 'launch', 'assistant_mode', 'specialists'],
    health_and_fitness: ['user_message', 'customize', 'launch', 'roles'],
    morning_brief: ['user_message', 'customize', 'launch', 'grok', 'schedule', 'delivery', 'active'],
    agent_editable_doc: ['user_message', 'customize', 'launch', 'root', 'document'],
  };
  for (const [handle, controls] of Object.entries(expected)) {
    assert.deepEqual(presets.presetActions(handle), controls, handle);
  }
  assert.deepEqual(presets.presetActions('ordinary_replacement'), ['user_message', 'customize', 'launch']);
});

test('all seven initial controls preserve the ruled destinations and teaching choices', () => {
  assert.deepEqual(presets.initialControls('bare_metal', 'codex').sessions.map((row) => row.provider), ['codex', 'codex']);
  assert.equal(presets.initialControls('staff_my_codebase').root, 'ronin_project_1');
  assert.deepEqual(presets.initialControls('develop_new_project'), { root: 'ronin_project_1', features: ['frontend', 'backend'] });
  assert.deepEqual(presets.initialControls('personal_assistant'), { assistant_mode: 'single', specialists: '' });
  assert.deepEqual(presets.initialControls('health_and_fitness', 'claude').roles.map((row) => row.name), ['head_coach', 'nutritionist', 'race_and_event_guide']);
  assert.deepEqual(presets.initialControls('morning_brief'), { grok: 'grok', schedule: 'every day at 8am', delivery: 'team lead', active: true });
  assert.deepEqual(presets.initialControls('agent_editable_doc'), { root: 'ronin_lab', document: 'README.md' });
});

test('every core seating case uses only real receipt objects and missing objects fall back honestly', () => {
  const cases = {
    bare_metal: { receipt: { sessions: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, count: 4, types: ['session', 'session', 'session'] },
    staff_my_codebase: { receipt: {}, fallback: true },
    develop_new_project: { receipt: { sessions: [{ name: 'lead' }, { name: 'front' }, { name: 'back' }] }, count: 4, types: ['session', 'session', 'session'] },
    personal_assistant: { receipt: { sessions: [{ name: 'assistant' }] }, count: 1, types: ['session'] },
    health_and_fitness: { receipt: { team: 'health', sessions: [{ name: 'head_coach' }, { name: 'nutritionist' }] }, count: 4, types: ['session', 'team.commons', 'session'] },
    morning_brief: { receipt: { team: 'brief', sessions: [{ name: 'grok' }], document: 'brief.md' }, count: 4, types: ['session', 'team.commons', 'document'] },
    agent_editable_doc: { receipt: { sessions: [{ name: 'brainstorm' }], document: 'README.md' }, count: 2, types: ['session', 'document'] },
  };
  for (const [handle, row] of Object.entries(cases)) {
    const plan = presets.seatingPlan(handle, row.receipt);
    if (row.fallback) assert.equal(plan, null, handle);
    else {
      assert.equal(plan.count, row.count, handle);
      assert.deepEqual(plan.seats.map((seat) => seat.type), row.types, handle);
      assert.ok(plan.seats.every((seat) => seat.key), `${handle} manufactured an empty seat`);
    }
  }
  assert.equal(presets.seatingPlan('ordinary_replacement', { sessions: [{ name: 'real' }] }), null);
});

test('the integrated Setup/Cowork adapters reserve a new tab and use the ordinary launch routes', async () => {
  const [setup, cowork, launch, workspace] = await Promise.all([
    source('setup-view.js'), source('cowork-view.js'), source('preset-launch.js'), source('workspace.js'),
  ]);
  assert.match(setup, /reserveLaunchTab: reserveWorkspaceTab/);
  assert.match(cowork, /reserveLaunchTab: reserveWorkspaceTab/);
  assert.match(launch, /request\('\/api\/launch'/);
  assert.match(launch, /request\('\/api\/team-rosters'/);
  assert.match(workspace, /window\.open\(url\.href, '_blank', 'noopener'\)/);
});

test('all inventoried launch families use the shared launch marker and no Team Roster torii', async () => {
  const files = await Promise.all([
    source('new-agent.js'), source('new-team-form.js'), source('add-agent.js'),
    source('team-roster-surface.js'), source('cowork-view.js'), source('presets.js'),
  ]);
  for (const text of files.slice(0, 5)) assert.match(text, /launch: true/);
  assert.match(files[5], /label: 'Launch'/);
  assert.doesNotMatch(files[3], /'torii', '⛩'/);
});

test('Setup surfaces consume the one runtime contract and keep local template modes ungated', async () => {
  const text = await source('setup-surfaces.js');
  assert.match(text, /request\('\/api\/setup\/runtime'/);
  assert.match(text, /\/login`/);
  assert.match(text, /\/done`/);
  assert.match(text, /\/close`/);
  assert.match(text, /mode === 'loaded'/);
  assert.match(text, /mode === 'make'/);
  assert.match(text, /else if \(!entitled\)/);
  assert.match(text, /mode === 'library'/);
});
