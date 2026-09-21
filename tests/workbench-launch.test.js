import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { completeWorkbenchRequest, consumeWorkbenchLaunch, navigateToWorkspaceFolders, openWorkbenchTab, openWorkspaceTab, patchWorkbenchTabState, resolveWorkbenchEntry, resolveWorkbenchState, workbenchLaunchUrl } from '../public/js/workspace.js';

test('Workspace Folder navigation opens a complete new Campaign request and remembers its return tab', () => {
  let state = null;
  let destination = '', request = null;
  assert.equal(navigateToWorkspaceFolders({
    id: 'settings',
    param: 'providers',
    tabId: 'a'.repeat(32),
    patchState: (value) => { state = value; },
    navigate: (id, options) => { destination = id; request = options.workbenchRequest; return true; },
  }, { origin: { kind: 'preset', workspace: 'workspace1', preset: 'ronin_team' } }), true);
  assert.equal(destination, 'campaign');
  assert.deepEqual(state, { returnTo: {
    view: 'settings', param: 'providers', tabId: 'a'.repeat(32),
    origin: { kind: 'preset', workspace: 'workspace1', preset: 'ronin_team' },
  } });
  assert.deepEqual(request, { mode: 'replace', state: {
    count: 2, selected: 'workspace2',
    seats: { workspace1: 'campaign.defaults', workspace2: 'campaign.project-roots' },
  } });
});

test('a new open resolves only its request over destination defaults', () => {
  const defaults = { count: 2, selected: 'workspace1', seats: { workspace1: 'default.one', workspace2: 'default.two' } };
  assert.deepEqual(resolveWorkbenchState(null, defaults), defaults);
  assert.deepEqual(resolveWorkbenchState({ mode: 'replace', state: {
    selected: 'workspace2', seats: { workspace1: 'launch.one' },
  } }, defaults), {
    count: 2, selected: 'workspace2', seats: { workspace1: 'launch.one' },
  });
  assert.deepEqual(resolveWorkbenchState({ mode: 'overlay', state: {
    seats: { workspace2: 'launch.two' },
  } }, defaults).seats, { workspace1: 'default.one', workspace2: 'launch.two' });
});

test('request completion cannot omit tenant, count, selection or seat map', () => {
  assert.equal(completeWorkbenchRequest({ destination: 'agent' }), null);
  assert.equal(completeWorkbenchRequest({ destination: 'team', param: '' }), null);
  assert.deepEqual(completeWorkbenchRequest({ destination: 'agent', param: 'Ada', state: {
    count: undefined, selected: undefined, seats: undefined,
  } }), { destination: 'agent', param: 'Ada', mode: 'overlay', state: {
    count: 2, selected: 'workspace1', seats: {},
  } });
});

test('a Workbench tab instance owns tenant, shape, seats, and refresh state together', () => {
  const first = 'a'.repeat(32), second = 'b'.repeat(32);
  const defaults = { count: 2, selected: 'workspace1', seats: { workspace1: 'default.self' } };
  let tabs = patchWorkbenchTabState({}, first, 'agent', 'Ada', {
    count: 4, selected: 'workspace3', seats: { workspace3: 'ada.self' },
  });
  assert.deepEqual(resolveWorkbenchEntry(tabs, first, 'agent', 'Ada', null, defaults), tabs[first].state,
    'refresh restores this instance exactly');
  assert.deepEqual(resolveWorkbenchEntry(tabs, second, 'agent', 'Ada', null, defaults), defaults,
    'another tab for the same Agent starts from its own request, not this shape');
  assert.deepEqual(resolveWorkbenchEntry(tabs, first, 'agent', 'Bea', null, defaults), defaults,
    'a mismatched tenant cannot claim a snapshot');
  assert.deepEqual(resolveWorkbenchEntry(tabs, second, 'agent', 'Bea', { mode: 'overlay', state: {
    count: 4, seats: { workspace2: 'bea.docs' },
  } }, defaults), { count: 4, selected: 'workspace1', seats: {
    workspace1: 'default.self', workspace2: 'bea.docs',
  } }, 'new open overlays only destination defaults');
  tabs = patchWorkbenchTabState(tabs, second, 'agent', 'Bea', { count: 2, seats: { workspace1: 'bea.self' } });
  assert.equal(tabs[first].state.count, 4, 'the other tab remains independent');
  assert.equal(resolveWorkbenchEntry(tabs, second, 'agent', 'Bea', null, defaults).seats.workspace1, 'bea.self');
});

