/**
 * WHICH WAY THE gbrain TOGGLE OPENS — `- **mcp:**`, resolved through the cascade.
 *
 * The property under test is the owner's ruling of 2026-08-22: the ＋ New form's toggle
 * is born OFF for every ordinary launch and ON only where the brain IS the job. Before
 * it, the launcher opened every kind connected — a default living in the client rather
 * than in the catalog, which is exactly the constant a launch must not guess.
 *
 * IT IS ASSERTED ON THE RESOLVED PROFILE — one definition layer now (R35): `mcp:` is
 * the session_role definition's or the system's. The button reads exactly what is
 * asserted here (`GET /api/launch-profile`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findDefinition, listSessionRoles } from '../src/resource-adapters.js';
import { resolveLaunchProfile } from '../src/launch-profile.js';

const resolve = async (task: string) =>
  resolveLaunchProfile(await findDefinition('session_roles', task));

test('an ordinary launch is born with no brain', async () => {
  const tasks = (await listSessionRoles()).map((t) => t.name);
  assert.ok(tasks.length >= 8, 'the stock board should still draw its buttons');
  for (const task of ['', ...tasks]) {
    if (task === 'PersonalAssistant') continue; // the one whose whole job is the brain
    const p = await resolve(task);
    const where = task || '(blank)';
    assert.equal(p.mcpDefault, false, `${where} must open the toggle off`);
    assert.equal(p.mcpAlways, false, `${where} must leave the owner the choice`);
  }
});

test('PersonalAssistant is born connected and is not offered the choice', async () => {
  const p = await resolve('PersonalAssistant');
  assert.equal(p.mcpDefault, true);
  assert.equal(p.mcpAlways, true);
  assert.equal(p.session_role, 'PersonalAssistant');
});
