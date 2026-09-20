import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeWorkbenchLaunch, navigateToWorkspaceFolders, openWorkbenchTab, resolveWorkbenchState } from '../public/js/workspace.js';

test('Workspace Folder navigation preserves Settings and seats the shared surface', () => {
  let written = null;
  let destination = '';
  const existing = { count: 4, selected: 'workspace1', seats: { workspace1: 'campaign.defaults' }, selectorDensity: 'thick' };
  assert.equal(navigateToWorkspaceFolders({
    viewState: () => existing,
    patchViewState: (id, value) => { assert.equal(id, 'campaign'); written = value; },
    navigate: (id) => { destination = id; return true; },
  }), true);
  assert.equal(destination, 'campaign');
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
