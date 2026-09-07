import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode { constructor() { this.dataset = {}; } append() {} }
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => new FakeNode(), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const presets = await import('../public/js/presets.js');
const { launchPresetPlan } = await import('../public/js/preset-launch.js');
const source = (file) => readFile(new URL(`../public/js/${file}`, import.meta.url), 'utf8');

test('all core handles expose only their ruled specialized controls after the universal shell', () => {
  const expected = {
    bare_metal: ['user_message', 'customize', 'launch', 'sessions'],
    ronin_team: ['user_message', 'customize', 'launch', 'sessions'],
    staff_my_codebase: ['user_message', 'customize', 'launch', 'root'],
    develop_new_project: ['user_message', 'customize', 'launch', 'root', 'features'],
    personal_assistant: ['user_message', 'customize', 'launch', 'assistant_mode', 'specialists'],
    health_and_fitness: ['user_message', 'customize', 'launch', 'roles'],
    morning_brief: ['user_message', 'customize', 'launch', 'schedule', 'roles'],
    agent_editable_doc: ['user_message', 'customize', 'launch', 'root', 'document'],
  };
  for (const [handle, controls] of Object.entries(expected)) {
    assert.deepEqual(presets.presetActions(handle), controls, handle);
  }
  assert.deepEqual(presets.presetActions('ordinary_replacement'), ['user_message', 'customize', 'launch']);
});

test('all initial controls preserve the ruled destinations and teaching choices', () => {
  assert.deepEqual(presets.initialControls('bare_metal', 'codex').sessions.map((row) => row.provider), ['codex', 'codex']);
  assert.deepEqual(presets.initialControls('ronin_team', 'codex').sessions.map((row) => [row.name, row.team_lead === true]), [['team_lead', true], ['agent_1', false], ['agent_2', false]]);
  assert.equal(presets.initialControls('staff_my_codebase').root, 'ronin_project_1');
  assert.deepEqual(presets.initialControls('develop_new_project'), { root: 'ronin_project_1', features: ['frontend', 'backend'] });
  assert.deepEqual(presets.initialControls('personal_assistant'), { assistant_mode: 'single', specialists: '' });
  assert.deepEqual(presets.initialControls('health_and_fitness', 'claude').roles.map((row) => row.name), ['Head Coach', 'Nutritionist', 'Race and Event Guide']);
  assert.ok(presets.initialControls('health_and_fitness').roles.every((row) => row.ask));
  assert.deepEqual(presets.initialControls('morning_brief').roles.map((row) => row.name), ['brief writer', 'reader']);
  assert.equal(presets.initialControls('morning_brief').schedule, 'daily 08:00');
  assert.deepEqual(presets.initialControls('agent_editable_doc'), { root: 'ronin_lab', document: 'README.md' });
});

