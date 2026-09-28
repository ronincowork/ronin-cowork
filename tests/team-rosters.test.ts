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
    behaviours: { selected: ['mandates'], required: ['mandates'] },
    agent_defaults: {
      provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
      output: 'code', launch_mode: 'configured',
    },
  });
  assert.equal(r.kind, 'coding');
  assert.equal(r.title, 'Alpha');
  assert.equal(r.wipeboard, 'alpha', 'the board defaults to the team’s own token');
  assert.equal(r.state, 'active');
  assert.deepEqual(r.holds, [], 'a Team holds work item ids, none yet');

  const back = await readTeamRoster('alpha');
  assert.deepEqual(back, r);
  assert.equal((await listTeamRosters()).length, 1, 'listed with zero live members');
});

test('the settled nested shapes round-trip, and an edit touches only what it states', async () => {
  const r = await writeTeamRoster('alpha', { title: 'Alpha Platform' });
  assert.equal(r.title, 'Alpha Platform');
  assert.equal(r.objective, 'ship the teams cut', 'unstated fields survive');
  assert.deepEqual((await writeTeamRoster('alpha', { holds: ['w3', 'w9'] })).holds, ['w3', 'w9'], 'holds round-trip');
  assert.deepEqual(r.behaviours, { selected: [], required: [] });
  assert.deepEqual(r.agent_defaults, {
    provider: 'anthropic', model: 'opus', reach: 'execute', recruit: 'nobody',
    output: ['code'], launch_mode: 'configured',
  });
});

test('a blank field is written as "—" and reads back as the blank it stands for', async () => {
  // The quirk of 2026-08-26: a roster created with blanks rendered them as "—", and the
  // next edit read those marks back as VALUES — a project_root named "—", refused at
  // launch. The mark is a rendering; the store must never return it as a fact.
  await createTeamRoster('bare', { objective: 'only this' });
  const withBranches = await createTeamRoster('checkouts', { repos: ['cowork', 'koe'], branches: { koe: 'main', ignored: '' } });
  assert.deepEqual((await readTeamRoster('checkouts'))?.branches, { koe: 'main' }, 'per-repo branches round-trip; blanks drop');
  const r = await writeTeamRoster('bare', { branch: 'dev' });
  assert.equal(r.project_root, '', 'an untouched blank stays blank after an edit');
  assert.equal(r.kind, 'open');
  assert.deepEqual(r.behaviours, { selected: [], required: [] });
  assert.equal(r.branch, 'dev');
  const cleared = await writeTeamRoster('bare', { objective: '' });
  assert.equal(cleared.objective, '', 'clearing a field is blank on read-back, not "—"');
  await deleteTeamRoster('bare');
});

test('an old behaviour shape reads with no elective behaviours and is not rewritten', async () => {
  const file = path.join(temp, 'home_machine', 'old_shape.md');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = '# old_shape\n- **title:** Old Shape\n- **behaviours:** {"books":[],"required":false}\n';
  await fs.writeFile(file, raw, 'utf8');
  const roster = await readTeamRoster('old_shape', 'home_machine');
  assert.deepEqual(roster?.behaviours, { selected: [], required: [] });
  assert.equal(await fs.readFile(file, 'utf8'), raw, 'reading the old shape does not migrate it');
});

test('a settled roster honours an explicit empty behaviour list', async () => {
  const roster = await createTeamRoster('explicit_empty', {
    behaviours: { selected: [], required: [] },
  }, 'home_machine');
  assert.deepEqual(roster.behaviours, { selected: [], required: [] });
  assert.deepEqual((await readTeamRoster('explicit_empty', 'home_machine'))?.behaviours, { selected: [], required: [] });
});

test('creating over an existing roster is refused — editing is a different intent', async () => {
  await assert.rejects(() => createTeamRoster('alpha', {}), /already has a roster/);
});

test('dissolve deletes the roster and only the roster', async () => {
  await deleteTeamRoster('alpha');
  assert.equal(await readTeamRoster('alpha'), null);
  await deleteTeamRoster('alpha'); // idempotent for an already-empty/tag-only Team
});

test('exact deletion removes a stale uppercase roster file from its Campaign store', async () => {
  const campaign = path.join(temp, 'home_machine');
  await fs.mkdir(campaign, { recursive: true });
  const stale = path.join(campaign, 'RONIN_HELPERS.md');
  await fs.writeFile(stale, 'title = Ronin Helpers\nobjective = stale\n', 'utf8');
  await deleteTeamRoster('RONIN_HELPERS');
  await assert.rejects(fs.lstat(stale), { code: 'ENOENT' });
});
