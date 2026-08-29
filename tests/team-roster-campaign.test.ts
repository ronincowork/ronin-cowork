/**
 * A COWORK BELONGS TO EXACTLY ONE CAMPAIGN, and its name resolves inside it.
 *
 * The collision this file exists to prove impossible: two Campaigns each holding a Cowork
 * called `dev`. Before Campaign scoping, `team_rosters/dev.md` was one global path and the
 * second create would have edited the first team's record — the proof checklist's "same
 * Cowork token can exist in two Campaigns without collision" is exactly this.
 *
 * The other half is the compatibility window (CAMPAIGN_SCOPING migration step 8): every
 * roster written before Campaigns sits flat in the store with no id, and it must keep
 * reading — as UNMARKED ('' ), never as a guessed Campaign. This store reports what was
 * written; mapping '' onto the initial Campaign is the caller's, in one place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-roster-campaign-'));
process.env.RONIN_TEAM_ROSTERS_DIR = temp;

const {
  createTeamRoster,
  deleteTeamRoster,
  listTeamRosters,
  readTeamRoster,
  renameTeamRoster,
  teamRosterFile,
  writeTeamRoster,
} = await import('../src/team-rosters.js');

test('the same Cowork name in two Campaigns is two records, not one', async () => {
  const health = await createTeamRoster('dev', { objective: 'ship the health app' }, 'health');
  const home = await createTeamRoster('dev', { objective: 'run the house' }, 'home');

  assert.equal(health.campaign_id, 'health');
  assert.equal(home.campaign_id, 'home');

  // The refusal that used to fire on the second create must NOT fire: a name is only taken
  // inside its own Campaign.
  assert.equal((await readTeamRoster('dev', 'health'))?.objective, 'ship the health app');
  assert.equal((await readTeamRoster('dev', 'home'))?.objective, 'run the house');

  // And they are genuinely two files, nested by Campaign.
  assert.equal(teamRosterFile('dev', 'health'), path.join(temp, 'health', 'dev.md'));
  assert.notEqual(teamRosterFile('dev', 'health'), teamRosterFile('dev', 'home'));
});

test('creating over a name inside the SAME Campaign is still refused', async () => {
  await assert.rejects(
    () => createTeamRoster('dev', {}, 'health'),
    /already has a roster/,
    'the refusal is scoped, not removed',
  );
});

test('an edit lands on the addressed Campaign and leaves its twin untouched', async () => {
  await writeTeamRoster('dev', { branch: 'main' }, 'health');
  assert.equal((await readTeamRoster('dev', 'health'))?.branch, 'main');
  assert.equal((await readTeamRoster('dev', 'home'))?.branch, '', 'the other Campaign is untouched');
});

test('campaign_id survives a round-trip and is not editable', async () => {
  const edited = await writeTeamRoster('dev', { campaign_id: 'home' } as never, 'health');
  assert.equal(edited.campaign_id, 'health', 'reassignment is a migration operation, not a field');
});

test('a legacy flat roster still reads, and reads as UNMARKED rather than a guess', async () => {
  // Exactly what is on disk today, written before Campaigns existed.
  await fs.writeFile(
    path.join(temp, 'legacy.md'),
    '# legacy\n\n- **title:** Legacy\n- **objective:** written before Campaigns\n- **state:** active\n',
    'utf8',
  );
  const r = await readTeamRoster('legacy');
  assert.equal(r?.campaign_id, '', "unmarked is '' — the store never invents an id it did not stamp");
  assert.equal(r?.objective, 'written before Campaigns');
});

test('the League list carries every Campaign and the unmarked records together', async () => {
  const all = await listTeamRosters();
  const seen = all.map((r) => `${r.campaign_id || 'unmarked'}/${r.name}`).sort();
  assert.deepEqual(seen, ['health/dev', 'home/dev', 'unmarked/legacy']);
});

test('an unscoped read of a name held by two Campaigns refuses instead of picking one', async () => {
  await assert.rejects(
    () => readTeamRoster('dev'),
    /more than one Campaign/,
    'silently returning either one is the drift the nesting exists to prevent',
  );
});

test('rename stays inside its Campaign', async () => {
  const renamed = await renameTeamRoster('dev', 'delivery', 'home');
  assert.equal(renamed.campaign_id, 'home');
  assert.equal(await readTeamRoster('delivery', 'health'), null, 'the other Campaign did not move');
  assert.equal((await readTeamRoster('dev', 'health'))?.objective, 'ship the health app');
});

test('dissolve deletes only the addressed Campaign’s record', async () => {
  await deleteTeamRoster('delivery', 'home');
  assert.equal(await readTeamRoster('delivery', 'home'), null);
  assert.equal((await readTeamRoster('dev', 'health'))?.objective, 'ship the health app', 'its twin survives');
});

test('a campaign_id can never climb out of the store', async () => {
  for (const bad of ['../escape', 'a/b', '/abs', '..']) {
    assert.throws(() => teamRosterFile('dev', bad), /not a valid campaign_id/, `refused: ${bad}`);
  }
});
