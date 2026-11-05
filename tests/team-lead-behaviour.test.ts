import test from 'node:test';
import assert from 'node:assert/strict';
import { briefPointer, resolveConditionalBehaviours } from '../src/behaviours.js';
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

test('Project management: its cells need the switch (behaviour:project-management), each to its role', async () => {
  const facts = { arrangement: 'none' as const, team: false, lead: false, cowork: true, new_owner: false };
  const on = { ...facts, behaviours: ['project-management'] };
  const books = async (given: Parameters<typeof resolveConditionalBehaviours>[0]) => (await resolveConditionalBehaviours(given)).map((row) => row.book);
  const cells = ['project-management-coworker', 'project-management-lead', 'project-management-epic-lead', 'project-management-traffic-control'];
  assert.ok((await books({ ...on, role: 'epic_lead' })).includes('project-management-epic-lead'));
  assert.ok((await books({ ...on, role: 'coordinator' })).includes('project-management-traffic-control'));
  assert.deepEqual((await books({ ...on, role: 'coworker' })).filter((book) => cells.includes(book)), ['project-management-coworker'], 'behaviour:<name> and role:coworker both resolve');
  assert.deepEqual((await books({ ...on, role: 'lead', team: true, lead: true })).filter((book) => cells.includes(book)), ['project-management-lead']);
  for (const role of ['coworker', 'lead', 'epic_lead', 'coordinator'] as const) {
    assert.deepEqual((await books({ ...facts, role, team: true, lead: role === 'lead' })).filter((book) => cells.includes(book)), [], `switched off, ${role} reads no project-management cell`);
  }
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

test('a later lead designation acknowledges with the brief file name, label and tool', async () => {
  const message = teamLeadAcknowledgement(['builders'], await briefPointer('team-lead'));
  assert.match(message, /now the team_lead of "builders"/);
  assert.match(message, /read team-lead\.md \(Team lead\): ronin-help team-lead/);
  assert.equal(await briefPointer('worktree-root'), 'read worktree-root.md (Managed worktree): ronin-help worktree-root');
  assert.equal(await briefPointer('checkout'), 'read checkout.md (Checkout): ronin-help checkout');
});
