import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class FakeNode {
  constructor(tag = '') { this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this._text = ''; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes.flat().filter(Boolean)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  focus() { this.focused = true; }
  add(node) { this.append(node); }
  click() { if (!this.disabled) for (const callback of this.listeners.click || []) callback({ currentTarget: this }); }
  keydown(key) { if (key === 'Enter' || key === ' ') this.click(); }
  querySelector(selector) {
    const cls = selector.match(/\.([a-z0-9_-]+)$/i)?.[1];
    return this.walk().find((node) => cls && node.className?.split(' ').includes(cls)) || null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-sws-id]') return [...this.walk()].filter((node) => node.dataset.swsId);
    if (selector === '.cv-pill[data-kind]') return [...this.walk()].filter((node) => node.className?.split(' ').includes('cv-pill') && node.dataset.kind);
    return [];
  }
  *walk() { for (const child of this.children) { if (!(child instanceof FakeNode)) continue; yield child; yield* child.walk(); } }
  get options() { return this.children.filter((node) => node.tagName === 'OPTION'); }
  get textContent() { return this._text + this.children.map((node) => node?.textContent || '').join(''); }
  set textContent(value) { this._text = String(value || ''); this.children = []; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeNode(tag), createElementNS: (_ns, tag) => new FakeNode(tag), querySelector: () => null, head: { append() {} } };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const presets = await import('../public/js/presets.js');

test('purpose pills offer three original categories and All Sample Presets as singular choices', () => {
  const host = new FakeNode('div');
  const preference = presets.createKindsPreference(null);
  const row = presets.renderKindPills(host, preference).el;
  const choices = row.children.filter((node) => node.tagName === 'BUTTON');
  assert.deepEqual(choices.map((node) => node.textContent), ['Build software', 'Life Assistants', 'Research and writing', 'All Sample Presets']);
  choices[0].click();
  assert.deepEqual(preference.get(), ['build']);
  assert.deepEqual(choices.map((node) => node.attributes['aria-pressed']), ['true', 'false', 'false', 'false']);
  choices[1].click();
  assert.deepEqual(preference.get(), ['life']);
  assert.deepEqual(choices.map((node) => node.attributes['aria-pressed']), ['false', 'true', 'false', 'false']);
  choices[2].click();
  assert.deepEqual(preference.get(), ['research']);
  assert.deepEqual(choices.map((node) => node.attributes['aria-pressed']), ['false', 'false', 'true', 'false']);
  choices[3].click();
  assert.deepEqual(preference.get(), ['build', 'life', 'research']);
  assert.deepEqual(choices.map((node) => node.attributes['aria-pressed']), ['false', 'false', 'false', 'true']);
});

test('the original category choices need no second Show all control', async () => {
  assert.deepEqual(presets.PRESET_KINDS.map(({ presets: rows }) => rows.length), [4, 3, 3]);
  const source = await readFile(new URL('../public/js/presets.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Show all seven|presets_show_all|sp-more/);
});

test('the house slots are fixed core handles', () => {
  assert.equal(presets.HOUSE_PRESETS.length, 8);
  assert.deepEqual(presets.HOUSE_PRESETS.map((row) => row.handle), [
    'bare_metal', 'ronin_team', 'staff_my_codebase', 'develop_new_project', 'personal_assistant',
    'health_and_fitness', 'morning_brief', 'agent_editable_doc',
  ]);
  assert.ok(presets.HOUSE_PRESETS.every((row) => presets.isCorePreset(row.handle)));
});

test('the approved resting-stone lines are verbatim and every stone has a glyph', () => {
  assert.deepEqual(presets.HOUSE_PRESETS.map(({ handle, description }) => [handle, description]), [
    ['bare_metal', 'Start one to four agents, each in its own tile. Lock and load.'],
    ['ronin_team', 'A Team Lead and two agents, born with the full Ronin team room.'],
    ['staff_my_codebase', 'Point a team at a codebase and get its read on the stack.'],
    ['develop_new_project', 'A lead plus feature agents, each in its own worktree.'],
    ['personal_assistant', 'One assistant that remembers. Alone, or a lead that hires help.'],
    ['health_and_fitness', 'Head coach, nutritionist, race guide. Drop or add roles.'],
    ['morning_brief', 'Grok writes you a briefing on a schedule you set.'],
    ['agent_editable_doc', 'One coding agent beside a document you both edit.'],
  ]);
  assert.deepEqual(presets.HOUSE_PRESETS.map((row) => row.glyph), [
    { rects: [[4, 9, 10, 14], [18, 9, 10, 14]] },
    { text: '人人' },
    { path: 'M5 7h22 M5 13h22 M5 19h22 M5 25h14' },
    { path: 'M8 28V4 M8 12h6c4 0 4-4 10-4h3 M8 20h6c4 0 4 4 10 4h3' },
    { text: '人' },
    { path: 'M3 17h6l3-8 5 14 3-6h9' },
    { path: 'M6 22a10 10 0 0 1 20 0 M2 26h28 M16 5v3 M7 10l2 2 M25 10l-2 2' },
    { rects: [[9, 4, 16, 24]], path: 'M13 12h8 M13 17h8 M13 22h5' },
  ]);
});

test('a non-core replacement receives only universal actions and ordinary launch', () => {
  assert.deepEqual(presets.presetActions('dinner_party'), ['user_message', 'launch']);
  assert.equal(presets.buildLaunchPlan({ handle: 'dinner_party', shelf: 'teams' }, 'Hello', {}).treatment, null);
  assert.equal(presets.seatingPlan('dinner_party', { sessions: [{ name: 'real' }] }), null);
});

test('Bare Metal starts with two default-provider rows and three sessions use four workspaces', () => {
  assert.deepEqual(presets.initialControls('bare_metal', 'codex').sessions, [
    { name: 'session_1', provider: 'codex', model: '' }, { name: 'session_2', provider: 'codex', model: '' },
  ]);
  assert.equal(presets.initialControls('bare_metal').tiles, 2);
  assert.deepEqual(presets.initialControls('ronin_team', 'codex').sessions.map(({ name, team_lead }) => [name, team_lead === true]), [
    ['team_lead', true], ['agent_1', false], ['agent_2', false],
  ]);
  assert.deepEqual([0, 1, 2, 3, 4].map(presets.bareMetalWorkspaceCount), [1, 1, 2, 4, 4]);
});

test('provider cascading preserves explicit row overrides', () => {
  const rows = [{ name: 'one', provider: 'codex' }, { name: 'two', provider: 'claude' }, { name: 'three', provider: '' }];
  assert.deepEqual(presets.cascadeProvider(rows, 'gemini', 'codex').map((row) => row.provider), ['gemini', 'claude', 'gemini']);
});

test('fixed seating uses only returned objects and falls back when none exist', () => {
  assert.equal(presets.seatingPlan('agent_editable_doc', {}), null);
  assert.deepEqual(presets.seatingPlan('agent_editable_doc', { sessions: [{ name: 'brainstorm' }], root: 'ronin_lab', document: 'README.md' }), {
    count: 2,
    seats: [{ workspace: 'workspace1', type: 'session', key: 'brainstorm' }, { workspace: 'workspace2', type: 'document', key: 'README.md', root: 'ronin_lab', path: 'README.md' }],
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

test('blocked detail keeps its controls and summons the concept warning from held Launch', async () => {
  const source = await readFile(new URL('../public/js/presets.js', import.meta.url), 'utf8');
  assert.match(source, /const showHeld = \(\) =>/);
  assert.match(source, /label: 'Launch', kind: 'primary', action: gate\.ready \? launchNow : showHeld/);
  assert.match(source, /launch\.el\.dataset\.held = 'true'/);
  assert.match(source, /A model provider is required before launching a preset\./);
  assert.doesNotMatch(source, /createPresetRequirementState|gate\.targets|mouseenter.*requirement|focus.*requirement/);
  assert.match(source, /el\('button', 'sp-warn', '!'\)/);
  assert.doesNotMatch(source, /headingCopy\.append\([\s\S]*slot\.destination/);
  assert.doesNotMatch(source, /button\.append\([^\n]*slot\.destination/);
});

test('blocked pointer and keyboard Launch only reveal the message and never mutate provider selection', async () => {
  const providerSelector = { selected: 'anthropic', scrollTop: 17, classes: ['wk-card'] };
  const before = JSON.stringify(providerSelector);
  let submissions = 0;
  const environment = {
    presetData: async () => ({
      templates: [],
      runtime: { activated_count: 0, providers: [{ id: 'anthropic', state: 'installed' }], roots: [] },
    }),
    loadPresetSlots: () => null,
    launch: async () => { submissions += 1; return { ok: true }; },
    set setupRequirementState(_value) { throw new Error('retired requirement state was mutated'); },
  };
  const surface = presets.createPresetsSurface({ environment });
  await surface.enter();
  let nodes = [...surface.el.walk()];
  nodes.find((node) => node.tagName === 'BUTTON' && String(node.className).includes('sws-stone')).click();
  nodes = [...surface.el.walk()];
  const launch = nodes.find((node) => node.tagName === 'BUTTON' && node.textContent === 'Launch');
  const warning = nodes.find((node) => String(node.className).includes('sp-warning'));
  assert.ok(launch);
  launch.click();
  assert.equal(warning.hidden, false);
  warning.hidden = true;
  launch.keydown('Enter');
  assert.equal(warning.hidden, false);
  assert.equal(JSON.stringify(providerSelector), before);
  assert.equal(submissions, 0);
});

test('the selected preset entry keeps its message in the framed panel and offers no Customize detour', async () => {
  const calls = [];
  const surface = presets.createPresetsSurface({ environment: {
    presetData: async () => ({
      templates: [],
      runtime: { activated_count: 1, providers: [{ id: 'codex', activated: true }], roots: [] },
    }),
    loadPresetSlots: () => null,
    launch: async () => ({ ok: false }),
    customize: (detail) => calls.push(detail),
  } });
  await surface.enter();
  let nodes = [...surface.el.walk()];
  nodes.filter((node) => node.tagName === 'BUTTON' && String(node.className).includes('sws-stone'))[4].click();
  nodes = [...surface.el.walk()];
  assert.ok(nodes.find((node) => String(node.className).includes('sp-choice-panel')));
  assert.ok(nodes.find((node) => String(node.className).includes('sp-select') && node.textContent === 'select'));
  assert.ok(nodes.find((node) => node.tagName === 'TEXTAREA'));
  const customize = nodes.find((node) => node.tagName === 'BUTTON' && node.textContent === 'Customize this');
  assert.equal(customize, undefined);
  assert.deepEqual(calls, []);
});

test('Bare Metal keeps two real tile layouts, compact rows, separated sections, and one reading size', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../public/js/presets.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/css/launch-forms.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /for \(const count of \[2, 4\]\)/);
  assert.doesNotMatch(source, /Customize this|\[1, 2, 4\]/);
  assert.match(css, /\.sp-choice-panel \{[^}]*font-size: var\(--text-5\)/);
  assert.match(css, /\.sp-select \{[^}]*font-size: inherit/);
  assert.match(css, /\.sp-lead \{[^}]*font-size: inherit/);
  assert.match(css, /\.sp-controls > \.sp-control-label:not\(:first-child\) \{[^}]*margin-top: var\(--space-9\);[^}]*border-top/);
  assert.match(css, /\.sp-rows \{[^}]*gap: var\(--space-2\)/);
});
