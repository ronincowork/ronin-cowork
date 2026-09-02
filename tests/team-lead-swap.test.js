import test from 'node:test';
import assert from 'node:assert/strict';
import { swapTeamLead } from '../public/js/team-lead-swap.js';

test('the quick Agent loader removes this Team from every previous leader only', async () => {
  const calls = [];
  const result = await swapTeamLead(async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true };
  }, 'storm', 'new_lead', [
    { name: 'old_one', team_lead: true, leads: ['storm', 'another_team'] },
    { name: 'ordinary', team_lead: false, leads: [] },
    { name: 'old_two', team_lead: true, leads: ['storm'] },
    { name: 'new_lead', team_lead: true, leads: ['storm'] },
  ]);

  assert.deepEqual(calls, [
    { url: '/api/sessions/old_one/team_lead', method: 'POST', json: { teams: ['another_team'] } },
    { url: '/api/sessions/old_two/team_lead', method: 'POST', json: { teams: [] } },
  ]);
  assert.deepEqual(result, { ok: true, failed: [] });
});

test('the leadership handoff attempts every previous leader and names refusals', async () => {
  const result = await swapTeamLead(async (url) => ({ ok: !url.includes('stuck') }), 'storm', 'new_lead', [
    { name: 'stuck', team_lead: true, leads: ['storm'] },
    { name: 'cleared', team_lead: true, leads: ['storm'] },
  ]);
  assert.deepEqual(result, { ok: false, failed: ['stuck'] });
});
