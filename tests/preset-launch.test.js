import test from 'node:test';
import assert from 'node:assert/strict';
import { launchPresetPlan } from '../public/js/preset-launch.js';

const responder = (template, calls) => async (url, options = {}) => {
  calls.push({ url, body: options.json });
  if (url.startsWith('/api/templates/')) return { ok: true, data: [template] };
  if (url === '/api/team-rosters') return { ok: true, data: options.json };
  if (url === '/api/launch') return { ok: true, data: { name: options.json.name, receipt: { project_root: options.json.project_root, work_locations: [{ worktree: `/desk/${options.json.name}` }] } } };
  if (url === '/api/setup/morning-brief/schedules') return { ok: true, data: { schedule: { team: options.json.team, job: { id: 'job-1', ...options.json } } } };
  throw new Error(`unexpected ${url}`);
};

test('Personal Assistant faithfully launches three distinct shapes', async () => {
  for (const [mode, recruit, view] of [['single', null, 'cowork'], ['lead', 'nobody', 'team'], ['recruit', 'staff agents', 'team']]) {
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
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'morning_brief' }, user_message: 'News', inputs: { schedule: 'weekdays at 8am', delivery: 'team lead', active: true } }, send);
  const call = calls.find((row) => row.url === '/api/setup/morning-brief/schedules');
  assert.deepEqual({ request: call.body.request, when: call.body.when, to: call.body.to, active: call.body.active }, { request: 'News', when: 'weekdays at 8am', to: 'lead', active: true });
  assert.equal(result.data.schedule.job.id, 'job-1');
});

test('Develop Project retains every ordinary launch receipt and work location', async () => {
  const calls = [], send = responder({ name: 'develop_new_project', label: 'Develop', agents: [] }, calls);
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'develop_new_project' }, inputs: { root: 'ronin_project_1', features: ['frontend', 'backend'] } }, send);
  assert.equal(result.data.receipts.length, 2);
  assert.ok(result.data.receipts.every((receipt) => receipt.project_root === 'ronin_project_1' && receipt.work_locations.length === 1));
});