test('every core seating case uses only real receipt objects and missing objects fall back honestly', () => {
  const cases = {
    bare_metal: { receipt: { sessions: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }, count: 4, types: ['session', 'session', 'session'] },
    ronin_team: { receipt: { sessions: [{ name: 'lead' }, { name: 'a' }, { name: 'b' }] }, count: 4, types: ['session', 'session', 'session'] },
    staff_my_codebase: { receipt: {}, fallback: true },
    develop_new_project: { receipt: { sessions: [{ name: 'lead' }, { name: 'front' }, { name: 'back' }] }, count: 4, types: ['session', 'session', 'session'] },
    personal_assistant: { receipt: { sessions: [{ name: 'assistant' }] }, count: 1, types: ['session'] },
    health_and_fitness: { receipt: { team: 'health', sessions: [{ name: 'head_coach' }, { name: 'nutritionist' }] }, count: 4, types: ['session', 'team.commons', 'session'] },
    morning_brief: { receipt: { team: 'brief', sessions: [{ name: 'grok' }], document: 'brief.md' }, count: 4, types: ['session', 'team.commons', 'document'] },
    agent_editable_doc: { receipt: { sessions: [{ name: 'brainstorm' }], root: 'ronin_lab', document: 'README.md' }, count: 2, types: ['session', 'document'] },
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

test('the integrated Setup/Cowork adapters hand Customize to a new tab and use the ordinary launch routes', async () => {
  const [setup, cowork, launch, workspace, launchView, agentForm, teamForm] = await Promise.all([
    source('setup-view.js'), source('cowork-view.js'), source('preset-launch.js'), source('workspace.js'),
    source('launch-view.js'), source('new-agent.js'), source('new-team-form.js'),
  ]);
  assert.match(setup, /reserveLaunchTab: reserveWorkspaceTab/);
  assert.match(cowork, /reserveLaunchTab: reserveWorkspaceTab/);
  for (const adapter of [setup, cowork]) {
    assert.match(adapter, /customize: \(\{ template, user_message \} = \{\}\) => openWorkspaceStateTab\(ctx, 'launch'/);
    assert.doesNotMatch(adapter, /customize: \(\) => ctx\?\.navigate\('launch'\)/);
  }
  assert.match(workspace, /context\.patchViewState\(view, viewPatch\);[\s\S]*reserveWorkspaceTab\(\);[\s\S]*context\.patchViewState\(view, restore\);[\s\S]*openWorkspaceTab\(view, param, tab\)/);
  assert.match(launchView, /customize\.template\.shelf === 'agents' \? TYPES\.agent : TYPES\.team/);
  assert.match(launchView, /template: customize\.template\.name, prompt: String\(customize\.user_message/);
  assert.match(agentForm, /templateEntryPlan\(\{ currentKind: draft\.kind, kindTouched: draft\.kindTouched, templates, template: detail\.template \}\);[\s\S]*if \(entry\.template\) applyTemplate\(entry\.template\)/);
  assert.match(teamForm, /applyTemplate\(detail\.template\)/);
  assert.match(launch, /request\('\/api\/launch'/);
  assert.match(launch, /request\('\/api\/team-rosters'/);
  assert.match(workspace, /window\.open\(url\.href, '_blank', 'noopener'\)/);
  assert.match(setup, /openLaunchForm: \(\{ kind, seed = \{\} \} = \{\}\) => openLaunchForm\(ctx, \{ kind, seed \}\)/);
  assert.match(setup, /openTemplateLaunchForm: \(\) => openTemplateLaunchForm\(ctx\)/);
  assert.match(cowork, /createDocumentWorkspaceAdapter\(\{ root: detail\.root, path: detail\.path \|\| detail\.key \}\)/);
  assert.match(cowork, /profiles\.define\(WB_PROFILES\.cowork, \[[^\]]*WB_TYPES\.document[^\]]*\]\)/);
  assert.match(cowork, /type: WB_TYPES\.document[^\n]*discover: \(\) => \[\]/);
  assert.doesNotMatch(cowork, /profiles\.define\(WB_PROFILES\.team, \[[^\]]*WB_TYPES\.document/);
  assert.match(cowork, /surfaceIn\(id\) \? snapshot\?\.seats\?\.\[id\] : seats\[id\]\.pool\.active/);
  assert.match(cowork, /const restorationMembers = \(\) => campaign && !team \? unassignedSessions\(\) : membersOfTeam\(team\)/);
  assert.match(cowork, /syncPools\(restorationMembers\(\)\)/);
  const docs = await source('docs.js');
  assert.match(docs, /WorkspacePrimitives\.createSurface\(\{ label:[^\n]*className: 'workspace-document' \}\)/);
});

test('Agent + Editable Doc carries only a registered root and root-relative path into the existing editor seat', () => {
  const plan = presets.seatingPlan('agent_editable_doc', {
    sessions: [{ name: 'brainstorm' }], root: 'ronin_lab', document: 'notes/brief.md',
  });
  assert.deepEqual(plan.seats[1], {
    workspace: 'workspace2', type: 'document', key: 'notes/brief.md', root: 'ronin_lab', path: 'notes/brief.md',
  });
  assert.deepEqual(presets.seatingPlan('agent_editable_doc', {
    sessions: [{ name: 'brainstorm' }], document: '/tmp/unsafe.md',
  }).seats, [{ workspace: 'workspace1', type: 'session', key: 'brainstorm' }]);
});

test('Agent + Editable Doc launch receipt retains the selected registered root for seating', async () => {
  const calls = [];
  const result = await launchPresetPlan({
    template: { shelf: 'agents', name: 'agent_editable_doc' },
    inputs: { root: 'ronin_lab', document: 'notes/brief.md' },
    user_message: 'Work beside me.',
  }, async (url, options) => {
    calls.push({ url, options });
    if (url === '/api/templates/agents') return { ok: true, data: [{ name: 'agent_editable_doc' }] };
    if (url === '/api/launch') return { ok: true, data: { name: 'writer' } };
    return { ok: false, message: `unexpected ${url}` };
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.root, 'ronin_lab');
  assert.equal(result.data.document, 'notes/brief.md');
  assert.deepEqual(calls.map(({ url }) => url), ['/api/templates/agents', '/api/launch']);
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

test('Setup surfaces consume the one runtime contract and do not duplicate Campaign Templates', async () => {
  const text = await source('setup-surfaces.js');
  assert.match(text, /request\('\/api\/setup\/runtime'/);
  assert.match(text, /\/login`/);
  assert.match(text, /\/done`/);
  assert.match(text, /\/close`/);
  assert.match(text, /campaignTemplatesDefinition\(\)/);
  assert.doesNotMatch(text, /mode === 'loaded'|mode === 'make'|\/api\/library/);
});

test('seated Workbench Docs overrides only its own legacy hidden host', async () => {
  const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.home-docs \{\s*display: none;/);
  assert.match(css, /\.workspace-document > \.wk-surface-content > \.home-docs \{\s*display: flex;/);
});
