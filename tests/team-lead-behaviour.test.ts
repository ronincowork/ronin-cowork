import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { conditionalBehaviourPath, resolveConditionalBehaviours } from '../src/behaviours.js';
import { teamLeadAcknowledgement } from '../src/routes/sessions-api.js';

test('Team lead is one ordinary conditional Behavior selected only by the explicit designation', async () => {
  const lead = await resolveConditionalBehaviours({ arrangement: 'none', team: true, lead: true, cowork: true, new_owner: false });
  assert.equal(lead.filter((row) => row.book === 'team-lead').length, 1);
  assert.ok(!(
    await resolveConditionalBehaviours({ arrangement: 'none', team: true, lead: false, cowork: true, new_owner: false })
  ).some((row) => row.book === 'team-lead'));
  assert.ok(!(
    await resolveConditionalBehaviours({ arrangement: 'none', team: false, lead: true, cowork: true, new_owner: false })
  ).some((row) => row.book === 'team-lead'));
});

test('Agent roles select their conditional brief', async () => {
  const facts = { arrangement: 'none' as const, team: false, lead: false, cowork: true, new_owner: false };
  assert.ok((await resolveConditionalBehaviours({ ...facts, role: 'epic_lead' })).some((row) => row.book === 'epic_agent'));
  assert.ok((await resolveConditionalBehaviours({ ...facts, role: 'coordinator' })).some((row) => row.book === 'traffic_control'));
  assert.ok(!(await resolveConditionalBehaviours({ ...facts, role: 'coworker' })).some((row) => ['epic_agent', 'traffic_control'].includes(row.book)));
});

test('Mika is born on the base brief and hers, never the cowork briefs; the install check only for a new owner', async () => {
  const mika = { arrangement: 'none' as const, team: false, lead: false, cowork: false, role: 'mika' as const };
  const books = (rows: { book: string }[]) => rows.map((row) => row.book);
  const settled = books(await resolveConditionalBehaviours({ ...mika, new_owner: false }));
  assert.ok(settled.includes('mika'));
  assert.ok(!settled.some((book) => ['cowork-agent', 'mandates', 'write_it_down', 'atarashi'].includes(book)));
  assert.ok(books(await resolveConditionalBehaviours({ ...mika, new_owner: true })).includes('atarashi'));
  const cowork = books(await resolveConditionalBehaviours({ arrangement: 'none', team: true, lead: false, cowork: true, new_owner: true, role: 'coworker' }));
  assert.ok(['cowork-agent', 'mandates', 'write_it_down'].every((book) => cowork.includes(book)));
  assert.ok(!cowork.some((book) => ['mika', 'atarashi'].includes(book)));
});

test('a later lead designation acknowledges the change with the resolved reading assignment', async () => {
  const reading = await conditionalBehaviourPath('team-lead');
  assert.equal(path.basename(reading ?? ''), 'team-lead.md');
  const message = teamLeadAcknowledgement(['builders'], reading);
  assert.match(message, /now the team_lead of "builders"/);
  assert.match(message, /Reading assignment: read .*conditional\/team-lead\.md now for what a Team lead does\./);
});
