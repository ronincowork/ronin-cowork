import test from 'node:test';
import assert from 'node:assert/strict';
import { launchPresetPlan } from '../public/js/preset-launch.js';

// The root rides the Team record, as the New Team form sends it; the server resolves an
// agent's birthplace from its roster, so the fake receipt reads it from the roster too.
const responder = (template, calls) => { let roster = null; return async (url, options = {}) => {
  calls.push({ url, body: options.json });
  if (url.startsWith('/api/templates/')) return { ok: true, data: [template] };
  if (url === '/api/team-rosters') { roster = options.json; return { ok: true, data: options.json }; }
  if (url === '/api/launch') return { ok: true, data: { name: options.json.name, receipt: { project_root: options.json.project_root || roster?.project_root, work_locations: [{ worktree: `/desk/${options.json.name}` }] } } };
  if (url === '/api/setup/morning-brief/schedules') return { ok: true, data: { schedule: { team: options.json.team, job: { id: 'job-1', ...options.json } } } };
  throw new Error(`unexpected ${url}`);
}; };

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

test('Ronin Team launches the stored template through the team loader, with nothing about provider or model on a row', async () => {
  const calls = [], send = responder({ name: 'ronin_team', label: 'Ronin Team', agents: [
    { name: 'team lead', team_lead: true, instructions: 'Lead.', mandate: { reach: 'execute', recruit: 'propose agents', output: ['open'] } },
    { name: 'agent 1', instructions: 'Work.', mandate: { reach: 'execute', recruit: 'nobody', output: ['open'] } },
    { name: 'agent 2', instructions: 'Work.', mandate: { reach: 'execute', recruit: 'nobody', output: ['open'] } },
  ] }, calls);
  const sessions = [{ name: 'team_lead', team_lead: true }, { name: 'agent_1' }, { name: 'agent_2' }];
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'ronin_team' }, user_message: 'Ship it.', inputs: { sessions, root: 'ronin_lab' } }, send);
  assert.equal(result.ok, true);
  // Where rides the Team record, as the New Team form sends it.
  assert.equal(calls.find((row) => row.url === '/api/team-rosters').body.project_root, 'ronin_lab');
  // The receipt keeps each row's lead mark, in birth order, for the seating to read.
  assert.deepEqual(result.data.sessions, [{ name: 'agent_1' }, { name: 'agent_2' }, { name: 'team_lead', team_lead: true }]);
  const births = calls.filter((row) => row.url === '/api/launch');
  assert.equal(births.length, 3);
  // The loader's order: ordinary rows first, the marked lead last; the stored template's
  // instructions and mandate ride each row; no provider or model rides any row.
  assert.deepEqual(births.map(({ body }) => [body.team_lead, 'provider' in body, 'model' in body]), [[false, false, false], [false, false, false], [true, false, false]]);
  assert.ok(births.every(({ body }) => body.instructions.endsWith('Ship it.')));
  assert.ok(births.every(({ body }) => body.mandate && body.mandate.reach));
});

test('Bare Metal launches a bare-metal team: bare_metal_<code> with native agents inside, named as the rows name them', async () => {
  const calls = [], send = responder({ name: 'bare_metal', label: 'Bare Metal', objective: 'Work together.', agents: [{ name: 'session 1', team_lead: true, instructions: 'Lead.' }, { name: 'session 2', instructions: 'Work.' }] }, calls);
  const result = await launchPresetPlan({ template: { shelf: 'teams', name: 'bare_metal' }, user_message: '', inputs: { root: 'ronin_lab', sessions: [{ name: 'session_1', provider: 'anthropic', model: 'opus' }, { name: 'session_2' }, { name: 'session_3' }] } }, send);
  assert.equal(result.ok, true);
  assert.equal(result.data.urlView, 'team');
  const roster = calls.find((row) => row.url === '/api/team-rosters').body;
  const code = roster.name.match(/^bare_metal_(\d{3})$/)?.[1];
  assert.ok(code, 'the team is bare_metal_<code>');
  assert.equal(roster.project_root, 'ronin_lab');
  assert.deepEqual(roster.routines, { ronin_base: false, ronin_worktrees: false }, 'a bare-metal team launches bare');
  assert.equal(result.data.team, roster.name);
  const births = calls.filter((row) => row.url === '/api/launch').map((row) => row.body);
  assert.deepEqual(births.map((body) => body.name), [`session_1_${code}`, `session_2_${code}`, `session_3_${code}`], 'row names plus the launch code');
  for (const body of births) {
    assert.equal(body.session_type, 'bare_metal_agent');
    assert.equal(body.team, roster.name);
    assert.equal(body.project_root, 'ronin_lab');
    assert.equal(body.instructions, '');
    assert.equal('mandate' in body || 'team_lead' in body || 'routines' in body, false);
  }
  assert.deepEqual(births.map((body) => [body.provider, body.model]), [['anthropic', 'opus'], [undefined, undefined], [undefined, undefined]]);
});

test('a team launch the server refuses in part still opens the team and names who is missing', async () => {
  const template = { name: 'bare_metal', label: 'Bare Metal', objective: 'Work.', agents: [] };
  const refusing = (names) => { const inner = responder(template, []); return async (url, options = {}) => (url === '/api/launch' && names.includes(options.json.name.replace(/_\d{3}$/, ''))) ? { ok: false, message: 'At the session max (21 of 21).' } : inner(url, options); };
  const partial = await launchPresetPlan({ template: { shelf: 'teams', name: 'bare_metal' }, inputs: { sessions: [{ name: 'session_1' }, { name: 'session_2' }, { name: 'session_3' }, { name: 'session_4' }] } }, refusing(['session_4']));
  assert.equal(partial.ok, true, 'three were born, so the team opens');
  assert.equal(partial.data.sessions.length, 3);
  assert.deepEqual(partial.data.refused.map((row) => [row.name.replace(/_\d{3}$/, ''), row.message]), [['session_4', 'At the session max (21 of 21).']]);
  const none = await launchPresetPlan({ template: { shelf: 'teams', name: 'bare_metal' }, inputs: { sessions: [{ name: 'session_1' }] } }, refusing(['session_1']));
  assert.equal(none.ok, false, 'nobody born is the only failure');
  assert.equal(none.message, 'At the session max (21 of 21).');
});

test('the seeded tab state carries the seating\'s arrangement', async () => {
  const { presetWorkspaceState } = await import('../public/js/preset-launch.js');
  const state = presetWorkspaceState({ count: 4, arrangement: { order: ['workspace1', 'selector', 'workspace2'], hidden: [], widths: { workspace1: 43, selector: 14, workspace2: 43 } }, seats: [
    { workspace: 'workspace1', type: 'session', key: 'a' }, { workspace: 'workspace2', type: 'team.commons', key: 't', tab: 'team-configuration' },
  ] });
  assert.equal(state.count, 4);
  assert.deepEqual(state.arrangement.widths, { workspace1: 43, selector: 14, workspace2: 43 });
  assert.deepEqual(state.seats.workspace2, { type: 'team.commons', key: 't', tab: 'team-configuration' });
});
