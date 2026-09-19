import test from 'node:test';
import assert from 'node:assert/strict';

class FakeNode { constructor() { this.dataset = {}; } append() {} }
globalThis.Element = FakeNode;
globalThis.Node = FakeNode;
globalThis.document = { createElement: () => new FakeNode(), querySelector: () => null, head: { append() {} } };
globalThis.location = { href: 'https://ronin.test/#/setup', hash: '#/setup' };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };

const { openWorkbenchTab } = await import('../public/js/workspace.js');
const { templateEntryPlan } = await import('../public/js/new-agent.js');
const { presetLaunchUrl } = await import('../public/js/preset-launch.js');
const { DISMISSED_WORKSPACE, normalizeWorkbenchState, workspaceMaySeedDefault } = await import('../public/js/workspace-contract.js');

function harness(blocked = false) {
  const state = { launch: { seats: { workspace4: 'launch.help' }, untouched: { exact: true } } };
  const before = JSON.stringify(state);
  let tabs = 0, opened = '';
  globalThis.window = {
    open: (url) => {
      tabs += 1;
      opened = url;
      return blocked ? null : { opener: {}, location: { replace(url) { this.url = url; } } };
    },
  };
  const context = {
    viewState: (view) => state[view],
    patchViewState: (view, patch) => { state[view] = { ...state[view], ...patch }; },
  };
  return { state, before, context, tabs: () => tabs, opened: () => opened };
}

const launchFrom = (url) => JSON.parse(new URL(url).searchParams.get('ronin-launch'));

for (const [kind, type] of [['agent', 'launch.agent'], ['team', 'launch.team']]) {
  test(`Launch-your-own ${kind} opens one tab, preserves source state, and seats the existing form`, () => {
    const h = harness();
    const tab = openWorkbenchTab({ destination: 'launch', param: kind, mode: 'overlay', state: {
      selected: 'workspace1', seats: { workspace1: { type, detail: {} } },
    } });
    assert.ok(tab);
    assert.equal(h.tabs(), 1);
    assert.equal(JSON.stringify(h.state), h.before);
    const payload = launchFrom(h.opened());
    assert.deepEqual(payload.state, { selected: 'workspace1', seats: { workspace1: { type, detail: {} } } });
  });
}

test('a null window proxy leaves source state untouched and the destination URL complete', () => {
  const h = harness(true);
  assert.equal(openWorkbenchTab({ destination: 'launch', param: 'agent', mode: 'overlay', state: { seats: {} } }), null);
  assert.equal(h.tabs(), 1);
  assert.equal(JSON.stringify(h.state), h.before);
  assert.equal(launchFrom(h.opened()).destination, 'launch');
});

test('door adapters make zero launch or Team-roster submissions', () => {
  const h = harness();
  const beforeFetch = globalThis.fetch;
  let submissions = 0;
  globalThis.fetch = async () => { submissions += 1; throw new Error('must not submit'); };
  try {
    openWorkbenchTab({ destination: 'launch', param: 'agent', state: {} });
    openWorkbenchTab({ destination: 'launch', param: 'team', state: {} });
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

test('a preset launch carries exact Cowork seating without changing source state', () => {
  const source = JSON.stringify({ version: 3, views: { cowork: { untouched: true } } });
  const plan = { count: 2, seats: [
    { workspace: 'workspace1', type: 'session', key: 'doc_agent' },
    { workspace: 'workspace2', type: 'document', key: 'README.md', root: 'ronin_lab', path: 'README.md' },
  ] };
  const url = presetLaunchUrl({ urlView: 'cowork' }, plan);
  assert.match(url, /ronin-launch=/);
  assert.match(url, /#\/cowork$/);
  assert.equal(source, JSON.stringify({ version: 3, views: { cowork: { untouched: true } } }));
  const stored = launchFrom(url).state;
  assert.deepEqual(stored, { count: 2, seats: {
    workspace1: 'doc_agent', workspace2: { type: 'document', key: 'README.md', root: 'ronin_lab', path: 'README.md' },
  } });
  assert.deepEqual(normalizeWorkbenchState(stored).seats, stored.seats);
});

test('an explicitly dismissed workspace stays blank while an uninitialized seat may seed its default', () => {
  const restored = normalizeWorkbenchState({ seats: { workspace1: DISMISSED_WORKSPACE } });
  assert.equal(restored.seats.workspace1, DISMISSED_WORKSPACE);
  assert.equal(workspaceMaySeedDefault(restored.seats.workspace1), false);
  assert.equal('workspace2' in restored.seats, false);
  assert.equal(workspaceMaySeedDefault(restored.seats.workspace2), true);
});

test('structured launch URLs do not depend on browser storage', () => {
  const plan = { count: 1, seats: [{ workspace: 'workspace1', type: 'session', key: 'agent' }] };
  globalThis.localStorage = { setItem() { throw new Error('denied'); } };
  const url = presetLaunchUrl({ urlView: 'cowork' }, plan);
  assert.equal(launchFrom(url).state.seats.workspace1, 'agent');
});
