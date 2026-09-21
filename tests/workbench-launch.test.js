import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeWorkbenchLaunch, navigateToWorkspaceFolders, openWorkbenchTab, patchWorkspaceViewState, resolveWorkbenchEntry, resolveWorkbenchState, workbenchStateKey } from '../public/js/workspace.js';

test('Workspace Folder navigation preserves Settings and seats the shared surface', () => {
  let written = null;
  let state = null;
  let destination = '';
  const existing = { count: 4, selected: 'workspace1', seats: { workspace1: 'campaign.defaults' }, selectorDensity: 'thick' };
  assert.equal(navigateToWorkspaceFolders({
    id: 'settings',
    param: 'providers',
    viewState: () => existing,
    patchState: (value) => { state = value; },
    patchViewState: (id, value) => { assert.equal(id, 'campaign'); written = value; },
    navigate: (id) => { destination = id; return true; },
  }, { origin: { kind: 'preset', workspace: 'workspace1', preset: 'ronin_team' } }), true);
  assert.equal(destination, 'campaign');
  assert.deepEqual(state, { returnTo: {
    view: 'settings', param: 'providers',
    origin: { kind: 'preset', workspace: 'workspace1', preset: 'ronin_team' },
  } });
  assert.deepEqual(written, {
    count: 4, selected: 'workspace2', selectorDensity: 'thick',
    seats: { workspace1: 'campaign.defaults', workspace2: 'campaign.project-roots' },
  });
});

test('Workbench entry precedence is structured launch, remembered state, then first-open defaults', () => {
  const defaults = { count: 2, selected: 'workspace1', seats: { workspace1: 'default.one', workspace2: 'default.two' } };
  const remembered = { selected: 'workspace2', seats: { workspace1: 'remembered.one' }, density: 'thin' };
  assert.deepEqual(resolveWorkbenchState(remembered, null, defaults), {
    count: 2, selected: 'workspace2', density: 'thin',
    seats: { workspace1: 'remembered.one', workspace2: 'default.two' },
  });
  assert.deepEqual(resolveWorkbenchState(remembered, { mode: 'replace', state: {
    selected: 'workspace1', seats: { workspace1: 'launch.one' },
  } }, defaults), {
    count: 2, selected: 'workspace1', density: 'thin', seats: { workspace1: 'launch.one' },
  });
  assert.deepEqual(resolveWorkbenchState(remembered, { mode: 'overlay', state: {
    seats: { workspace2: 'launch.two' },
  } }, defaults).seats, { workspace1: 'remembered.one', workspace2: 'launch.two' });
});

test('Workbench recall is scoped to canonical destination and tenant', () => {
  assert.equal(workbenchStateKey('campaign', 'ignored'), 'campaign', 'Campaign is one tenant');
  assert.equal(workbenchStateKey('team', 'Commons'), 'team:Commons');
  assert.equal(workbenchStateKey('agent', 'Ada/Lovelace'), 'agent:Ada%2FLovelace');
  const defaults = { count: 2, seats: { workspace1: 'default.self', workspace2: 'default.docs' } };
  let views = { agent: { seats: { workspace1: 'legacy.unscoped' } } };
  views = patchWorkspaceViewState(views, 'agent', 'Ada', { selected: 'workspace2', seats: { workspace1: 'ada.self' } });
  views = patchWorkspaceViewState(views, 'team', 'Commons', { seats: { workspace1: 'commons.roster' } });
  assert.deepEqual(resolveWorkbenchEntry(views, 'agent', 'Ada', null, defaults), {
    count: 2, selected: 'workspace2', seats: { workspace1: 'ada.self', workspace2: 'default.docs' },
  });
  assert.deepEqual(resolveWorkbenchEntry(views, 'agent', 'Bea', null, defaults), defaults,
    'a cloned tab cannot use Ada or legacy unscoped Agent seats for Bea');
  assert.deepEqual(resolveWorkbenchEntry(views, 'team', 'Other', null, defaults), defaults,
    'a Team cannot restore Commons seats');
  assert.deepEqual(resolveWorkbenchEntry(views, 'agent', 'Bea', { mode: 'replace', state: {
    seats: { workspace1: 'chosen.self' },
  } }, defaults), { count: 2, seats: { workspace1: 'chosen.self' } },
  'an explicit launch beats both recall and defaults');
  assert.deepEqual(resolveWorkbenchEntry(views, 'agent', 'Bea', { mode: 'overlay', state: {
    seats: { workspace2: 'chosen.docs' },
  } }, defaults).seats, { workspace1: 'default.self', workspace2: 'chosen.docs' },
  'an overlay for Bea starts from Bea defaults, never Ada seats');
  views = patchWorkspaceViewState(views, 'agent', 'Bea', { seats: { workspace1: 'bea.self' } });
  assert.equal(resolveWorkbenchEntry(views, 'agent', 'Bea', null, defaults).seats.workspace1, 'bea.self',
    'refresh recalls Bea after her first save');
  assert.deepEqual(views['agent:Ada'].seats, { workspace1: 'ada.self' }, 'opening Bea does not rewrite Ada');
});

