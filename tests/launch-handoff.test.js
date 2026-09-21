import test from 'node:test';
import assert from 'node:assert/strict';
import { launchHandoffSpec, openLaunchHandoff } from '../public/js/launch-handoff.js';

const terminal = (name) => ({ type: 'session.terminal', key: name });

test('a successful no-Team launch replaces an Agent workbench with the newborn selected', () => {
  assert.deepEqual(launchHandoffSpec({ sessions: [{ name: 'ronin' }] }), {
    destination: 'agent', param: 'ronin', mode: 'replace',
    state: {
      count: 2, selected: 'workspace1',
      seats: { workspace1: terminal('ronin'), workspace2: '@empty' },
    },
  });
});

test('a Team launch opens two workspaces for its first two planned Agents', () => {
  assert.deepEqual(launchHandoffSpec({
    team: 'builders',
    sessions: [{ name: 'writer' }, { name: 'lead', team_lead: true }, { name: 'reviewer' }],
  }), {
    destination: 'team', param: 'builders', mode: 'replace',
    state: {
      count: 2, selected: 'workspace1', tabName: '',
      seats: {
        workspace1: terminal('lead'),
        workspace2: terminal('writer'),
      },
    },
  });
});

test('a partial Team result seats only successful unique sessions in launch order', () => {
  assert.deepEqual(launchHandoffSpec({
    team: 'pair', sessions: [{ name: 'first' }, { name: '' }, { name: 'first' }, { name: 'second' }],
  })?.state, {
    count: 2, selected: 'workspace1', tabName: '',
    seats: { workspace1: terminal('first'), workspace2: terminal('second') },
  });
  assert.deepEqual(launchHandoffSpec({ team: 'empty', sessions: [] }), {
    destination: 'team', param: 'empty', mode: 'replace',
    state: {
      count: 2, selected: 'workspace1', tabName: '',
      seats: { workspace1: { type: 'team.commons', tab: 'team-configuration' }, workspace2: 'session.new-agent' },
    },
  });
  assert.deepEqual(launchHandoffSpec({ team: 'solo', sessions: [{ name: 'first' }] })?.state.seats, {
    workspace1: terminal('first'), workspace2: { type: 'team.commons', tab: 'team-configuration' },
  });
});

test('the handoff reuses the tab reserved by the launch click and carries a one-shot instruction', () => {
  const prior = globalThis.location;
  let opened = '';
  globalThis.location = { href: 'https://ronin.test/app#/setup' };
  const reserved = { location: { replace: (url) => { opened = url; } } };
  try {
    assert.equal(openLaunchHandoff({ sessions: [{ name: 'newborn' }] }, reserved), reserved);
    const url = new URL(opened);
    const launch = JSON.parse(url.searchParams.get('ronin-launch'));
    assert.equal(url.hash, '#/agent/newborn');
    assert.deepEqual(launch, launchHandoffSpec({ sessions: [{ name: 'newborn' }] }));
  } finally {
    globalThis.location = prior;
  }
});

test('a blocked popup leaves the complete direct destination available to the browser attempt', () => {
  const prior = { location: globalThis.location, window: globalThis.window };
  let attempted = '';
  globalThis.location = { href: 'https://ronin.test/app#/setup' };
  globalThis.window = { open: (url) => { attempted = url; return null; } };
  try {
    assert.equal(openLaunchHandoff({ sessions: [{ name: 'newborn' }] }), null);
    assert.equal(new URL(attempted).hash, '#/agent/newborn');
    assert.match(attempted, /ronin-launch=/);
  } finally {
    globalThis.location = prior.location;
    globalThis.window = prior.window;
  }
});
