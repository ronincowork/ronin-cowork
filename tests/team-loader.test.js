import test from 'node:test';
import assert from 'node:assert/strict';
import { launchTeamAgents, raiseTeam } from '../public/js/team-loader.js';

test('the Team loader launches ordinary rows together and the lead last', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, body: options.json });
    return { ok: true };
  };

  launchTeamAgents(request, 'dinner', [
    { name: 'cook', instructions: 'cook', mandate: { reach: 'execute', recruit: 'open', output: ['an artifact'] }, team_lead: false },
    { name: 'host', instructions: 'host', mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] }, team_lead: true },
    { name: 'music', instructions: 'music', mandate: { reach: 'execute', recruit: 'open', output: ['ideas'] }, team_lead: false },
  ]);

  assert.deepEqual(calls.map((call) => call.body.name), ['cook', 'music', 'host']);
  assert.deepEqual(calls[2].body, {
    session_type: 'cowork_agent', team: 'dinner', team_lead: true,
    name: 'host', instructions: 'host',
    mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] },
  });
});

test('one refused launch does not stop the other rows', async () => {
  const names = [];
  const request = async (_url, options) => {
    names.push(options.json.name);
    return { ok: options.json.name !== 'refused' };
  };
  launchTeamAgents(request, 'dinner', [
    { name: 'refused', instructions: 'one', mandate: {}, team_lead: false },
    { name: 'born', instructions: 'two', mandate: {}, team_lead: false },
  ]);
  assert.deepEqual(names, ['refused', 'born']);
});

test('only a newly-created Team fires its attached rows', async () => {
  let created = false;
  const launches = [];
  const request = async (url, options) => {
    if (url === '/api/team-rosters') {
      if (created) return { ok: false, status: 400 };
      created = true;
      return { ok: true, data: { roster: options.json } };
    }
    launches.push(options.json.name);
    return { ok: true };
  };
  const roster = { name: 'dinner' };
  const rows = [{ name: 'cook', instructions: 'cook', mandate: {}, team_lead: false }];
  assert.equal((await raiseTeam(request, roster, rows)).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await raiseTeam(request, roster, rows)).ok, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(launches, ['cook']);
});
