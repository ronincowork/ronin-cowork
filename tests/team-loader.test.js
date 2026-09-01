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
    { name: 'cook', assignment: 'cook', mandate: { reach: 'execute', recruit: 'open', output: ['an artifact'] }, lead: false },
    { name: 'host', assignment: 'host', mandate: { reach: 'execute', recruit: 'staff agents', output: ['the team'] }, lead: true },
    { name: 'music', assignment: 'music', mandate: { reach: 'execute', recruit: 'open', output: ['ideas'] }, lead: false },
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
    { name: 'refused', assignment: 'one', mandate: {}, lead: false },
    { name: 'born', assignment: 'two', mandate: {}, lead: false },
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
  const rows = [{ name: 'cook', assignment: 'cook', mandate: {}, lead: false }];
  assert.equal((await raiseTeam(request, roster, rows)).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await raiseTeam(request, roster, rows)).ok, false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(launches, ['cook']);
});
