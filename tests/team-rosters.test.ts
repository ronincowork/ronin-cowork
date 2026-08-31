/**
 * THE TEAM ROSTER — the durable half of a team, and the facts it must never hold.
 *
 * A roster carries the team's `team_role`, objective and launch defaults, and exists
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

const {
  createTeamRoster,
  deleteTeamRoster,
  listTeamRosters,
  readTeamRoster,
  writeTeamRoster,
} = await import('../src/team-rosters.js');
const { deriveTeams } = await import('../src/tegami.js');

test('create → read → list: a zero-member team is a real, openable record', async () => {
  const r = await createTeamRoster('alpha', {
    team_role: 'development',
    objective: 'ship the teams cut',
    project_root: 'ronin-cowork',
    repos: ['ronin-cowork', 'ronin-services'],
    branch: 'dev',
  });
  assert.equal(r.team_role, 'development');
  assert.equal(r.title, 'Alpha');
  assert.equal(r.wipeboard, 'alpha', 'the board defaults to the team’s own token');
  assert.equal(r.state, 'active');

  const back = await readTeamRoster('alpha');
  assert.deepEqual(back, r);
  assert.equal((await listTeamRosters()).length, 1, 'listed with zero live members');
});

test('team_role is MUTABLE, and an edit touches only what it states', async () => {
  const r = await writeTeamRoster('alpha', { team_role: 'platform', title: 'Alpha Platform' });
  assert.equal(r.team_role, 'platform', 'the owner changed what the team IS — legal by ruling');
  assert.equal(r.title, 'Alpha Platform');
  assert.equal(r.objective, 'ship the teams cut', 'unstated fields survive');
});

test('a blank field is written as "—" and reads back as the blank it stands for', async () => {
  // The quirk of 2026-08-26: a roster created with blanks rendered them as "—", and the
  // next edit read those marks back as VALUES — a project_root named "—", refused at
  // launch. The mark is a rendering; the store must never return it as a fact.
  await createTeamRoster('bare', { objective: 'only this' });
  const r = await writeTeamRoster('bare', { branch: 'dev' });
  assert.equal(r.project_root, '', 'an untouched blank stays blank after an edit');
  assert.equal(r.team_role, '');
  assert.deepEqual(r.repos, []);
  assert.equal(r.branch, 'dev');
  const cleared = await writeTeamRoster('bare', { objective: '' });
  assert.equal(cleared.objective, '', 'clearing a field is blank on read-back, not "—"');
  await deleteTeamRoster('bare');
});

test('creating over an existing roster is refused — editing is a different intent', async () => {
  await assert.rejects(() => createTeamRoster('alpha', {}), /already has a roster/);
});

test('the letter derives its teams block from tags + rosters, tag-only teams included', async () => {
  const teams = await deriveTeams(['alpha', 'ghosts']);
  assert.deepEqual(teams, [
    { team: 'alpha', team_role: 'platform', objective: 'ship the teams cut' },
    { team: 'ghosts', team_role: '', objective: '' }, // membership is real without a roster
  ]);
});

test('dissolve deletes the roster and only the roster', async () => {
  await deleteTeamRoster('alpha');
  assert.equal(await readTeamRoster('alpha'), null);
  await assert.rejects(() => deleteTeamRoster('alpha'), /has no roster/);
});
