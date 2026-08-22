/**
 * THE CUT MOVED EVERY OLD ENTRY, AND MOVED NOTHING ELSEWHERE — asserted as exact sets.
 *
 * The combined `SESSION_JOBS.md` held eleven entries and the launcher shipped three
 * shelves. The owner's model (2026-08-22) is that the mapping is total and mechanical:
 *
 *   every former session_job  →  a session_task, all eleven, without exception
 *   every former shelf        →  a family_role, with the same family it always had
 *
 * The cut got that wrong twice and each time it looked reasonable in isolation.
 * `QuarterBack`, `PersonalAssistant` and `MikaAssist` were promoted to roles on the
 * grounds that they read as identities rather than acts — which is true of the WORDS and
 * false of the model: a role is the shelf, and those three were on shelves like everything
 * else. Meanwhile `assistant` and `extra` vanished entirely, so two of the three shipped
 * shelves stopped existing.
 *
 * Set equality is the right shape for this and a spot check is not. Both failures were
 * "one row moved to the wrong side", which every per-row test passes and only a total
 * comparison catches. These lists are FROZEN HISTORY — the eleven entries and three
 * shelves as they stood before the cut — so they are written out longhand rather than
 * derived from anything that can drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { listFamilyRoles, listSessionTasks } from '../src/definitions.js';

/** `SESSION_JOBS.md` as it stood at the cut, in its file order. */
const FORMER_JOBS = [
  'RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork', 'QuarterBack',
  'OddJob', 'Atarashi', 'PersonalAssistant', 'OpenShell', 'MikaAssist',
];

/** `DEFAULT_JOB_CLASSES` as it stood at the cut — the three shipped shelves. */
const FORMER_SHELVES: Record<string, string[]> = {
  developer: ['RiffOnIt', 'DraftPlan', 'CutCode', 'ChaseBug', 'CheckWork', 'QuarterBack'],
  assistant: ['PersonalAssistant', 'MikaAssist'],
  extra: ['OddJob', 'Atarashi', 'OpenShell'],
};

test('every former session_job is a session_task — all eleven, and nothing extra', async () => {
  const tasks = (await listSessionTasks()).map((t) => t.name);
  assert.deepEqual(
    [...tasks].sort(),
    [...FORMER_JOBS].sort(),
    'the stock task set must equal the former job set exactly',
  );
  // Order is a launch fact too: the board is read left to right and OpenShell hands you a
  // bare shell, so it does not belong among the buttons that start work.
  assert.deepEqual(tasks, FORMER_JOBS, 'and in the order the combined catalog had');
});

test('the three shipped shelves are the three stock family_roles, with their families intact', async () => {
  const roles = await listFamilyRoles();
  assert.deepEqual(
    roles.map((r) => r.name).sort(),
    Object.keys(FORMER_SHELVES).sort(),
    'the stock role set must equal the former shelf set exactly',
  );
  for (const r of roles) {
    assert.deepEqual(
      r.session_tasks,
      FORMER_SHELVES[r.name],
      `${r.name}'s family must be the shelf it always was`,
    );
  }
});

test('every task is on exactly one stock shelf — none loose, none shelved twice', async () => {
  // The old board put every shipped job on a shelf on purpose: an unshelved job renders in
  // a flat tail that cannot fold, and a default that cannot fold defeats the shelves.
  // Family is ASSOCIATION and a task MAY sit on several — this asserts what the HOUSE
  // ships, not what the owner is allowed to do.
  const tasks = (await listSessionTasks()).map((t) => t.name);
  const placements = new Map<string, number>(tasks.map((t) => [t, 0]));
  for (const r of await listFamilyRoles()) {
    for (const t of r.session_tasks) placements.set(t, (placements.get(t) ?? 0) + 1);
  }
  for (const [task, n] of placements) {
    assert.equal(n, 1, `${task} sits on ${n} stock shelves; every stock task sits on exactly one`);
  }
});

test('no former job was promoted to a role, and no shelf was demoted to a task', async () => {
  // The two mistakes, stated as the invariant that would have caught either one.
  const roles = (await listFamilyRoles()).map((r) => r.name);
  const tasks = (await listSessionTasks()).map((t) => t.name);
  for (const job of FORMER_JOBS) {
    assert.ok(tasks.includes(job), `${job} was a session_job, so it must be a session_task`);
    assert.ok(!roles.includes(job.toLowerCase()), `${job} must not have become a family_role`);
  }
  for (const shelf of Object.keys(FORMER_SHELVES)) {
    assert.ok(roles.includes(shelf), `${shelf} was a shelf, so it must be a family_role`);
    assert.ok(!tasks.includes(shelf), `${shelf} must not have become a session_task`);
  }
});
