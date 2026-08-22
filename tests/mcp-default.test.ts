/**
 * WHICH WAY THE gbrain TOGGLE OPENS — `- **mcp:**` in ronin_catalogs/SESSION_JOBS.md.
 *
 * The property under test is the owner's ruling of 2026-08-22: the ＋ New form's toggle
 * is born OFF for every ordinary session_job and ON only for the kind whose whole job is
 * the brain. Before it, the launcher opened every kind connected — a default living in
 * the client rather than in the catalog, which is exactly the constant a launch must not
 * guess. So the assertion is on the CATALOG, not on the button: the button reads this.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listSessionJobs } from '../src/catalog.js';

test('an ordinary session_job is born with no brain, and says so in the catalog', async () => {
  const jobs = await listSessionJobs();
  const ordinary = jobs.filter((j) => j.agent && j.name !== 'PersonalAssistant');
  assert.ok(ordinary.length >= 8, 'the stock catalog should still carry its agent kinds');
  for (const j of ordinary) {
    assert.equal(j.mcpDefault, false, `${j.name} must open the toggle off`);
    assert.equal(j.mcpAlways, false, `${j.name} must leave the owner the choice`);
  }
});

test('PersonalAssistant is born connected and is not offered the choice', async () => {
  const pa = (await listSessionJobs()).find((j) => j.name === 'PersonalAssistant');
  assert.ok(pa, 'PersonalAssistant is a stock kind');
  assert.equal(pa.mcpDefault, true);
  assert.equal(pa.mcpAlways, true);
});