test('Campaign, Team, Setup and Cowork use the same tab-instance snapshot contract', () => {
  let tabs = {};
  for (const [index, destination, param] of [
    [1, 'campaign', ''], [2, 'team', 'Commons'], [3, 'setup', ''], [4, 'cowork', ''],
  ]) tabs = patchWorkbenchTabState(tabs, String(index).repeat(32), destination, param, {
    count: index === 2 ? 4 : 2, seats: { workspace1: destination },
  });
  assert.equal(resolveWorkbenchEntry(tabs, '2'.repeat(32), 'team', 'Commons', null, {}).count, 4);
  assert.deepEqual(resolveWorkbenchEntry(tabs, '5'.repeat(32), 'team', 'Commons', null, { count: 2 }), { count: 2, seats: {} });
  assert.equal(resolveWorkbenchEntry(tabs, '1'.repeat(32), 'campaign', '', null, {}).seats.workspace1, 'campaign');
  assert.equal(resolveWorkbenchEntry(tabs, '3'.repeat(32), 'setup', '', null, {}).seats.workspace1, 'setup');
  assert.equal(resolveWorkbenchEntry(tabs, '4'.repeat(32), 'cowork', '', null, {}).seats.workspace1, 'cowork');
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
    assert.match(new URL(opened).searchParams.get('ronin-tab'), /^[a-f0-9]{32}$/);
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

test('a plain Agent or Team door still makes a fresh request with tenant and shape', () => {
  const prior = { location: globalThis.location, window: globalThis.window };
  const opened = [];
  globalThis.location = { href: 'https://ronin.test/app?ronin-tab=' + 'a'.repeat(32) + '#/cowork' };
  globalThis.window = { open: (url) => { opened.push(url); return {}; } };
  try {
    openWorkspaceTab('agent', 'Ada');
    openWorkspaceTab('team', 'Commons');
    for (const [index, destination, tenant] of [[0, 'agent', 'Ada'], [1, 'team', 'Commons']]) {
      const url = new URL(opened[index]);
      assert.notEqual(url.searchParams.get('ronin-tab'), 'a'.repeat(32));
      assert.equal(url.hash, `#/${destination}/${tenant}`);
      assert.deepEqual(JSON.parse(url.searchParams.get('ronin-launch')), {
        destination, param: tenant, mode: 'overlay', state: { count: 2, selected: 'workspace1', seats: {} },
      });
    }
    assert.notEqual(new URL(opened[0]).searchParams.get('ronin-tab'), new URL(opened[1]).searchParams.get('ronin-tab'));
  } finally {
    globalThis.location = prior.location;
    globalThis.window = prior.window;
  }
});

test('every Workbench destination can receive a complete default open request', () => {
  const prior = globalThis.location;
  globalThis.location = { href: 'https://ronin.test/app#/home' };
  try {
    for (const destination of ['setup', 'campaign', 'cowork', 'team', 'agent', 'launch']) {
      const param = destination === 'team' || destination === 'agent' ? 'tenant-one' : '';
      const url = new URL(workbenchLaunchUrl({ destination, param, mode: 'overlay' }));
      assert.match(url.searchParams.get('ronin-tab'), /^[a-f0-9]{32}$/);
      assert.deepEqual(JSON.parse(url.searchParams.get('ronin-launch')), {
        destination, param, mode: 'overlay', state: { count: 2, selected: 'workspace1', seats: {} },
      });
    }
  } finally {
    globalThis.location = prior;
  }
});

test('Home and header modified-click doors carry Workbench requests in their links', async () => {
  const [home, header, agentForm] = await Promise.all(['campaign-home.js', 'workspace-header.js', 'new-agent.js']
    .map((name) => readFile(new URL(`../public/js/${name}`, import.meta.url), 'utf8')));
  assert.match(home, /card\.href = workbenchLaunchUrl\(\{ destination: route, mode: 'overlay' \}\)/);
  assert.match(header, /coworkers\.href = workbenchLaunchUrl\(\{ destination: 'cowork', mode: 'overlay' \}\)/);
  assert.match(agentForm, /teamDefaultsUrl\?\.\(chosenTeam\(\)\) \|\| workbenchLaunchUrl/);
  assert.match(agentForm, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
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
