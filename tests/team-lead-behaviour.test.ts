import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { conditionalBehaviourPath, resolveConditionalBehaviours } from '../src/behaviours.js';
import { teamLeadAcknowledgement } from '../src/routes/sessions-api.js';

test('Team lead is one ordinary conditional Behavior selected only by the explicit designation', async () => {
  const lead = await resolveConditionalBehaviours({ arrangement: 'none', team: true, lead: true });
  assert.equal(lead.filter((row) => row.book === 'team-lead').length, 1);
  assert.ok(!(
    await resolveConditionalBehaviours({ arrangement: 'none', team: true, lead: false })
  ).some((row) => row.book === 'team-lead'));
  assert.ok(!(
    await resolveConditionalBehaviours({ arrangement: 'none', team: false, lead: true })
  ).some((row) => row.book === 'team-lead'));
});

test('Agent roles select their conditional brief', async () => {
  const facts = { arrangement: 'none' as const, team: false, lead: false };
  assert.ok((await resolveConditionalBehaviours({ ...facts, role: 'epic_lead' })).some((row) => row.book === 'epic_agent'));
  assert.ok((await resolveConditionalBehaviours({ ...facts, role: 'coordinator' })).some((row) => row.book === 'steerco_mgr'));
  assert.ok(!(await resolveConditionalBehaviours({ ...facts, role: 'coworker' })).some((row) => ['epic_agent', 'steerco_mgr'].includes(row.book)));
});

test('a later lead designation acknowledges the change with the resolved reading assignment', async () => {
  const reading = await conditionalBehaviourPath('team-lead');
  assert.equal(path.basename(reading ?? ''), 'team-lead.md');
  const message = teamLeadAcknowledgement(['builders'], reading);
  assert.match(message, /now the team_lead of "builders"/);
  assert.match(message, /Reading assignment: read .*conditional\/team-lead\.md now for what a Team lead does\./);
});
