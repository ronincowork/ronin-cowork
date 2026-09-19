import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeWorkbenchLaunch, openWorkbenchTab, resolveWorkbenchState } from '../public/js/workspace.js';

const storage = () => {
  const values = new Map();
  return {
    values,
    api: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
};

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
    location: globalThis.location, history: globalThis.history, localStorage: globalThis.localStorage, window: globalThis.window,
  };
  const store = storage();
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/team/source' };
  globalThis.localStorage = store.api;
  globalThis.window = { open: (url) => { opened = url; return {}; } };
  globalThis.history = { state: null, replaceState: (_state, _title, url) => { globalThis.location.href = url; } };
  try {
    assert.ok(openWorkbenchTab({ destination: 'campaign', mode: 'replace', state: {
      count: 2, selected: 'workspace1', seats: { workspace1: 'campaign.defaults', workspace2: 'setup.launch-own' },
    } }));
    assert.match(opened, /ronin-launch=/);
    assert.equal(store.values.size, 1);
    globalThis.location.href = opened;
    assert.deepEqual(consumeWorkbenchLaunch('campaign', ''), { mode: 'replace', state: {
      count: 2, selected: 'workspace1', seats: { workspace1: 'campaign.defaults', workspace2: 'setup.launch-own' },
    } });
    assert.equal(store.values.size, 0);
    assert.doesNotMatch(globalThis.location.href, /ronin-launch=/);
    assert.equal(consumeWorkbenchLaunch('campaign', ''), null, 'refresh has no instruction to replay');
  } finally {
    globalThis.location = prior.location;
    globalThis.history = prior.history;
    globalThis.localStorage = prior.localStorage;
    globalThis.window = prior.window;
  }
});

test('a launch token cannot be claimed by the wrong destination', () => {
  const prior = { location: globalThis.location, history: globalThis.history, localStorage: globalThis.localStorage, window: globalThis.window };
  const store = storage();
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/cowork' };
  globalThis.localStorage = store.api;
  globalThis.window = { open: (url) => { opened = url; return {}; } };
  globalThis.history = { state: null, replaceState: (_state, _title, url) => { globalThis.location.href = url; } };
  try {
    openWorkbenchTab({ destination: 'team', param: 'gbrain', state: { seats: {} } });
    globalThis.location.href = opened;
    assert.equal(consumeWorkbenchLaunch('team', 'another-team'), null);
    assert.equal(store.values.size, 0);
  } finally {
    globalThis.location = prior.location;
    globalThis.history = prior.history;
    globalThis.localStorage = prior.localStorage;
    globalThis.window = prior.window;
  }
});
