import test from 'node:test';
import assert from 'node:assert/strict';
import { launchTeamAgents } from '../public/js/team-loader.js';

test('the Team loader finishes ordinary rows serially and the lead last', async () => {
  const calls = [];
  let inFlight = 0;
  const request = async (url, options) => {
    assert.equal(inFlight, 0, 'a second membership writer must wait for the first');
    inFlight += 1;
    calls.push({ url, body: options.json });
    await Promise.resolve();
    inFlight -= 1;
    return { ok: true };
  };

  const outcomes = await launchTeamAgents(request, 'dinner', [
    { name: 'cook', instructions: 'cook', mandate: { reach: 'execute', recruit: 'open', output: ['an artifact'] }, team_lead: false },
    { name: 'host', instructions: 'host', mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] }, team_lead: true },
    { name: 'music', instructions: 'music', mandate: { reach: 'execute', recruit: 'open', output: ['ideas'] }, team_lead: false, routines_off: ['gbrain'], routines_on: ['ronin_worktrees'] },
  ]);

  assert.deepEqual(calls.map((call) => call.body.name), ['cook', 'music', 'host']);
  assert.equal(outcomes.length, 3);
  assert.deepEqual(calls[2].body, {
    session_type: 'cowork_agent', team: 'dinner', team_lead: true,
    name: 'host', instructions: 'host',
    mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] },
  }, 'a row with no switches of its own sends no routines and inherits the team map');
  assert.deepEqual(calls[1].body.routines, { gbrain: false, ronin_worktrees: true }, 'a row\'s own switches ride as the agent layer');
});

test('one refused launch does not stop the other rows', async () => {
  const names = [];
  const request = async (_url, options) => {
    names.push(options.json.name);
    return { ok: options.json.name !== 'refused' };
  };
  const outcomes = await launchTeamAgents(request, 'dinner', [
    { name: 'refused', instructions: 'one', mandate: {}, team_lead: false },
    { name: 'born', instructions: 'two', mandate: {}, team_lead: false },
  ]);
  assert.deepEqual(names, ['refused', 'born']);
  assert.deepEqual(outcomes.map(({ result }) => result.ok), [false, true]);
});
