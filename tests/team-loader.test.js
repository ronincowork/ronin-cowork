import test from 'node:test';
import assert from 'node:assert/strict';
import { launchTeamAgents } from '../public/js/team-loader.js';

test('the Team loader finishes rows serially without hidden cascade fields', async () => {
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
    { name: 'cook', instructions: 'cook', mandate: { reach: 'execute', recruit: 'open', output: ['an artifact'] }, provider: 'openai', model: 'gpt-5' },
    { name: 'host', instructions: 'host', mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] } },
    { name: 'music', instructions: 'music', mandate: { reach: 'execute', recruit: 'open', output: ['ideas'] } },
  ]);

  assert.deepEqual(calls.map((call) => call.body.name), ['cook', 'host', 'music']);
  assert.deepEqual(calls[0].body, {
    session_type: 'cowork_agent', team: 'dinner', team_lead: false,
    name: 'cook', instructions: 'cook',
    mandate: { reach: 'execute', recruit: 'open', output: ['an artifact'] },
    provider: 'openai', model: 'gpt-5',
  }, 'the confirmed Agent mandate and model choice reach /api/launch');
  assert.equal(outcomes.length, 3);
  assert.deepEqual(calls[1].body, {
    session_type: 'cowork_agent', team: 'dinner', team_lead: false,
    name: 'host', instructions: 'host',
    mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] },
  }, 'a row carries only its ordinary launch answers');
  assert.equal('routines' in calls[2].body, false);
});

test('one refused launch does not stop the other rows', async () => {
  const names = [];
  const request = async (_url, options) => {
    names.push(options.json.name);
    return { ok: options.json.name !== 'refused' };
  };
  const outcomes = await launchTeamAgents(request, 'dinner', [
    { name: 'refused', instructions: 'one', mandate: {} },
    { name: 'born', instructions: 'two', mandate: {} },
  ]);
  assert.deepEqual(names, ['refused', 'born']);
  assert.deepEqual(outcomes.map(({ result }) => result.ok), [false, true]);
});

test('multiple marked rows remain team leads and launch after ordinary rows', async () => {
  const calls = [];
  const request = async (_url, options) => { calls.push(options.json); return { ok: true }; };
  await launchTeamAgents(request, 'dinner', [
    { name: 'first_lead', team_lead: true, instructions: 'lead', mandate: {} },
    { name: 'member', team_lead: false, instructions: 'work', mandate: {} },
    { name: 'second_lead', team_lead: true, instructions: 'lead too', mandate: {} },
  ]);
  assert.deepEqual(calls.map(({ name, team_lead }) => [name, team_lead]), [
    ['member', false], ['first_lead', true], ['second_lead', true],
  ]);
});

test('a bare-metal row is placement, not birth material', async () => {
  const calls = [];
  const request = async (url, options) => { calls.push({ url, body: options.json }); return { ok: true }; };
  await launchTeamAgents(request, 'metal', [
    { session_type: 'bare_metal_agent', name: 'one', project_root: 'ronin_lab', instructions: 'Go.', provider: 'anthropic', model: 'opus' },
    { name: 'agent', instructions: 'work', mandate: { reach: 'execute', recruit: 'nobody', output: ['open'] } },
  ]);
  assert.deepEqual(calls[0].body, { session_type: 'bare_metal_agent', team: 'metal', name: 'one', project_root: 'ronin_lab', instructions: 'Go.', provider: 'anthropic', model: 'opus' });
  assert.equal(calls[1].body.session_type, 'cowork_agent');
});
