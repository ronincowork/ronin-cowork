import test from 'node:test';
import assert from 'node:assert/strict';
import { launchPresetPlan } from '../public/js/preset-launch.js';

const responder = (template, calls) => async (url, options = {}) => {
  calls.push({ url, body: options.json });
  if (url.startsWith('/api/templates/')) return { ok: true, data: [template] };
  if (url === '/api/session-launch-specs') return { ok: true, data: [
    { provider: 'anthropic', model: 'opus', cmd: 'claude --model opus' }, { provider: 'openai', model: 'gpt-5.6-sol', cmd: 'codex --model gpt-5.6-sol' }, { provider: 'google', model: 'gemini-3', cmd: 'gemini --model gemini-3' },
  ] };
  if (url === '/api/team-rosters') return { ok: true, data: options.json };
  if (url === '/api/launch') return { ok: true, data: { name: options.json.name, receipt: { project_root: options.json.project_root, work_locations: [{ worktree: `/desk/${options.json.name}` }] } } };
  if (url === '/api/setup/morning-brief/schedules') return { ok: true, data: { schedule: { team: options.json.team, job: { id: 'job-1', ...options.json } } } };
  throw new Error(`unexpected ${url}`);
};

test('Personal Assistant faithfully launches its two approved shapes', async () => {
  for (const [mode, recruit, view] of [['single', null, 'cowork'], ['recruit', 'staff agents', 'team']]) {
    const calls = [], send = responder({ name: 'personal_assistant', label: 'Personal Assistant', brief: 'Help.' }, calls);
    const result = await launchPresetPlan({ template: { shelf: 'agents', name: 'personal_assistant' }, inputs: { assistant_mode: mode, specialists: 'research' } }, send);
    assert.equal(result.ok, true); assert.equal(result.data.urlView, view);
    const birth = calls.find((row) => row.url === '/api/launch');
    if (recruit) assert.equal(birth.body.mandate.recruit, recruit);
    else assert.equal(calls.some((row) => row.url === '/api/team-rosters'), false);
  }
});

test('Morning Brief creates a real schedule and returns its receipt', async () => {
  const calls = [], send = responder({ name: 'morning_brief', label: 'Morning Brief', objective: 'Brief.', agents: [{ name: 'writer' }] }, calls);
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'morning_brief' }, user_message: 'News', inputs: { schedule: 'weekdays 08:00' } }, send);
  const call = calls.find((row) => row.url === '/api/setup/morning-brief/schedules');
  assert.deepEqual(call.body, { team: call.body.team, request: "Run the configured Morning Brief team and publish today's briefing.", when: 'weekdays 08:00' });
  assert.equal(result.data.schedule.job.id, 'job-1');
});

test('Develop Project retains every ordinary launch receipt and work location', async () => {
  const calls = [], send = responder({ name: 'develop_new_project', label: 'Develop', agents: [] }, calls);
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'develop_new_project' }, inputs: { root: 'ronin_project_1', features: ['frontend', 'backend'] } }, send);
  assert.equal(result.data.receipts.length, 2);
  assert.ok(result.data.receipts.every((receipt) => receipt.project_root === 'ronin_project_1' && receipt.work_locations.length === 1));
});

test('Ronin Team launches a real lead and two agents with chosen provider and model', async () => {
  const calls = [], send = responder({ name: 'ronin_team', label: 'Ronin Team', agents: [] }, calls);
  const sessions = [
    { name: 'team_lead', team_lead: true, provider: 'codex', model: 'gpt-5.6-sol' },
    { name: 'agent_1', provider: 'claude', model: 'opus' },
    { name: 'agent_2', provider: 'gemini', model: 'gemini-3' },
  ];
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'ronin_team' }, inputs: { sessions } }, send);
  assert.equal(result.ok, true);
  const births = calls.filter((row) => row.url === '/api/launch');
  assert.equal(births.length, 3);
  assert.deepEqual(births.map(({ body }) => [body.team_lead, body.provider, body.model]), [
    [true, 'openai', 'gpt-5.6-sol'], [false, 'anthropic', 'opus'], [false, 'google', 'gemini-3'],
  ]);
});

test('a row names the agent and the launch names the table provider', async () => {
  const { launchProviderKey } = await import('../public/js/preset-launch.js');
  const specs = [{ provider: 'anthropic', model: 'opus', cmd: 'claude --model opus' }, { provider: 'openai', model: 'gpt-5.6-sol', cmd: 'codex --model gpt-5.6-sol' }];
  assert.equal(launchProviderKey(specs, 'claude'), 'anthropic');
  assert.equal(launchProviderKey(specs, 'codex'), 'openai');
  assert.equal(launchProviderKey(specs, 'anthropic'), 'anthropic');
  assert.equal(launchProviderKey(specs, 'gemini'), 'gemini');
  assert.equal(launchProviderKey(specs, ''), '');
  const calls = [];
  const send = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/templates/teams') return { ok: true, data: [{ name: 'bare_metal', label: 'Bare Metal' }] };
    if (url === '/api/session-launch-specs') return { ok: true, data: specs };
    if (url === '/api/team-rosters') return { ok: true, data: options.json };
    if (url === '/api/launch') return { ok: true, data: { name: options.json.name } };
    return { ok: false, message: `unexpected ${url}` };
  };
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'bare_metal' }, inputs: { sessions: [{ name: 'a', provider: 'claude', model: 'opus' }, { name: 'b', provider: 'codex', model: '' }] } }, send);
  assert.equal(result.ok, true);
  assert.deepEqual(calls.filter((row) => row.url === '/api/launch').map((row) => [row.options.json.provider, row.options.json.model]), [['anthropic', 'opus'], ['openai', '']]);
  assert.equal(calls.filter((row) => row.url === '/api/session-launch-specs').length, 1, 'the table is read once');
});
