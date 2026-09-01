/**
 * THE TEAM ROSTER — the durable half of a team, and the facts it must never hold.
 *
 * A roster carries the team's kind, objective, kit and launch defaults, and exists
 * independent of any live session (a zero-member team is the League's ordinary row).
 * Members and leads are NEVER stored in it — each session defines whose team it is on —
 * and the store refuses nothing else so loudly as it refuses that (R35, 2026-08-23).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-rosters-test-'));
process.env.RONIN_TEAM_ROSTERS_DIR = temp;
const ROUTINES_OFF = {
  ronin_base: false, ronin_worktrees: false, ronin_services: false, ronin_host: false, gbrain: false,
};

const {
  createTeamRoster,
  deleteTeamRoster,
  listTeamRosters,
  readTeamRoster,
  writeTeamRoster,
} = await import('../src/team-rosters.js');
test('create → read → list: a zero-member team is a real, openable record', async () => {
  const r = await createTeamRoster('alpha', {
    kind: 'coding',
    objective: 'ship the teams cut',
    project_root: 'ronin-cowork',
    branch: 'dev',
    references: ['https://example.test/spec', 'Owner note'],
    routines: { ronin_base: true, ronin_worktrees: false },
    behaviours: { books: ['ways:CutCode'], required: true },
    agent_defaults: {
      provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
      output: 'code', dial: 'read', launch_mode: 'configured', gbrain_mode: 'connected',
    },
  });
  assert.equal(r.kind, 'coding');
  assert.equal(r.title, 'Alpha');
  assert.equal(r.wipeboard, 'alpha', 'the board defaults to the team’s own token');
  assert.equal(r.state, 'active');
  assert.deepEqual(r.routines, { ...ROUTINES_OFF, ronin_base: true });

  const back = await readTeamRoster('alpha');
  assert.deepEqual(back, r);
  assert.equal((await listTeamRosters()).length, 1, 'listed with zero live members');
});

test('the settled nested shapes round-trip, and an edit touches only what it states', async () => {
  const r = await writeTeamRoster('alpha', { title: 'Alpha Platform', routines: { base: false, control: true } });
  assert.equal(r.title, 'Alpha Platform');
  assert.equal(r.objective, 'ship the teams cut', 'unstated fields survive');
  assert.deepEqual(r.references, ['https://example.test/spec', 'Owner note']);
  assert.deepEqual(r.routines, ROUTINES_OFF);
  assert.deepEqual(r.behaviours, { books: ['ways:CutCode'], required: true });
  assert.deepEqual(r.agent_defaults, {
    provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
    output: ['code'], dial: 'read', launch_mode: 'configured', gbrain_mode: 'connected',
  });
});

test('a blank field is written as "—" and reads back as the blank it stands for', async () => {
  // The quirk of 2026-08-26: a roster created with blanks rendered them as "—", and the
  // next edit read those marks back as VALUES — a project_root named "—", refused at
  // launch. The mark is a rendering; the store must never return it as a fact.
  await createTeamRoster('bare', { objective: 'only this' });
  const r = await writeTeamRoster('bare', { branch: 'dev' });
  assert.equal(r.project_root, '', 'an untouched blank stays blank after an edit');
  assert.equal(r.kind, 'open');
  assert.deepEqual(r.references, []);
  assert.deepEqual(r.routines, ROUTINES_OFF);
  assert.deepEqual(r.behaviours, { books: [], required: false });
  assert.equal(r.branch, 'dev');
  const cleared = await writeTeamRoster('bare', { objective: '' });
  assert.equal(cleared.objective, '', 'clearing a field is blank on read-back, not "—"');
  await deleteTeamRoster('bare');
});

test('creating over an existing roster is refused — editing is a different intent', async () => {
  await assert.rejects(() => createTeamRoster('alpha', {}), /already has a roster/);
});

test('dissolve deletes the roster and only the roster', async () => {
  await deleteTeamRoster('alpha');
  assert.equal(await readTeamRoster('alpha'), null);
  await assert.rejects(() => deleteTeamRoster('alpha'), /has no roster/);
});
