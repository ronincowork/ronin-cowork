/**
 * THE INITIAL-CAMPAIGN MIGRATION — lossless, idempotent, and one writable record.
 *
 * An install that predates Campaigns kept its one implicit body of work in `ronin.json` as
 * `campaign.{name,description}` with `desk.profile` beside it. The migration derives one
 * id from that name, seeds a `campaign_config` from those three values, and hands the
 * legacy SETTEI readers over to it — so `GET /api/settei` keeps serving the same
 * `set.campaign` and `set.desk` a client has always read, from a different home.
 *
 * The two properties worth a test each: NOTHING IS LOST (the seeded record says what
 * `ronin.json` said, and the legacy readers still answer it), and NOTHING GLOBAL MOVED
 * (owner, machine, sessions.max, agents, gbrain, wanted and setup are still `ronin.json`'s,
 * byte for byte, after the migration has run).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const campaigns = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-camp-mig-'));
const config = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-camp-cfg-'));
process.env.RONIN_CAMPAIGNS_DIR = campaigns;
process.env.RONIN_CONFIG_DIR = config;

const roninJson = path.join(config, 'ronin.json');

/** An install as it was before Campaigns existed: the two Campaign-shaped keys, and a
 *  representative slice of the global settings that must not move. */
const LEGACY = {
  campaign: { name: 'Ice Cream Vending', description: 'Run the vending business.' },
  desk: { profile: 'home' },
  owner: { name: 'glen' },
  machine: { name: 'the workshop', where: 'under my desk', monitor: false },
  sessions: { max: 12 },
  agents: { sessions: { default: { provider: 'anthropic', model: 'claude-opus-5' } }, jobs: {} },
  gbrain: { enabled: true },
  wanted: [{ kind: 'tool', name: 'gh' }],
  setup: { completed_at: '2026-08-01T00:00:00.000Z' },
  auth: { secret: 'must-never-be-touched' },
};

await fs.writeFile(roninJson, JSON.stringify(LEGACY, null, 2) + '\n', 'utf8');

const {
  ensureInitialCampaign,
  initialCampaign,
  listCampaigns,
  readCampaign,
  readCampaignSection,
  readDeskSection,
  writeCampaignSection,
  writeDeskSection,
} = await import('../src/campaign-config.js');
const { readSection } = await import('../src/user-config.js');

test('the migration seeds one Campaign from what the install already had', async () => {
  const c = await ensureInitialCampaign();
  assert.equal(c.id, 'ice-cream-vending', 'the id is DERIVED from the name, never hard-coded');
  assert.equal(c.title, 'Ice Cream Vending', 'nothing is lost');
  assert.equal(c.description, 'Run the vending business.');
  assert.equal(c.desk_profile, 'home', 'the desk_profile came with it — it is the Campaign’s');
  assert.equal(c.state, 'active');
  assert.ok(c.created_at);
  assert.equal((await listCampaigns()).length, 1, 'exactly one, never a guess among several');
});

test('it is idempotent — safe on every boot, forever', async () => {
  const first = await readCampaign('ice-cream-vending');
  await ensureInitialCampaign();
  await ensureInitialCampaign();
  assert.deepEqual(await readCampaign('ice-cream-vending'), first, 'a re-run changes nothing at all');
  assert.equal((await listCampaigns()).length, 1, 'and manufactures no second record');
});

test('the legacy SETTEI readers answer exactly what they used to, from the new home', async () => {
  // `GET /api/settei` builds set.campaign and set.desk from these two, and
  // public/js/campaign.js reads them. The shapes are the contract; the home changed.
  assert.deepEqual(await readCampaignSection(), {
    name: 'Ice Cream Vending',
    description: 'Run the vending business.',
  });
  assert.deepEqual(await readDeskSection(), { profile: 'home' });
});

test('the legacy write door lands in the Campaign record — one writable Campaign', async () => {
  await writeCampaignSection({ name: 'Ice Cream', description: 'Vending, and the vans.' });
  await writeDeskSection({ profile: 'league' });

  const c = (await readCampaign('ice-cream-vending'))!;
  assert.equal(c.title, 'Ice Cream', 'the ⚙ Campaign field wrote here');
  assert.equal(c.description, 'Vending, and the vans.');
  assert.equal(c.desk_profile, 'league');
  assert.equal(c.id, 'ice-cream-vending', 'renaming the Campaign did NOT move its id');

  // The old keys are the seed and nothing more: they are read once and never written
  // again, so they must still hold their original values rather than tracking the record.
  const stale = await readSection<{ name?: string }>('campaign', {});
  assert.equal(stale.name, 'Ice Cream Vending', 'ronin.json is no longer a Campaign writer');
});

test('GLOBAL CONFIGURATION IS UNCHANGED — only the two Campaign keys moved', async () => {
  const doc = JSON.parse(await fs.readFile(roninJson, 'utf8')) as Record<string, unknown>;
  for (const key of ['owner', 'machine', 'sessions', 'agents', 'gbrain', 'wanted', 'setup', 'auth']) {
    assert.deepEqual(doc[key], (LEGACY as Record<string, unknown>)[key], `${key} is still the install's, untouched`);
  }
  // And the file was not rewritten at all by any of the above — a migration that
  // reformatted ronin.json would be a change to every global setting's storage.
  assert.equal(await fs.readFile(roninJson, 'utf8'), JSON.stringify(LEGACY, null, 2) + '\n');
});

test('an install that never named its campaign is born with the one home Campaign (owner, 2026-08-30)', async () => {
  const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-camp-fresh-'));
  const freshCfg = await fs.mkdtemp(path.join(os.tmpdir(), 'ronin-camp-fresh-cfg-'));
  process.env.RONIN_CAMPAIGNS_DIR = fresh;
  process.env.RONIN_CONFIG_DIR = freshCfg;
  try {
    // No ronin.json at all: the ordinary state of a box being born.
    const c = await ensureInitialCampaign();
    assert.equal(c.id, 'home', 'every fresh install gets the same home Campaign');
    assert.equal(c.title, 'Ronin Home', 'named for everyone; the name is free to change afterwards');
    assert.equal(c.desk_profile, '', '“as stock” is still the answer for a box that chose none');
    assert.equal((await initialCampaign())!.id, 'home');
  } finally {
    process.env.RONIN_CAMPAIGNS_DIR = campaigns;
    process.env.RONIN_CONFIG_DIR = config;
  }
});