test('Campaign recall remains singleton while Team and Agent snapshots remain distinct', () => {
  let views = patchWorkspaceViewState({}, 'campaign', '', { seats: { workspace1: 'campaign.defaults' } });
  views = patchWorkspaceViewState(views, 'team', 'Alpha', { seats: { workspace1: 'alpha.member' } });
  views = patchWorkspaceViewState(views, 'team', 'Beta', { seats: { workspace1: 'beta.member' } });
  views = patchWorkspaceViewState(views, 'agent', 'Kai', { seats: { workspace1: 'kai.self' } });
  assert.equal(resolveWorkbenchEntry(views, 'campaign', '', null, {}).seats.workspace1, 'campaign.defaults');
  assert.equal(resolveWorkbenchEntry(views, 'team', 'Alpha', null, {}).seats.workspace1, 'alpha.member');
  assert.equal(resolveWorkbenchEntry(views, 'team', 'Beta', null, {}).seats.workspace1, 'beta.member');
  assert.equal(resolveWorkbenchEntry(views, 'agent', 'Kai', null, {}).seats.workspace1, 'kai.self');
});

test('a structured launch is tab-isolated, claimed once, and absent on refresh', () => {
  const prior = {
    location: globalThis.location, history: globalThis.history, window: globalThis.window,
  };
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/team/source' };
  globalThis.window = { open: (url) => { opened = url; return {}; } };
  globalThis.history = { state: null, replaceState: (_state, _title, url) => { globalThis.location.href = url; } };
  try {
    assert.ok(openWorkbenchTab({ destination: 'campaign', mode: 'replace', state: {
      count: 2, selected: 'workspace1', seats: { workspace1: 'campaign.defaults', workspace2: 'setup.launch-own' },
    } }));
    assert.match(opened, /ronin-launch=/);
    globalThis.location.href = opened;
    assert.deepEqual(consumeWorkbenchLaunch('campaign', ''), { mode: 'replace', state: {
      count: 2, selected: 'workspace1', seats: { workspace1: 'campaign.defaults', workspace2: 'setup.launch-own' },
    } });
    assert.doesNotMatch(globalThis.location.href, /ronin-launch=/);
    assert.equal(consumeWorkbenchLaunch('campaign', ''), null, 'refresh has no instruction to replay');
  } finally {
    globalThis.location = prior.location;
    globalThis.history = prior.history;
    globalThis.window = prior.window;
  }
});

test('a noopener launch keeps its instruction when the browser returns no window proxy', () => {
  const prior = { location: globalThis.location, window: globalThis.window };
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/cowork' };
  globalThis.window = { open: (url) => { opened = url; return null; } };
  try {
    assert.equal(openWorkbenchTab({ destination: 'campaign', state: { seats: { workspace1: 'campaign.defaults' } } }), null);
    assert.match(opened, /ronin-launch=/);
  } finally {
    globalThis.location = prior.location;
    globalThis.window = prior.window;
  }
});

test('a launch instruction cannot be claimed by the wrong destination', () => {
  const prior = { location: globalThis.location, history: globalThis.history, window: globalThis.window };
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/cowork' };
  globalThis.window = { open: (url) => { opened = url; return {}; } };
  globalThis.history = { state: null, replaceState: (_state, _title, url) => { globalThis.location.href = url; } };
  try {
    openWorkbenchTab({ destination: 'team', param: 'gbrain', state: { seats: {} } });
    globalThis.location.href = opened;
    assert.equal(consumeWorkbenchLaunch('team', 'another-team'), null);
  } finally {
    globalThis.location = prior.location;
    globalThis.history = prior.history;
    globalThis.window = prior.window;
  }
});
