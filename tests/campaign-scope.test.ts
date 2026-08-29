/**
 * CAMPAIGN SCOPE — the compatibility read, the refusals, and the migration.
 *
 * Three claims from CAMPAIGN_SCOPING's proof checklist are proved here:
 *
 *   "Existing install becomes one Campaign with no renamed or lost object."
 *   "`campaign_id` is present on every durable scoped object."
 *   "Same Cowork token can exist in two Campaigns without membership or wipeboard collision."
 *
 * The migration is the interesting one because it is the only part that touches records the
 * owner already has. It is additive and idempotent by construction: it writes an id ONLY
 * onto a record carrying none, so a second run is a no-op and a record the owner has
 * already placed is never moved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-campaign-scope-'));
const rosters = path.join(root, 'team_rosters');
const campaigns = path.join(root, 'campaigns');
const catalogs = path.join(root, 'catalogs');
const wipeboards = path.join(root, 'wipeboards');
for (const d of [rosters, campaigns, catalogs, wipeboards]) await fs.mkdir(d, { recursive: true });

process.env.RONIN_TEAM_ROSTERS_DIR = rosters;
process.env.RONIN_CAMPAIGNS_DIR = campaigns;
process.env.RONIN_CATALOGS_DIR = catalogs;
process.env.RONIN_WIPEBOARDS_DIR = wipeboards;

const { createCampaign, ensureInitialCampaign, initialCampaign } = await import('../src/campaign-config.js');
const { createTeamRoster, listTeamRosters, readTeamRoster } = await import('../src/team-rosters.js');
const { listTeamTemplates, saveTeamTemplate } = await import('../src/team-templates.js');
const {
  assertSameCampaignRoot,
  assertSameCampaignTeams,
  campaignFilter,
  campaignResolver,
  initialCampaignId,
  migrateCampaignScope,
} = await import('../src/campaign-scope.js');

test('a legacy roster written before Campaigns is re-homed, not lost or renamed', async () => {
  // Exactly the shape on disk today: flat in the store root, no campaign_id line.
  await fs.writeFile(
    path.join(rosters, 'ronin_comps.md'),
    '# ronin_comps\n\n- **title:** Ronin Comps\n- **objective:** the old work\n- **wipeboard:** ronin_comps\n- **state:** active\n',
    'utf8',
  );
  const seeded = await ensureInitialCampaign();
  assert.ok(seeded.id, 'the initial Campaign exists to migrate into');

  const done = await migrateCampaignScope();
  assert.equal(done.campaign_id, seeded.id);
  assert.deepEqual(done.rosters, ['ronin_comps']);

  const moved = await readTeamRoster('ronin_comps', seeded.id);
  assert.equal(moved?.campaign_id, seeded.id, 'it now belongs to the initial Campaign');
  assert.equal(moved?.objective, 'the old work', 'and nothing about it changed');
  assert.equal(moved?.wipeboard, 'ronin_comps', 'its board address is untouched — no file moved');

  // Re-homed means MOVED, not copied: one record, not two.
  assert.equal((await listTeamRosters()).filter((r) => r.name === 'ronin_comps').length, 1);
});

test('the migration is idempotent — a second run stamps nothing', async () => {
  const again = await migrateCampaignScope();
  assert.deepEqual(again.rosters, [], 'nothing left unmarked to stamp');
  assert.deepEqual(again.templates, []);
});

test("an unmarked record reads as the initial Campaign, and that is the only place '' is resolved", async () => {
  const initial = await initialCampaignId();
  const resolve = await campaignResolver();
  assert.equal(resolve(''), initial, 'the compatibility read');
  assert.equal(resolve('health'), 'health', 'an explicit id is never rewritten');
});

test('a filter naming no Campaign means every Campaign', async () => {
  const all = await campaignFilter([]);
  assert.equal(all(''), true);
  assert.equal(all('anything'), true);
});

test('an unmarked record still answers the filter for the initial Campaign', async () => {
  const initial = await initialCampaignId();
  const keep = await campaignFilter([initial]);
  assert.equal(keep(''), true, 'legacy rows are visible in the Campaign they migrate into');
  assert.equal(keep('somewhere-else'), false);
});

test('two Campaigns hold a Cowork of the same name, on two different boards', async () => {
  await createCampaign({ id: 'health', title: 'Health' });
  await createCampaign({ id: 'home', title: 'Home' });

  const a = await createTeamRoster('dev', { objective: 'health dev' }, 'health');
  const b = await createTeamRoster('dev', { objective: 'home dev' }, 'home');

  assert.equal(a.campaign_id, 'health');
  assert.equal(b.campaign_id, 'home');
  assert.notEqual(a.wipeboard, b.wipeboard, 'the second Cowork was allocated a free board token');
  assert.equal(a.wipeboard, 'dev', 'the first keeps the plain token');
  assert.equal(b.wipeboard, 'home-dev', 'the second is qualified by its Campaign');
});

test('a Project root may only be referenced from its own Campaign', async () => {
  const { upsertProjectRoot } = await import('../src/project-roots.js');
  await upsertProjectRoot('homeroot', { dir: root, campaign_id: 'home' });

  await assert.rejects(
    () => assertSameCampaignRoot('health', 'homeroot'),
    /belongs to Campaign "home", not "health"/,
    'refused with both Campaigns named',
  );
  await assert.doesNotReject(
    () => assertSameCampaignRoot('home', 'homeroot'),
    'its own Campaign is fine',
  );
});

test('an unknown root is the resolver’s refusal to make, not this one’s', async () => {
  // Passing an unknown handle through deliberately: the launch resolver already refuses it
  // with a better message, and two refusals for one fault is how they drift apart.
  await assert.doesNotReject(() => assertSameCampaignRoot('health', 'no-such-root'));
});

test('the same Cowork name in two Campaigns does not collide on the wipeboard', async () => {
  const all = await listTeamRosters();
  const boards = all.map((r) => r.wipeboard);
  assert.equal(new Set(boards).size, boards.length, 'every roster points at its own board');
});

test('a saved template belongs to one Campaign, and two Campaigns may both have "standard"', async () => {
  await saveTeamTemplate('standard', { team: { name: 'x', wipeboard: 'y' } }, 'health');
  await saveTeamTemplate('standard', { team: { name: 'z', wipeboard: 'w' } }, 'home');
  const rows = await listTeamTemplates();
  const standards = rows.filter((r) => r.name === 'standard');
  assert.equal(standards.length, 2, 'identity is campaign_id + name');
  assert.deepEqual(standards.map((r) => r.campaign_id).sort(), ['health', 'home']);
});

test('a template never carries the Campaign of the team it was saved from', async () => {
  await saveTeamTemplate('shape', { team: { name: 'src', wipeboard: 'b', campaign_id: 'health' } }, 'health');
  const saved = (await listTeamTemplates()).find((r) => r.name === 'shape');
  const team = saved?.draft.team as Record<string, unknown>;
  assert.equal(team.campaign_id, '', 'a template is a shape to build with, not a copy of a team');
  assert.equal(team.name, '', 'beside the name and the board, which were already blanked');
});

test('an Agent is refused a Cowork in another Campaign', async () => {
  // The Agent is unmarked, so it resolves to the initial Campaign; `dev` is in `health`.
  await assert.rejects(
    () => assertSameCampaignTeams('no-such-session', ['dev']),
    /cannot join/,
    'refused, with both Campaigns named — never silently corrected',
  );
});

test('membership inside one Campaign is untouched', async () => {
  const initial = await initialCampaign();
  await createTeamRoster('siblings', {}, initial!.id);
  await assert.doesNotReject(() => assertSameCampaignTeams('no-such-session', ['siblings']));
});

test('a tag-only team has no roster and therefore no Campaign to conflict with', async () => {
  await assert.doesNotReject(() => assertSameCampaignTeams('no-such-session', ['ghosts']));
});
