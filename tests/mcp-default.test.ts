/**
 * WHICH WAY THE gbrain TOGGLE OPENS — `- **mcp:**`, resolved through the cascade.
 *
 * The property under test is the owner's ruling of 2026-08-22: the ＋ New form's toggle
 * is born OFF for every ordinary launch and ON only where the brain IS the job. Before
 * it, the launcher opened every kind connected — a default living in the client rather
 * than in the catalog, which is exactly the constant a launch must not guess.
 *
 * IT IS ASSERTED ON THE RESOLVED PAIR, not on a row, and that is the part the schema cut
 * changed. `mcp:` cascades system < job_role < session_task, so "is this launch born
 * connected" is only answerable once both axes are known — a task row cannot say, and
 * neither can a role row. The button reads exactly what is asserted here
 * (`GET /api/launch-profile`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { findDefinition, listJobRoles, listSessionTasks } from '../src/definitions.js';
import { resolveLaunchProfile } from '../src/launch-profile.js';

/** Every button the board draws: each role blank, each role × its task family, and every
 *  loose task on its own. The same set `scripts/check-catalogs.ts` resolves. */
async function everyPair(): Promise<[string, string][]> {
  const roles = await listJobRoles();
  const tasks = await listSessionTasks();
  const inSomeFamily = new Set(roles.flatMap((r) => r.task_family));
  return [
    ...roles.map((r) => [r.name, ''] as [string, string]),
    ...roles.flatMap((r) => r.task_family.map((t) => [r.name, t] as [string, string])),
    ...tasks.filter((t) => !inSomeFamily.has(t.name)).map((t) => ['', t.name] as [string, string]),
  ];
}

const resolve = async (role: string, task: string) =>
  resolveLaunchProfile(
    await findDefinition('job_roles', role),
    await findDefinition('session_tasks', task),
  );

test('an ordinary launch is born with no brain', async () => {
  const pairs = await everyPair();
  assert.ok(pairs.length >= 8, 'the stock board should still draw its buttons');
  for (const [role, task] of pairs) {
    if (role === 'personalassistant') continue; // the one whose whole job is the brain
    const p = await resolve(role, task);
    const where = `${role || '(no role)'} × ${task || '(no task)'}`;
    assert.equal(p.mcpDefault, false, `${where} must open the toggle off`);
    assert.equal(p.mcpAlways, false, `${where} must leave the owner the choice`);
  }
});

test('personalassistant is born connected and is not offered the choice', async () => {
  const p = await resolve('personalassistant', '');
  assert.equal(p.mcpDefault, true);
  assert.equal(p.mcpAlways, true);
  // The lock is the ROLE's, so it holds for every task that could ever be shelved on it.
  assert.equal(p.job_role, 'personalassistant');
});

test('a lower layer may not contradict the mcp lock', async () => {
  const lock = await findDefinition('job_roles', 'personalassistant');
  const clash = {
    name: 'PretendTask',
    origin: 'user' as const,
    shadowed: false,
    file: '/tmp/PretendTask.md',
    get: (k: string) => (k === 'mcp' ? 'off' : ''),
    has: (k: string) => k === 'mcp',
  };
  assert.throws(() => resolveLaunchProfile(lock, clash), /born connected/);
});
