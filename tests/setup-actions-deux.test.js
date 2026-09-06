import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode { constructor() { this.dataset = {}; } append() {} }
globalThis.Element = FakeNode;
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => new FakeNode(), querySelector: () => null, head: { append() {} } };
globalThis.location = { href: 'https://ronin.test/#/setup', hash: '#/setup' };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const { openLaunchForm, openTemplateLaunchForm } = await import('../public/js/workspace.js');
const { launchEntryPlan } = await import('../public/js/launch-view.js');
const { templateEntryPlan } = await import('../public/js/new-agent.js');
const { presetLaunchUrl } = await import('../public/js/preset-launch.js');
const { teamWorkspaceState } = await import('../public/js/workspace-contract.js');

function harness(blocked = false) {
  const state = { launch: { seats: { workspace4: 'launch.help' }, untouched: { exact: true } } };
  const before = JSON.stringify(state);
  const cloned = [];
  let tabs = 0;
  globalThis.window = {
    open: () => {
      tabs += 1;
      cloned.push(structuredClone(state));
      return blocked ? null : { opener: {}, location: { replace(url) { this.url = url; } } };
    },
  };
  const context = {
    viewState: (view) => state[view],
    patchViewState: (view, patch) => { state[view] = { ...state[view], ...patch }; },
  };
  return { state, before, cloned, context, tabs: () => tabs };
}

for (const [kind, type] of [['agent', 'launch.agent'], ['team', 'launch.team']]) {
  test(`Launch-your-own ${kind} opens one tab, preserves source state, and seats the existing form`, () => {
    const h = harness();
    const tab = openLaunchForm(h.context, { kind, seed: {} });
    assert.ok(tab);
    assert.equal(h.tabs(), 1);
    assert.equal(JSON.stringify(h.state), h.before);
    const plan = launchEntryPlan(h.cloned[0].launch);
    assert.equal(plan.kind, kind);
    assert.deepEqual(plan.placements, [{ workspace: 'workspace1', type, detail: {} }]);
    assert.deepEqual(plan.clear, ['preload']);
  });
}

test('Template opens both existing template-bearing forms with no invented handle', () => {
  const h = harness();
  assert.ok(openTemplateLaunchForm(h.context));
  assert.equal(h.tabs(), 1);
  assert.equal(JSON.stringify(h.state), h.before);
  assert.deepEqual(launchEntryPlan(h.cloned[0].launch).placements, [
    { workspace: 'workspace1', type: 'launch.agent', detail: {} },
    { workspace: 'workspace2', type: 'launch.team', detail: {} },
  ]);
});

test('popup blocking returns null and still restores the source byte-for-byte', () => {
  const h = harness(true);
  assert.equal(openLaunchForm(h.context, { kind: 'agent', seed: {} }), null);
  assert.equal(h.tabs(), 1);
  assert.equal(JSON.stringify(h.state), h.before);
});

test('Customize has explicit precedence and generic preload remains one-shot', () => {
  const customize = { template: { shelf: 'teams', name: 'health_and_fitness' }, user_message: 'Help.' };
  const plan = launchEntryPlan({ customize, preload: { kind: 'agent', seed: {} } });
  assert.equal(plan.kind, 'customize');
  assert.deepEqual(plan.clear, ['customize']);
  assert.deepEqual(plan.placements, [{
    workspace: 'workspace1', type: 'launch.team', detail: { template: 'health_and_fitness', prompt: 'Help.' },
  }]);
  assert.deepEqual(launchEntryPlan({ preload: { kind: 'agent', seed: {} } }).clear, ['preload']);
});

test('door adapters make zero launch or Team-roster submissions', () => {
  const h = harness();
  const beforeFetch = globalThis.fetch;
  let submissions = 0;
  globalThis.fetch = async () => { submissions += 1; throw new Error('must not submit'); };
  try {
    openLaunchForm(h.context, { kind: 'agent', seed: {} });
    openLaunchForm(h.context, { kind: 'team', seed: {} });
    openTemplateLaunchForm(h.context);
    assert.equal(submissions, 0);
  } finally { globalThis.fetch = beforeFetch; }
});

test('Customize preload retains non-coding and coding templates through their declared kinds', () => {
  const personal = { name: 'personal_assistant', kinds: ['work', 'personal', 'household', 'social'] };
  const coding = { name: 'staff_my_codebase', kinds: ['coding', 'work'] };
  assert.deepEqual(templateEntryPlan({ currentKind: 'coding', templates: [personal, coding], template: personal.name }), { kind: 'work', template: personal.name });
  assert.deepEqual(templateEntryPlan({ currentKind: 'coding', templates: [personal, coding], template: coding.name }), { kind: 'coding', template: coding.name });
});

test('Customize preload falls back honestly for missing templates and preserves a touched kind', () => {
  const personal = { name: 'personal_assistant', kinds: ['work', 'personal'] };
  assert.deepEqual(templateEntryPlan({ currentKind: 'coding', templates: [personal], template: 'missing' }), { kind: 'coding', template: '' });
  assert.deepEqual(templateEntryPlan({ currentKind: 'coding', kindTouched: true, templates: [personal], template: personal.name }), { kind: 'coding', template: '' });
});

test('a reserved launch tab receives exact Cowork seating without changing source state', () => {
  const source = JSON.stringify({ version: 3, views: { cowork: { untouched: true } } });
  let destination = source;
  const tab = { sessionStorage: { getItem: () => destination, setItem: (_key, value) => { destination = value; } } };
  const plan = { count: 2, seats: [
    { workspace: 'workspace1', type: 'session', key: 'doc_agent' },
    { workspace: 'workspace2', type: 'document', key: 'README.md', root: 'ronin_lab', path: 'README.md' },
  ] };
  const url = presetLaunchUrl({ urlView: 'cowork' }, plan, tab);
  assert.match(url, /#\/cowork$/);
  assert.equal(source, JSON.stringify({ version: 3, views: { cowork: { untouched: true } } }));
  const stored = JSON.parse(destination).views.cowork;
  assert.deepEqual(stored, { untouched: true, count: 2, seats: {
    workspace1: 'doc_agent', workspace2: { type: 'document', key: 'README.md', root: 'ronin_lab', path: 'README.md' },
  } });
  assert.deepEqual(teamWorkspaceState({}, stored).seats, stored.seats);
});

test('blocked popup and destination storage failure leave seating transport harmless', () => {
  const plan = { count: 1, seats: [{ workspace: 'workspace1', type: 'session', key: 'agent' }] };
  assert.doesNotThrow(() => presetLaunchUrl({ urlView: 'cowork' }, plan, null));
  const denied = { sessionStorage: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } } };
  assert.doesNotThrow(() => presetLaunchUrl({ urlView: 'cowork' }, plan, denied));
});
